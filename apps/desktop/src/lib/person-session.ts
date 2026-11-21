/**
 * La sesión de la persona vive en el motor. Un login o una salida hechos con `danil login`
 * llegan como `person-session`; la ventana los oye como `danil-connect`, igual que los del botón.
 */
import { emit as tauriEmit } from "@tauri-apps/api/event";
import { invoke as nativeInvoke } from "../engine/client.ts";
import { listen as serviceListen } from "./serviceEvents.ts";

type Listen = (event: string, handler: (event: { payload: unknown }) => void) => Promise<() => void>;
type Emit = (event: string, payload: unknown) => Promise<void>;
type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

export function bridgePersonSession(listen: Listen = serviceListen, emit: Emit = tauriEmit) {
  return listen("person-session", ({ payload }) => void emit("danil-connect", payload).catch(() => {}));
}

/** La dirección o el código que la persona pegó cuando la vuelta no llegó al motor. */
export function completeSignIn(pasted: string, invoke: Invoke = nativeInvoke) {
  return invoke("danil_sign_in_complete", { pasted });
}
