/**
 * La cuenta de Danil de Desk: iniciar sesión por el navegador del sistema contra
 * `identity` (PKCE y loopback, en Rust: `desk_auth/`), ver con qué cuenta quedó y
 * cerrar sesión. Hay una sola cuenta: cambiar de usuario es cerrar sesión y
 * entrar con otra. La ventana nunca ve tokens.
 */
import { cancelEdgeWrites } from "../../lib/edge.ts";
import { signOutPlatform } from "./free-router-session.ts";
import { invoke } from "../../lib/invoke.ts";
import { forgetMachineNames } from "../machines/known-names.ts";

export type DanilConnectState = "disconnected" | "pending" | "connected" | "error";

export type DanilConnectStatus = {
  state: DanilConnectState;
  computer_id?: string | null;
  /** El id de la persona en Danil; un motor anterior no lo manda. */
  account?: string | null;
  /** Conectada: el nombre de esta computadora. Desconectada: el sugerido (su hostname). */
  name?: string | null;
  email?: string | null;
  /** Nombre de la persona en su cuenta de Danil (`name` es el de la computadora). */
  account_name?: string | null;
  /** Ruta de la foto de la cuenta que el motor guardó en esta computadora. */
  avatar?: string | null;
  avatar_source?: "danil" | "provider" | null;
  user_code?: string | null;
  verification_uri?: string | null;
  verification_uri_complete?: string | null;
  /** Milisegundos de época en que vence el código. */
  expires_at?: number | null;
  /** El código del último fallo: `expired_token`, `access_denied`, `revoked`… */
  error?: string | null;
  /** Si la sesión con el relay de Danil está abierta. */
  online?: boolean;
};

/** Desk tiene una sola cuenta: no hay «Continuar como <correo>». */
export const ONE_CLICK_SIGN_IN = false;

/** Se conserva el tipo para quien pinta las maneras de entrar; la lista siempre está vacía. */
export type DanilConnectOption = { workspace: string; name?: string | null; email: string };

/** El código con que la ventana rechazó la orden; `command` si no la conoce. */
export function failureCode(e: unknown): string | null {
  if (!e || typeof e !== "object") return null;
  const { detail, what } = e as { detail?: unknown; what?: { clave?: unknown } };
  if (typeof detail === "string" && detail) return detail;
  if (typeof what?.clave === "string") return what.clave.split(".").pop() ?? null;
  return null;
}

/** `null` si la ventana todavía no trae la sesión de Desk. */
export async function readDanilAccount(): Promise<DanilConnectStatus | null> {
  try {
    return await invoke<DanilConnectStatus>("danil_session_status");
  } catch (e) {
    if (failureCode(e) === "command") return null;
    throw e;
  }
}

/** Sin varias cuentas no hay correos para elegir. */
export async function readDanilOptions(): Promise<DanilConnectOption[]> {
  return [];
}

const isStatus = (value: unknown): value is DanilConnectStatus =>
  !!value && typeof value === "object" && typeof (value as { state?: unknown }).state === "string";

/** Lo que tarda `danil_sign_in` en abrir el navegador antes de leer el estado. */
const SIGN_IN_STARTED_MS = 1500;

/**
 * Abre el navegador del sistema en `identity` y espera la vuelta (hasta 10 min,
 * en Rust). Si tarda, contesta con el estado actual y el resultado llega por
 * `danil-connect`. Un fallo al empezar rechaza con su código.
 */
export async function signInWithBrowser(name: string): Promise<DanilConnectStatus> {
  const running = invoke<DanilConnectStatus>("danil_sign_in", name.trim() ? { name: name.trim() } : {});
  const early = await Promise.race([
    running.then((status) => ({ status }), (error: unknown) => ({ error })),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), SIGN_IN_STARTED_MS)),
  ]);
  if (early && "status" in early && isStatus(early.status)) return early.status;
  if (early && "error" in early) {
    if (failureCode(early.error) === "cancelled") return (await readDanilAccount()) ?? { state: "disconnected" };
    throw early.error;
  }
  void running.catch(() => {});
  return (await readDanilAccount()) ?? { state: "disconnected" };
}

/** Ya no hay entrada sin navegador con el correo de un workspace: es la misma del navegador. */
export function signInWithWorkspace(name: string, _workspace: string): Promise<DanilConnectStatus> {
  return signInWithBrowser(name);
}

/** Cierra la sesión de esta instalación en `identity` y la borra del llavero; antes, el Free router suelta a la persona. */
export async function signOut(budgetMs?: number): Promise<DanilConnectStatus> {
  // Acotado y sin rechazo: la revocación corre aunque el motor siga conectando.
  await signOutPlatform(budgetMs).catch(() => {});
  cancelEdgeWrites();
  forgetMachineNames();
  return invoke<DanilConnectStatus>("danil_sign_out");
}
