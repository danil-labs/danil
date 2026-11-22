/**
 * Qué comandos conoce el motor de cada máquina. Una máquina con un motor
 * anterior sigue en servicio: el comando que no conoce apaga solo la función
 * que lo usa, nunca la máquina (`terminus-must-work-with-outdated-hosts`).
 *
 * No se pregunta antes: se sabe al llamar. El motor contesta `command` a un
 * `service invoke` que no conoce (`shell.service.command` en la frase), el
 * relay lo pasa igual y también puede contestar `unsupported` o
 * `command_not_allowed` (una función que no deja pasar). El teléfono lo
 * nombra `command_unsupported`.
 *
 * No es lo mismo el rechazo de alcance: un comando con `scope: "machine"` solo
 * pasa por el relay desde la sesión por omisión de la máquina, y desde otra el
 * relay contesta `command_not_allowed` con `{ command, scope: "machine" }`
 * (`PROVENANCE.md`, seldon-host #106/#110). El motor sí lo conoce: el teléfono
 * lo nombra `command_not_here` y no lo anota.
 */
import { APP_FEATURES, type AppCommand, type AppFeature } from "./commands.ts";

/** El código con que el teléfono dice que la máquina no conoce el comando; `detail` es el comando. */
export const COMMAND_UNSUPPORTED = "command_unsupported";
/** El código con que el teléfono dice que el comando no se puede desde esta sesión (`scope`); `detail` es el comando. */
export const COMMAND_NOT_HERE = "command_not_here";

const UNKNOWN_CODES: ReadonlySet<string> = new Set(["command", "unsupported", "command_not_allowed", "unknown_command", COMMAND_UNSUPPORTED]);
const UNKNOWN_KEY = "shell.service.command";

function keyOf(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const what = (value as { what?: unknown }).what;
  if (what && typeof what === "object" && typeof (what as { clave?: unknown }).clave === "string") return (what as { clave: string }).clave;
  const key = (value as { message_key?: unknown }).message_key;
  return typeof key === "string" ? key : null;
}

/** Si el relay lo rechazó por alcance (`command_not_allowed` con `detail.scope`), no porque el motor no lo conozca. */
export function isScopeRefusal(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, detail } = error as { code?: unknown; detail?: unknown };
  if (code === COMMAND_NOT_HERE) return true;
  return code === "command_not_allowed" && !!detail && typeof detail === "object" && typeof (detail as { scope?: unknown }).scope === "string";
}

/**
 * Si el fallo dice que la máquina no conoce el comando: por el código (el del
 * relay, el del bridge o el de la flota), por el código dentro de `detail`
 * (`command_failed` con el `Failure` del motor) o por la frase del motor.
 */
export function isUnknownCommand(error: unknown): boolean {
  if (!error || typeof error !== "object" || isScopeRefusal(error)) return false;
  const { code, detail } = error as { code?: unknown; detail?: unknown };
  if (typeof code === "string" && UNKNOWN_CODES.has(code)) return true;
  if (keyOf(error) === UNKNOWN_KEY) return true;
  if (!detail || typeof detail !== "object") return false;
  const inner = (detail as { code?: unknown }).code;
  return (typeof inner === "string" && UNKNOWN_CODES.has(inner)) || keyOf(detail) === UNKNOWN_KEY;
}

/** `yes`: contestó; `no`: no lo conoce; `unknown`: aún no se le preguntó. */
export type Support = "yes" | "no" | "unknown";

/**
 * Lo que cada máquina contestó, por comando. Lo llena quien llama (`Host.call`
 * en el teléfono) y lo lee la UI para enseñar u ocultar una función. Un fallo
 * de otro tipo (apagada, sin respuesta, un error del comando) no dice nada de
 * si lo conoce y no cambia lo anotado.
 */
export class CommandSupport {
  private book = new Map<string, Map<string, boolean>>();
  private readonly onChange?: (machine: string) => void;

  constructor(onChange?: (machine: string) => void) {
    this.onChange = onChange;
  }

  supports(machine: string, command: AppCommand): Support {
    const known = this.book.get(machine)?.get(command);
    return known === undefined ? "unknown" : known ? "yes" : "no";
  }

  /**
   * Una función se enseña si la máquina contestó su primer comando y no
   * rechazó ninguno; se oculta en cuanto rechaza uno.
   */
  feature(machine: string, feature: AppFeature): Support {
    const commands: readonly AppCommand[] = APP_FEATURES[feature];
    if (commands.some((c) => this.supports(machine, c) === "no")) return "no";
    return this.supports(machine, commands[0]);
  }

  /** Anota lo que contestó `command`: sin `error`, que lo conoce. Devuelve si el fallo era de comando desconocido. */
  note(machine: string, command: string, error?: unknown): boolean {
    const unknown = error !== undefined && isUnknownCommand(error);
    if (error !== undefined && !unknown) return false;
    const row = this.book.get(machine) ?? new Map<string, boolean>();
    const before = row.get(command);
    row.set(command, !unknown);
    this.book.set(machine, row);
    if (before !== !unknown) this.onChange?.(machine);
    return unknown;
  }

  /** Otro motor en la máquina (se reconectó): lo anotado ya no vale. */
  forget(machine: string) {
    if (this.book.delete(machine)) this.onChange?.(machine);
  }
}
