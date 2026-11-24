import { nativeInternals } from "./native.ts";
import { capabilities } from "./platform.ts";

export type LoopbackListenParams = {
  loginId: string;
  port: number;
  path: string;
  state: string;
  expiresAt: number;
};

/** Solo Desk con ventana nativa Tauri puede abrir el listener loopback en 127.0.0.1. */
export function canListenLoopback(): boolean {
  return capabilities().nativeWindow && typeof window !== "undefined" && nativeInternals() !== null;
}

/**
 * Abre un listener loopback de un solo uso en `127.0.0.1:<port>` a través del
 * comando nativo de Desk y devuelve el `target` validado del callback OAuth.
 */
export async function listenLoopbackLogin(params: LoopbackListenParams): Promise<string> {
  const native = capabilities().nativeWindow && typeof window !== "undefined" ? nativeInternals() : null;
  if (!native) throw { code: "unsupported" };
  return (await native.invoke("loopback_login_listen", params)) as string;
}

/** Cancela un listener loopback activo por `loginId` para liberar el puerto de inmediato. */
export async function cancelLoopbackLogin(loginId: string): Promise<void> {
  const native = capabilities().nativeWindow && typeof window !== "undefined" ? nativeInternals() : null;
  if (!native) return;
  await native.invoke("loopback_login_cancel", { loginId }).catch(() => {});
}
