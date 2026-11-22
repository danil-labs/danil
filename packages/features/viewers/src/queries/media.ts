import { readTreeFile } from "../../../../engine-client/src/index.ts";
import { capabilities } from "../../../../host/src/platform";
import type { LeerParte } from "../../../../host/src/tree-download";

/**
 * Un `blob:` en la web, que es lo que Safari reproduce, y un `data:` en la
 * ventana, cuya política solo deja ese (`index.html`, `media-src`).
 */
export async function urlDeArchivo(leer: LeerParte, onProgress?: (hecho: number, total: number) => void): Promise<{ url: string; liberar: () => void }> {
  const { bytes, mime } = await readTreeFile(leer, { onProgress });
  if (!capabilities().nativeWindow) {
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
    return { url, liberar: () => URL.revokeObjectURL(url) };
  }
  let binario = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { url: `data:${mime};base64,${btoa(binario)}`, liberar: () => {} };
}
