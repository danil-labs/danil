/**
 * El sellado de una credencial para una máquina (`TERMINUS-SECRET/1`, contrato
 * de credenciales § 1) con WebCrypto: X25519 + HKDF-SHA256 + AES-256-GCM. Lo
 * abre solo el motor de esa máquina con su llave de carry; el Worker guarda la
 * copia y no puede leerla.
 *
 * Sin APIs del DOM más allá de `crypto.subtle`, `atob` y `btoa`: sirve en el
 * navegador, en la ventana y en Node.
 */

const MAGIC = new TextEncoder().encode("TERMINUS-SECRET/1\n");
const INFO = new TextEncoder().encode("terminus credential v1");
/** El encabezado PKCS#8 de una llave privada X25519 cruda (RFC 8410). */
const PKCS8_X25519 = new Uint8Array([0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x6e, 0x04, 0x22, 0x04, 0x20]);
/** El valor más largo que se sella (16 KiB de texto en UTF-8). */
export const SEAL_MAX_BYTES = 16 * 1024;

export type SealOptions = {
  /** Solo para las pruebas con vectores: la llave efímera y el nonce fijos. */
  ephemeralSecret?: Uint8Array;
  nonce?: Uint8Array;
  subtle?: SubtleCrypto;
};

export function fromBase64(text: string): Uint8Array {
  const raw = atob(text);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function toBase64(bytes: Uint8Array): string {
  let raw = "";
  for (let i = 0; i < bytes.length; i += 0x8000) raw += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(raw);
}

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

const fromB64url = (text: string) => fromBase64(text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4));
// WebCrypto pide `BufferSource` sobre un `ArrayBuffer`; una vista de otro tamaño no sirve tal cual.
const buf = (bytes: Uint8Array) => bytes.slice().buffer as ArrayBuffer;

const subtleOf = (given?: SubtleCrypto): SubtleCrypto => {
  const subtle = given ?? (globalThis.crypto as Crypto | undefined)?.subtle;
  if (!subtle) throw new Error("webcrypto_unavailable");
  return subtle;
};

/** Si este entorno sabe X25519 en WebCrypto (Chrome 133+, Safari 17+, Firefox 130+, Node 20+). */
export async function canSeal(subtle?: SubtleCrypto): Promise<boolean> {
  try {
    await subtleOf(subtle).generateKey({ name: "X25519" } as unknown as AlgorithmIdentifier, false, ["deriveBits"]);
    return true;
  } catch {
    return false;
  }
}

async function ephemeral(subtle: SubtleCrypto, secret?: Uint8Array): Promise<{ privateKey: CryptoKey; publicRaw: Uint8Array }> {
  const alg = { name: "X25519" } as unknown as AlgorithmIdentifier;
  if (!secret) {
    const pair = (await subtle.generateKey(alg, true, ["deriveBits"])) as CryptoKeyPair;
    return { privateKey: pair.privateKey, publicRaw: new Uint8Array(await subtle.exportKey("raw", pair.publicKey)) };
  }
  if (secret.length !== 32) throw new Error("bad_ephemeral_secret");
  const privateKey = await subtle.importKey("pkcs8", buf(concat(PKCS8_X25519, secret)), alg, true, ["deriveBits"]);
  const jwk = await subtle.exportKey("jwk", privateKey);
  if (!jwk.x) throw new Error("bad_ephemeral_secret");
  return { privateKey, publicRaw: fromB64url(jwk.x) };
}

/**
 * Sella `value` para la máquina cuya llave pública X25519 (base64 estándar, 32
 * bytes) es `recipientPublicKeyB64`, atado a `workspaceId` y `slot` por el AAD.
 * Devuelve la copia sellada en base64 estándar, como viaja en `copies[].sealed`.
 */
export async function sealCredential(recipientPublicKeyB64: string, workspaceId: string, slot: string, value: string, options: SealOptions = {}): Promise<string> {
  const subtle = subtleOf(options.subtle);
  const recipient = fromBase64(recipientPublicKeyB64);
  if (recipient.length !== 32) throw new Error("bad_public_key");
  const plaintext = new TextEncoder().encode(value);
  if (plaintext.length > SEAL_MAX_BYTES) throw new Error("value_too_long");
  const nonce = options.nonce ?? (globalThis.crypto as Crypto).getRandomValues(new Uint8Array(12));
  if (nonce.length !== 12) throw new Error("bad_nonce");

  const alg = { name: "X25519" } as unknown as AlgorithmIdentifier;
  const eph = await ephemeral(subtle, options.ephemeralSecret);
  const recipientKey = await subtle.importKey("raw", buf(recipient), alg, false, []);
  let shared: Uint8Array;
  try {
    shared = new Uint8Array(await subtle.deriveBits({ name: "X25519", public: recipientKey } as unknown as AlgorithmIdentifier, eph.privateKey, 256));
  } catch {
    // La especificación rechaza el secreto todo en ceros (llave de orden bajo).
    throw new Error("non_contributory_key");
  }
  if (shared.every((b) => b === 0)) throw new Error("non_contributory_key");

  const ikm = await subtle.importKey("raw", buf(shared), "HKDF", false, ["deriveKey"]);
  const key = await subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: buf(concat(eph.publicRaw, recipient)), info: buf(INFO) },
    ikm,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const enc = new TextEncoder();
  const aad = concat(MAGIC, eph.publicRaw, enc.encode(workspaceId), new Uint8Array([0]), enc.encode(slot));
  const ct = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv: buf(nonce), additionalData: buf(aad), tagLength: 128 }, key, buf(plaintext)));
  return toBase64(concat(MAGIC, eph.publicRaw, nonce, ct));
}

/** Un destino de `GET …/credentials` (`recipients`). */
export type SealRecipient = { computer_id: string; public_key: string | null };

/**
 * Sella para cada destino con llave pública. Los que no la tienen todavía no
 * reciben copia: el Worker los deja `pending` y pide a otra máquina que la selle.
 */
export async function sealForRecipients(recipients: readonly SealRecipient[], workspaceId: string, slot: string, value: string, options: Omit<SealOptions, "ephemeralSecret" | "nonce"> = {}) {
  const copies: { computer_id: string; sealed: string }[] = [];
  for (const r of recipients) {
    if (!r.public_key) continue;
    copies.push({ computer_id: r.computer_id, sealed: await sealCredential(r.public_key, workspaceId, slot, value, options) });
  }
  return copies;
}
