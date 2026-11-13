/**
 * El estado de una credencial de IA, decidido en un solo sitio para Desk, la web y
 * el teléfono. Sus fuentes son `account_status` (el CLI de la máquina), cómo falló
 * esa consulta, `account_limits` (el proveedor) y `authenticated_at` (si alguna vez
 * se conectó). Cada pantalla pinta este resultado; ninguna lo vuelve a deducir.
 *
 * La regla que protege: **«no se pudo preguntar» no es «desconectada»**. Una máquina
 * apagada, un motor que no contestó a tiempo o un almacén ilegible dejan la
 * credencial intacta; solo una negativa real (el CLI dice que no hay sesión, el
 * proveedor contesta 401, nunca se conectó) es `disconnected`.
 */

export type CredentialState =
  | { kind: "connected" }
  | { kind: "disconnected"; why: "signed_out" | "revoked" }
  | { kind: "unknown"; why: "machine_off" | "unreadable" | "no_answer" }
  /** Todavía no se preguntó nada. */
  | { kind: "pending" };

export type CredentialInputs = {
  /** Lo que contestó `account_status`. `unreadable`: el motor no pudo abrir su almacén y `authenticated` es lo último que supo. */
  status?: { authenticated: boolean; unreadable?: unknown } | null;
  /** El código con que falló la última `account_status` (`machine_off`, `machine_timeout`…): entonces `status` es de antes y no cuenta. */
  statusFailure?: string | null;
  /** El `mode` de `account_limits`, si se leyó. */
  limits?: { mode: string } | null;
  /** Si alguna vez terminó bien una conexión (`list_accounts`). */
  authenticatedAt: number | null;
};

/** Lo que dice una máquina que no está encendida: la credencial no se pudo mirar, y no es un fallo que reportar. */
const ASLEEP = new Set(["machine_off", "machine_starting"]);
export const machineAsleep = (code: string | null | undefined): boolean => !!code && ASLEEP.has(code);

export function credentialState(input: CredentialInputs): CredentialState {
  const { statusFailure, limits } = input;
  const status = statusFailure ? null : input.status;
  // Cuando las dos fuentes hablan, manda la que preguntó de verdad: el proveedor.
  if (limits?.mode === "revoked") return { kind: "disconnected", why: "revoked" };
  if (status && !status.unreadable) return status.authenticated ? { kind: "connected" } : { kind: "disconnected", why: "signed_out" };
  // El CLI no contestó, pero el proveedor sí con su consumo: la cuenta funciona.
  if (limits?.mode === "read") return { kind: "connected" };
  if (status?.unreadable) return { kind: "unknown", why: "unreadable" };
  if (machineAsleep(statusFailure)) return { kind: "unknown", why: "machine_off" };
  if (statusFailure) return input.authenticatedAt === null ? { kind: "disconnected", why: "signed_out" } : { kind: "unknown", why: "no_answer" };
  if (limits?.mode === "no_account") return { kind: "disconnected", why: "signed_out" };
  return { kind: "pending" };
}
