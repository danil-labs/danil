/**
 * Los canales de máquinas locales que ofrece este equipo, según la ventana
 * (`guest_channels`): `["wsl"]` en Windows, `[]` en otro sistema.
 *
 * Solo la ventana de escritorio pregunta (`askGuestChannels` en `app/main.tsx`,
 * con `nativeWindow`). En la web `invoke` va por el relay a la máquina:
 * preguntar desde ahí la encendería. Ahí la respuesta se queda en `[]`.
 */
import { invoke } from "@tauri-apps/api/core";

let channels: Promise<string[]> = Promise.resolve([]);

/** Una vez por arranque de la ventana. */
export function askGuestChannels(): Promise<string[]> {
  channels = invoke<string[]>("guest_channels").then(
    (list) => (Array.isArray(list) ? list : []),
    () => [],
  );
  return channels;
}

export const guestChannels = (): Promise<string[]> => channels;
