/**
 * Sin computadoras en la cuenta (una organización Free no tiene VM): sus workspaces
 * corren en Danil en la computadora de la persona. El estado vacío dice qué hacer:
 * descargar Danil o abrirlo e iniciar sesión con el correo de esta sesión.
 */
import type { Fleet } from "./machines";

/** La página canónica (`apps/desktop/docs/download-urls.md`), con la barra final. */
export const DOWNLOAD_URL = "https://danil.ai/download/";

export type EmptyFleet = { download: string; email: string | null };

/**
 * `ready` es `contextReady` del proveedor: `fleet` y la lista de computadoras llegan antes que
 * sus hosts, así que una cuenta con computadoras pasa un momento por `ok` sin hosts. Sin esa
 * espera vería «Instala Danil» al abrir la app.
 */
export function emptyFleet(fleet: Fleet, ready: boolean, hosts: number, email: string | null | undefined): EmptyFleet | null {
  if (fleet !== "ok" || !ready || hosts > 0) return null;
  const clean = email?.trim();
  return { download: DOWNLOAD_URL, email: clean ? clean : null };
}

/**
 * La frase «¿Ya tienes Danil?…» vive entera en una clave; el correo se resalta sin
 * partirla en pedazos: se traduce con una marca en `{email}` y se corta en ella.
 */
export const EMAIL_MARK = "\u0000";

export function aroundEmail(phrase: string): [string, string] {
  const at = phrase.indexOf(EMAIL_MARK);
  if (at < 0) return [phrase, ""];
  return [phrase.slice(0, at), phrase.slice(at + EMAIL_MARK.length)];
}
