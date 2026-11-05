/**
 * Los canales de máquinas locales que ofrece este equipo, según la ventana
 * (`guest_channels`): `["wsl"]` en Windows, `["lima"]` en macOS, `[]` en Linux.
 *
 * Solo la ventana de escritorio pregunta (`askGuestChannels` en `app/main.tsx`,
 * con `nativeWindow`). En la web `invoke` va por el relay a la máquina:
 * preguntar desde ahí la encendería. Ahí la respuesta se queda en `[]`.
 */
import { invoke } from "@tauri-apps/api/core";
import { createRoot, createSignal } from "solid-js";

let channels: Promise<string[]> = Promise.resolve([]);
const [offered, setOffered] = createRoot(() => createSignal<string[]>([]));

/** Una vez por arranque de la ventana. */
export function askGuestChannels(): Promise<string[]> {
  channels = invoke<string[]>("guest_channels").then(
    (list) => (Array.isArray(list) ? list : []),
    () => [],
  );
  void channels.then(setOffered);
  return channels;
}

export const guestChannels = (): Promise<string[]> => channels;

/** Reactivo: una pantalla abierta antes de la respuesta se pinta cuando llega. */
export const offersGuests = (channel: string): boolean => offered().includes(channel);
