/**
 * Lo que cada máquina guarda con su propio id (tareas, portafolios, cuentas de
 * IA, spaces) viaja por el panel como `<máquina>~<id>`, para que dos máquinas
 * no choquen; workspaces, proyectos y los spaces compartidos con la cuenta
 * tienen el mismo id en todas y van tal cual.
 *
 * Ese prefijo es identidad, no ruta: la máquina de una llamada sale solo del
 * sobre. Un id de otra máquina en los argumentos se rechaza antes de mandar.
 */
import { FleetError } from "./errors.ts";

export const SEP = "~";

type Row = Record<string, unknown>;

/**
 * Llaves cuyo valor suelto es un id de la máquina que lo guarda (`task`: la de
 * `work_status`/`work_export`). `transfer` no: es del cliente, igual en origen y destino.
 */
export const OWN_KEYS: ReadonlySet<string> = new Set(["session", "parent", "portfolio", "account", "space", "task"]);
/** Listas que nombran cosas de cualquier máquina (las pestañas abiertas, las tareas cuyo git va primero): cada una recibe solo las suyas. */
export const SPREAD_KEYS: ReadonlySet<string> = new Set(["open", "priority"]);

/** Solo objetos planos: un `Channel` u otra clase viaja tal cual. */
const isRow = (v: unknown): v is Row => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

export function wrap(machine: string, id: string): string {
  return id ? `${machine}${SEP}${id}` : id;
}

/** La máquina y el id de un valor con prefijo de alguna de `machines`, o `null`. */
export function unwrap(value: string, machines: Iterable<string>): { machine: string; id: string } | null {
  let found: { machine: string; id: string } | null = null;
  for (const m of machines)
    if (value.startsWith(`${m}${SEP}`) && (!found || m.length > found.machine.length)) found = { machine: m, id: value.slice(m.length + SEP.length) };
  return found;
}

/**
 * `args` como los entiende `machine`. `remotes`, las máquinas cuyos ids van con
 * prefijo; `self`, la de la ventana, cuyos ids van sueltos (`null` en la web).
 * Lanza `cross_machine` si nombran algo de otra máquina.
 */
export function argsFor(
  args: Row,
  machine: string,
  remotes: ReadonlySet<string>,
  self: string | null,
  shared: (space: string) => boolean = () => false,
): Row {
  const walk = (value: unknown, key: string | null): unknown => {
    if ((key === "task_mentions" || key === "taskMentions") && Array.isArray(value)) return value.map((m) => mentionFor(m, machine, remotes, self));
    if (typeof value === "string") {
      const own = unwrap(value, remotes);
      if (own) {
        if (own.machine !== machine) throw new FleetError("cross_machine", own.machine, { key, machine });
        return own.id;
      }
      // Un space compartido con la cuenta tiene el mismo id en todas.
      if (key === "space" && shared(value)) return value;
      if (self !== null && machine !== self && key && OWN_KEYS.has(key) && value) throw new FleetError("cross_machine", self, { key, machine });
      return value;
    }
    if (Array.isArray(value)) {
      if (key && SPREAD_KEYS.has(key)) return mine(value, machine, remotes, self);
      return value.map((v) => walk(v, key));
    }
    if (isRow(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v, k)]));
    return value;
  };
  return walk(args, null) as Row;
}

/** Los ids de `list` que son de `machine`, como ella los conoce. */
function mine(list: unknown[], machine: string, remotes: ReadonlySet<string>, self: string | null): unknown[] {
  return list.flatMap((v) => {
    if (typeof v !== "string") return [v];
    const own = unwrap(v, remotes);
    if (own) return own.machine === machine ? [own.id] : [];
    return self === null || machine === self ? [v] : [];
  });
}

/** Lo que la ventana vio de una tarea de otra máquina al mencionarla: el motor que no la tiene lo cuenta con esto. */
const ABOUT = ["machine_name", "title", "branch", "folder_name"] as const;

/**
 * Una mención como la entiende `machine`. Una tarea suya va con su id suelto;
 * una de otra máquina, con su id de allá y `elsewhere`, porque este motor no
 * la tiene en su disco. `about` es de la ventana y no viaja.
 */
function mentionFor(value: unknown, machine: string, remotes: ReadonlySet<string>, self: string | null): unknown {
  if (!isRow(value) || !isRow(value.target) || value.target.kind !== "task" || typeof value.target.sessionId !== "string") return value;
  const { about, ...target } = value.target as Row & { about?: unknown };
  const { elsewhere, ...mention } = value as Row & { elsewhere?: unknown };
  const before = isRow(elsewhere) ? elsewhere : {};
  const own = unwrap(target.sessionId as string, remotes);
  const home = own?.machine ?? (typeof before.machine === "string" ? before.machine : self);
  const id = own?.id ?? (target.sessionId as string);
  if (!home || home === machine) return { ...mention, target: { ...target, sessionId: id } };
  const seen = { ...before, ...(isRow(about) ? about : {}) };
  const out: Row = { machine: home };
  for (const k of ABOUT) if (typeof seen[k] === "string" && seen[k]) out[k] = seen[k];
  return { ...mention, target: { ...target, sessionId: id }, elsewhere: out };
}
