/**
 * Los errores con nombre de la flota, iguales en el cliente, el relay y el
 * motor. Ninguno se convierte en una lista vacía: quien llama decide qué
 * enseñar, y una rebanada que falla conserva la anterior.
 */

/** Los acordados entre los tres repos; el relay y el motor los mandan tal cual. */
export const NAMED_ERRORS = [
  "machine_timeout",
  "machine_lost",
  "machine_off",
  "version_mismatch",
  "workspace_not_linked",
  "workspace_mismatch",
  "memory_conflict",
  "memory_busy",
] as const;
export type NamedError = (typeof NAMED_ERRORS)[number];

/**
 * Los de la flota misma, antes de mandar nada: `cross_machine` (los argumentos
 * nombran algo de otra máquina) y `unknown_machine` (el sobre nombra una que no
 * es de la cuenta).
 */
export type FleetErrorCode = NamedError | "cross_machine" | "unknown_machine" | (string & {});

export class FleetError extends Error {
  readonly code: FleetErrorCode;
  /** La máquina de la que habla: la del sobre, o la otra que nombran los argumentos. */
  readonly machine: string | null;
  readonly detail: unknown;
  /** Con `machine_off`: si la flota puede encenderla (una VM administrada) para reintentar. */
  readonly canWake: boolean;

  constructor(code: FleetErrorCode, machine: string | null, detail: unknown = null, canWake = false) {
    super(machine ? `${code} (${machine})` : code);
    this.name = "FleetError";
    this.code = code;
    this.machine = machine;
    this.detail = detail;
    this.canWake = canWake;
  }
}

export const isFleetError = (error: unknown): error is FleetError => error instanceof FleetError;

/** El rechazo de un relay o de su sesión, con nombre. */
export function fromRelay(error: unknown, machine: string): FleetError {
  if (error instanceof FleetError) return error;
  const e = (error ?? {}) as { code?: unknown; detail?: unknown };
  const code = typeof e.code === "string" ? e.code : "io";
  // `RelaySession` vence con `io/timeout`: es el mismo plazo que el relay dice `machine_timeout`.
  if (code === "io" && e.detail === "timeout") return new FleetError("machine_timeout", machine);
  // La sesión se detuvo con la VM apagada (409 del ticket): es una máquina apagada, que una acción enciende.
  if (code === "machine_stopped") return new FleetError("machine_off", machine, null, true);
  if (code === "service_version") return new FleetError("version_mismatch", machine, e.detail);
  return new FleetError(code, machine, e.detail ?? null);
}
