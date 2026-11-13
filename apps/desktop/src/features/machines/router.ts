/**
 * Las máquinas de la cuenta detrás de la ventana (`@terminus/fleet`). En el
 * escritorio, local primero: lo de esta computadora va siempre nativo y pinta
 * aunque no haya red; las otras solo suman su rebanada. En la web (`self` y
 * `native` en `null`) todo es de otras máquinas: lo guardado de cada una pinta
 * ya y lo vivo llega detrás. Cuando una rebanada cambia, la ventana vuelve a
 * leer (`harness:machine-slices`).
 *
 * La máquina de una llamada es la de la cabecera `x-terminus-machine`, o la de
 * la ventana. En el escritorio un id de otra máquina sin esa cabecera es un
 * error antes de mandar: el id no elige la máquina. En la web no hay máquina de
 * la ventana; si los argumentos nombran una sola (el id con su prefijo), la
 * llamada va allá, y si nombran dos se rechaza igual. En el escritorio `danil_*`
 * y Radiant van siempre aquí; las cuentas de IA, a la máquina de la cabecera o del
 * id, y su lista junta las de todas. Un workspace de la cuenta que esta computadora
 * no tiene se lee de sus miembros y actúa en el primero.
 */
import { type AccountWorkspace, type SystemId, callWorkspace, isDeferrable, systemOf } from "@terminus/computers";
import { AttentionBook, type Envelope, type Fleet, FleetError, type MachineInfo, type Slice, classOf, registryRow, unwrap, wrap } from "@terminus/fleet";
import { clavesConocidas, t } from "../../lib/i18n.ts";
import type { EngineWorkspace } from "./engine-workspaces.ts";

type Args = Record<string, unknown>;
type Options = { headers?: HeadersInit } | undefined;
export type Invoke = (command: string, args?: Args, options?: Options) => Promise<unknown>;
type Failure = { what: unknown; detail: unknown };

/**
 * Lecturas del contenido de un workspace: cada máquina suma su parte. `list_live_turns`
 * no: son los procesos de esta computadora, los que cerrar la ventana detiene.
 */
const FAN = new Set(["list_projects", "list_portfolios", "list_live_sessions", "list_active_turns", "list_spaces", "list_workspace_attention", "list_session_git", "list_task_mentions"]);
const CONTEXT = new Set(["add_folder", "add_repo_url", "set_workspace_source", "set_root", "list_sources", "source_freshness", "source_detail", "update_source", "remove_source", "list_source_branches", "set_source_skill"]);
const STORAGE = new Set(["list_storage", "reclaim_storage", "empty_build_cache", "collect_orphans"]);
const LISTING = new Set(["list_workspaces", "workspaces_startup"]);
/** Lo que crea algo nuevo: en un workspace que esa máquina no tiene, primero lo hace suyo. */
const CREATE = new Set(["send_message", "run_shell_command", "create_project", "clone_project", "start_project_clone"]);
/** Lo que pone una tarea de otra máquina en un space de esta ventana: el space se comparte antes. */
const WITH_SPACE = new Set([...CREATE, "create_empty_session", "move_task_to_space", "set_task_archived"]);
/** De esta computadora por definición: sus cuentas de IA, su sesión de Danil, Radiant. */
const OF_THIS_MACHINE = /(^|_)accounts?($|_)|login|^radiant_|^danil_|^account_relay_token$/;
/** Las credenciales de la cuenta son del workspace: van a la máquina que lo atiende, como las demás órdenes con `scope`. */
const ACCOUNT_CREDENTIALS = /^account_credentials?_|^github_account_/;
const ofThisMachine = (command: string) => OF_THIS_MACHINE.test(command) && !ACCOUNT_CREDENTIALS.test(command);
/** La sesión de Danil y Radiant son siempre de esta ventana; las cuentas de IA, de la máquina que nombra la cabecera o el id. */
const OF_THIS_WINDOW = /^radiant_|^danil_|^account_relay_token$|^agents_session_/;
/** Las órdenes con canal pierden el canal por el relay: vuelve solo la respuesta final. */
const CHANNELS: Record<string, string> = { clone_project: "progress", list_session_git: "progress", watch_task_tree: "changes" };
const UNKNOWN = new Set(["command", "unsupported", "command_not_allowed"]);
/** El relay no deja usar ese workspace en esa máquina. */
const REFUSED_WORKSPACE = new Set(["workspace_not_linked", "workspace_mismatch"]);
/** Lo que abre un archivo en esta computadora: el de una tarea de otra máquina está allá. */
const FILES = /^(site_|typst_live_)|^(open_file_external|tree_open_external)$/;
/** Los demás códigos del relay, con la frase que la ventana ya conoce (los de `proxy.rs`). */
const SERVICE_KEYS: Record<string, string> = {
  service_busy: "shell.service.busy",
  task_busy: "shell.service.busy",
  app_unavailable: "shell.service.engine_down",
  io: "shell.service.unreachable",
  command: "shell.service.command",
  unsupported: "shell.service.command",
  command_not_allowed: "shell.service.command",
  response_too_large: "shell.service.too_large",
};
/** Cada cuánto se vuelve a preguntar la misma lectura a otra máquina mientras la ventana la repite. */
const REFRESH_GAP = 1_500;
const NOTIFY_AFTER = 200;
/** Cuánto vale una lectura del registro de la cuenta, y cuánto espera una lista por ella. */
const REGISTRY_FOR = 30_000;
const REGISTRY_WAIT = 4_000;
/** Cuánto espera lo que la ventana no relee sola (workspaces, cuentas) a lo vivo antes de contestar con lo guardado. */
const FRESH_WAIT = 1_500;
const FIRST_ANSWER_GRACE = 100;

/** Las pestañas de `list_live_sessions` que su máquina no confirmó: la ventana no las cuenta como pedidas. */
const UNCONFIRMED = Symbol("unconfirmedOpen");
export function unconfirmedOpen(rows: unknown): readonly string[] {
  const marked = rows && typeof rows === "object" ? (rows as { [UNCONFIRMED]?: string[] })[UNCONFIRMED] : undefined;
  return marked ?? [];
}
const PROGRESSIVE = new Set([...LISTING, "list_projects", "list_portfolios", "list_live_sessions", "list_spaces", "list_workspace_attention", "list_task_mentions"]);
/** Lo que espera `service_poll` en la web: los eventos ya llegan solos (`events`). */
const POLL_WAIT = 20_000;
/** En la web no hay instalador: lo que la ventana pregunta de él se contesta aquí. */
const NO_SETUP: Record<string, unknown> = { setup_required: false, prepare_runtime: { stages: [], running: false }, list_live_turns: [] };

/** El índice de estado ligero del motor de aquí (`light_state_v1`) y sus copias de las otras máquinas (`light_state_machines_v1`). */
const LIGHT_STATE = "light_state_v1";
const LIGHT_COPIES = "light_state_machines_v1";
/** Lo que la barra lee del índice en vez de preguntar a cada máquina, y su recurso. */
const INDEXED: Record<string, "tasks" | "projects"> = { list_live_sessions: "tasks", list_projects: "projects" };
/** Cuánto vale lo leído del índice de aquí sin volver a preguntar (con la versión, `not_modified`). */
const LOCAL_INDEX_FOR = 1_000;
/** Una copia de otra máquina la rehace el motor y lo avisa (`state.copy_changed`); esto es solo por si un aviso se perdió. */
const COPY_INDEX_FOR = 30_000;

/** Qué vuelve a leer la ventana cuando cambia la rebanada de una lectura. */
export type SliceChange = "sessions" | "projects" | "spaces" | "attention" | "mentions" | "workspaces";
const CHANGES: Record<string, SliceChange> = {
  list_workspaces: "workspaces",
  workspaces_startup: "workspaces",
  list_live_sessions: "sessions",
  list_active_turns: "sessions",
  list_projects: "projects",
  list_portfolios: "projects",
  list_spaces: "spaces",
  list_workspace_attention: "attention",
  list_task_mentions: "mentions",
};

export type RouterConfig = {
  /** La máquina de la ventana; `null` en la web. */
  self: string | null;
  fleet: Fleet;
  /** El IPC de la ventana: el motor de esta computadora; `null` en la web. */
  native: Invoke | null;
  /** El registro de la cuenta (`GET /v1/workspaces`), o `null` si no se pudo leer. */
  registry?: () => Promise<AccountWorkspace[] | null>;
  /** Cambió la rebanada de otra máquina: la ventana vuelve a leer eso. */
  onSlices?: (changes: SliceChange[]) => void;
  /** Los eventos de otra máquina, ya con los ids del panel. */
  deliver?: (events: { name: string; payload: unknown }[]) => void;
  /** «Ejecutar en» para `workspace`, si la persona eligió una máquina. */
  pickedFor?: (workspace: string | null) => string | null;
  /** El directorio autorizado de la persona: nombra el workspace de una organización que la fila de su servidor no nombra. */
  directory?: () => readonly { workspace_id: string | null; name: string; owner?: boolean }[];
  /**
   * Lo que el motor de esta computadora sabe de las otras máquinas de la persona
   * (`state_machines`), de todas sus cuentas; `null` sin la función, y entonces
   * los workspaces de una organización salen de la flota.
   */
  engineWorkspaces?: () => readonly EngineWorkspace[] | null;
  /**
   * Lo que anuncia el motor de aquí. Con `light_state_v1` la barra de esta máquina
   * sale de su índice (`state_resource`) y, con `light_state_machines_v1`, la de
   * las otras de sus copias (`state_copy`), sin preguntar a cada una por el relay.
   */
  engineFeatures?: () => readonly string[];
  /** La máquina de la ventana. `os` solo si se sabe; sin `wakes`, se pinta como laptop. */
  home?: () => { wakes?: boolean; os?: SystemId | null; features?: readonly string[]; version?: string | null };
};

function headerOf(options: Options, name: string): string | null {
  try {
    return new Headers(options?.headers).get(name) || null;
  } catch {
    return null;
  }
}

function withoutHeader(options: Options, name: string): Options {
  if (!options?.headers) return options;
  const headers = new Headers(options.headers);
  headers.delete(name);
  return { ...options, headers: Object.fromEntries(headers.entries()) };
}

function withoutChannel(command: string, args: Args): Args {
  const channel = CHANNELS[command];
  if (!channel || !(channel in args)) return args;
  const { [channel]: _dropped, ...rest } = args;
  return rest;
}

/** Una copia de Git sirve para mostrar el último estado, nunca para autorizar el cierre. */
function gitSlice(slice: Slice): Slice {
  if (slice.status === "ok" || !slice.value || typeof slice.value !== "object" || Array.isArray(slice.value)) return slice;
  return { ...slice, value: Object.fromEntries(Object.entries(slice.value).map(([id, row]) =>
    [id, row && typeof row === "object" ? { ...row, stale: true } : row])) };
}

export function createRouter(config: RouterConfig) {
  const { self, fleet } = config;
  const rawNative: Invoke = config.native ?? (() => Promise.reject(new FleetError("unknown_machine", null)));
  const native: Invoke = (command, args, options) => rawNative(command, args, withoutHeader(options, "x-terminus-machine"));
  /** Con motor propio (el escritorio); sin él, la web. */
  const local = config.native !== null;
  const contextOwners = new Map<string, string>();
  const sourceCatalogs = new Map<string, Map<string, Set<string>>>();
  function rememberContexts(value: unknown) {
    const rows = (value as { workspaces?: { id?: unknown; context_root?: unknown; context_machine?: unknown }[] } | null)?.workspaces;
    for (const row of rows ?? []) {
      if (typeof row.id !== "string") continue;
      if (row.context_root && typeof row.context_machine === "string") contextOwners.set(row.id, row.context_machine);
      else contextOwners.delete(row.id);
    }
  }
  function rememberSources(command: string, machine: string, workspace: string | null, value: unknown) {
    if (command !== "list_sources" || !workspace || !Array.isArray(value)) return;
    const catalogs = sourceCatalogs.get(workspace) ?? new Map<string, Set<string>>();
    catalogs.set(machine, new Set(value.map((row) => row?.id).filter((id): id is string => typeof id === "string")));
    sourceCatalogs.set(workspace, catalogs);
  }
  function contextOwner(command: string, args: Args, workspace: string | null): string | null {
    if (!workspace || !CONTEXT.has(command)) return null;
    const source = typeof args.id === "string" ? args.id : typeof args.source === "string" ? args.source : null;
    const origins = source ? [...(sourceCatalogs.get(workspace) ?? [])].filter(([, ids]) => ids.has(source)).map(([machine]) => machine) : [];
    if (origins.length > 1) throw { what: t("projects.context.ambiguous"), detail: "context_ambiguous" };
    return origins[0] ?? contextOwners.get(workspace) ?? null;
  }

  const attention = new AttentionBook();

  /**
   * Lo leído del índice por (workspace, máquina o `null` para esta, recurso), con
   * su versión: se vuelve a pedir con ella (`not_modified`) solo si un aviso lo
   * marcó o ya pasó su tiempo.
   */
  type Indexed = { version: string | null; rows: Args[]; at: number; stale: boolean };
  const index = new Map<string, Indexed>();
  const indexReads = new Map<string, Promise<Args[] | null>>();
  const indexKey = (workspace: string, machine: string | null, resource: string) => JSON.stringify([workspace, machine, resource]);
  const announces = (feature: string) => local && (config.engineFeatures?.() ?? []).includes(feature);
  function indexed(workspace: string, machine: string | null, resource: "tasks" | "projects"): Promise<Args[] | null> {
    const key = indexKey(workspace, machine, resource);
    const known = index.get(key);
    if (known && !known.stale && Date.now() - known.at < (machine === null ? LOCAL_INDEX_FOR : COPY_INDEX_FOR)) return Promise.resolve(known.rows);
    const running = indexReads.get(key);
    if (running) return running;
    const version = known?.version ?? null;
    const ask = machine === null
      ? native("state_resource", { workspace, resource, version })
      : native("state_copy", { workspace, machine, resource, version });
    const read = ask
      .then((raw) => {
        const answer = raw as { version?: unknown; not_modified?: unknown; data?: unknown } | null;
        if (answer?.not_modified === true && known) {
          index.set(key, { ...known, at: Date.now(), stale: false });
          return known.rows;
        }
        if (!Array.isArray(answer?.data)) return null;
        const rows = (answer.data as unknown[]).filter((r): r is Args => !!r && typeof r === "object");
        index.set(key, { version: typeof answer.version === "string" ? answer.version : null, rows, at: Date.now(), stale: false });
        return rows;
      })
      // Sin copia o sin índice (otro motor), se lee como antes.
      .catch(() => {
        index.delete(key);
        return null;
      })
      .finally(() => indexReads.delete(key));
    indexReads.set(key, read);
    return read;
  }

  /** Las filas del índice para una lectura de la barra; `null` si hay que leerla como antes (una pestaña archivada que el índice no trae). */
  function fromIndex(command: string, rows: Args[], args: Args, machine: string): unknown[] | null {
    if (command === "list_projects") return rows.map((p) => projectRow(p));
    const project = typeof args.project === "string" ? args.project : "";
    const mine = rows.filter((r) => (r.folder ?? "") === project);
    const open = (fleet.argsFor(machine, args).open ?? []) as unknown[];
    const all = new Set(rows.map((r) => r.id));
    return open.every((id) => typeof id !== "string" || all.has(id)) ? mine : null;
  }

  /** Un proyecto de la copia de otra máquina (`ProjectEntry`) con los campos que la barra espera de `list_projects`. */
  const projectRow = (p: Args): Args => ({
    node: null, sources: [], created_at: 0, updated_at: 0, sessions: 0,
    kind: typeof p.remote_url === "string" && p.remote_url ? "git" : "folder",
    ...p,
  });

  /** La rebanada de otra máquina desde su copia en el motor de aquí; `null` si no la hay. */
  async function copySlice(envelope: Envelope): Promise<Slice | null> {
    const resource = INDEXED[envelope.command];
    if (!resource || !envelope.workspace || !announces(LIGHT_COPIES)) return null;
    const rows = await indexed(envelope.workspace, envelope.machine, resource);
    const value = rows && fromIndex(envelope.command, rows, envelope.args ?? {}, envelope.machine);
    if (!value) return null;
    const at = index.get(indexKey(envelope.workspace, envelope.machine, resource))?.at ?? Date.now();
    // Encendida, la copia es la de ahora; apagada, la última que dejó.
    return { machine: envelope.machine, status: fleet.power(envelope.machine) === "on" ? "ok" : "cached", has: true, value, at };
  }

  /** La barra de esta máquina desde su índice; `null` sin él o si hay que leer el disco. */
  async function localIndexed(command: string, args: Args, workspace: string | null): Promise<unknown[] | null> {
    if (command !== "list_live_sessions" || !workspace || !announces(LIGHT_STATE)) return null;
    const rows = await indexed(workspace, null, "tasks");
    return rows && fromIndex(command, rows, args, self as string);
  }
  /** Los workspaces que esta computadora tiene, según su última lista; `null` antes de leerla. */
  let listed: Set<string> | null = null;
  let active: string | null = null;
  /** Máquinas cuyo motor no sabe hacer suyo un workspace de la cuenta. */
  const stale = new Set<string>();
  const lastRead = new Map<string, number>();
  // Cambiar `open` no borra las filas ya vistas mientras llega la nueva lectura.
  const sessionReads = new Map<string, Envelope>();
  // Las lecturas con pestañas nuevas que su máquina no contestó a tiempo: la siguiente no vuelve a esperar.
  const unanswered = new Set<string>();
  let pending = new Set<SliceChange>();
  let notifyTimer: ReturnType<typeof setTimeout> | undefined;

  let registryAt = 0;
  let registryRead: Promise<void> | null = null;
  const readRegistry = (): Promise<void> => {
    if (!config.registry || Date.now() - registryAt < REGISTRY_FOR) return Promise.resolve();
    registryRead ??= config
      .registry()
      .catch(() => null)
      .then((list) => {
        registryAt = Date.now();
        // Uno que falla deja el último bueno.
        if (list) learning(() => fleet.setRegistry(list));
      })
      .finally(() => {
        registryRead = null;
      });
    return Promise.race([registryRead, new Promise<void>((done) => setTimeout(done, REGISTRY_WAIT))]);
  };

  const hasHere = (workspace: string | null) => local && (!workspace || listed === null || listed.has(workspace));
  /** Los workspaces de la cuenta que esta computadora no tiene viven en sus otras máquinas, y los de una organización en su servidor. En la web, todos. */
  const elsewhere = (workspace: string | null) => !local || (!hasHere(workspace) && (fleet.inRegistry(workspace) || organizations().has(workspace as string)));
  /** Las máquinas de un workspace; sin workspace (en la web), todas. */
  const membersOf = (workspace: string | null) => (workspace ? fleet.membersOf(workspace) : fleet.machines().map((m) => m.id));
  /** La máquina que atiende un workspace que no está aquí: la primera encendida de sus miembros, o la primera. */
  const leadOf = (workspace: string | null): string | null => {
    const members = membersOf(workspace).filter((m) => fleet.power(m) !== "outdated");
    return members.find((m) => fleet.power(m) === "on") ?? members[0] ?? null;
  };
  /** Los workspaces de `machine` que su fila dice y el registro no le atribuye: los que le da una organización. */
  const givenTo = (info: MachineInfo): string[] => {
    const registry = fleet.getRegistry();
    if (!registry || !info.linked) return [];
    return [...info.linked].filter((id) => !registry.find((w) => w.id === id)?.computers.includes(info.id));
  };
  /** Sin `organization` en su fila (un plano de control anterior), una VM con un workspace que el registro no le da es el servidor de una organización. */
  const guessed = (info: MachineInfo) => (info.organization || !info.wakes ? [] : givenTo(info));
  /** Lo que una organización (o, según el motor, otra cuenta de la persona) le da y su registro no tiene: cada workspace con su nombre y las máquinas que lo atienden. */
  const organizations = (): Map<string, { name: string; machines: string[] }> => {
    const names = new Map((config.directory?.() ?? []).filter((e) => e.workspace_id && !e.owner).map((e) => [e.workspace_id as string, e.name]));
    const known = config.engineWorkspaces?.() ?? null;
    // El motor manda: lo de todas las sesiones de aquí, que solo se va cuando él lo borra.
    if (known) return fromEngine(known, names);
    const found = new Map(fleet.organizationWorkspaces().map((w) => [w.id, { name: w.name, machines: w.machines }]));
    for (const info of fleet.machines())
      for (const id of guessed(info)) {
        const name = found.get(id)?.name ?? names.get(id);
        if (name) found.set(id, { name, machines: [...(found.get(id)?.machines ?? []), info.id] });
      }
    for (const id of found.keys()) if (fleet.inRegistry(id)) found.delete(id);
    return found;
  };
  /** Los workspaces que esta computadora no tiene y otra máquina de la persona sirve, sin los del registro (esos ya vienen en la lista). */
  const fromEngine = (known: readonly EngineWorkspace[], names: Map<string, string>) => {
    const found = new Map<string, { name: string; machines: string[] }>();
    for (const w of known) {
      const name = w.name ?? names.get(w.id);
      if (w.local || !w.machines.length || !name || fleet.inRegistry(w.id)) continue;
      found.set(w.id, { name, machines: [...w.machines] });
    }
    return found;
  };
  /** El servidor de una organización solo atiende los workspaces de ella que su fila dice: no hace suyo otro. */
  const confined = (info: MachineInfo) => !!info.organization || guessed(info).length > 0;
  /** Si el relay deja a `machine` hacer suyo `workspace`: solo uno de la cuenta, y nunca el servidor de una organización. */
  const permitted = (info: MachineInfo, workspace: string | null) =>
    !confined(info) && (!workspace || organizations().has(workspace) || !fleet.getRegistry() || !info.linked || fleet.inRegistry(workspace));
  /** Si `machine` puede hacer suyo `workspace` al crear ahí. */
  const adopts = (info: MachineInfo, workspace: string | null) => !stale.has(info.id) && permitted(info, workspace);
  /** La lista de workspaces con los de una organización que ninguna lectura trajo: la ventana puede abrirlos. */
  function withOrganizations<T>(merged: T): T {
    const rows = (merged as { workspaces?: { id?: unknown }[] } | null)?.workspaces;
    if (!Array.isArray(rows)) return merged;
    const extra = [...organizations()]
      .filter(([id]) => !rows.some((w) => w?.id === id))
      .map(([id, w]) => ({ ...registryRow({ id, name: w.name, projects: [], computers: [] }), machines: w.machines }));
    return extra.length ? { ...merged, workspaces: [...rows, ...extra] } : merged;
  }
  /** Sin elegir, lo nuevo nace en la máquina de la ventana; en un workspace que no está aquí, en su primera. */
  const defaultMachine = (workspace: string | null) => (elsewhere(workspace) ? (leadOf(workspace) ?? self) : self);

  /** Las máquinas que ya se encienden y por las que la ventana espera para volver a leer. */
  const rereadOnline = new Set<string>();
  const named = (error: FleetError): Failure => {
    const name = error.machine ? fleet.name(error.machine) : "";
    switch (error.code) {
      // La interfaz nunca ofrece mezclar máquinas: llegar al candado de la flota
      // es un bug. Se registra y la persona ve el fallo genérico, sin explicarle
      // algo que no hizo.
      case "cross_machine":
      case "unknown_machine":
        console.error(`[máquinas] bug: ${error.code}`, error.machine, error.detail);
        return { what: { clave: "shell.service.failed" }, detail: error.code };
      case "machine_off":
        // Una VM que no se pudo encender no es lo mismo que una máquina propia apagada.
        if (error.canWake && error.detail === "start_failed") return { what: t("web.machines.start_failed", { name }), detail: "start_failed" };
        if (error.machine && fleet.power(error.machine) === "starting") return { what: t("web.machines.starting", { name }), detail: "machine_starting" };
        // Una VM que Danil enciende no es «Danil cerrado»: despierta con un mensaje o una acción.
        if (error.canWake !== false && error.machine && fleet.machines().some((m) => m.id === error.machine && m.wakes)) return { what: t("web.machines.off_wakes", { name }), detail: "machine_off" };
        return { what: t("web.machines.off_action", { name }), detail: "machine_off" };
      case "version_mismatch":
        return { what: t("web.machines.outdated_action", { name }), detail: "version_mismatch" };
      case "machine_timeout":
        return { what: t("web.machines.timeout", { name }), detail: "machine_timeout" };
      case "machine_lost":
        return { what: t("web.machines.lost", { name }), detail: "machine_lost" };
      case "license_required":
        return { what: t("web.machines.license_required"), detail: "license_required" };
      case "workspace_mismatch":
        return { what: t("web.machines.workspace_mismatch", { name }), detail: "workspace_mismatch" };
      case "command_failed": {
        // El motor de allá explica por qué en `detail`, como frase o como `Failure`.
        const own = error.detail as { what?: unknown } | string | null;
        if (typeof own === "string" && own) return { what: own, detail: error.code };
        if (own && typeof own === "object" && "what" in own) return own as Failure;
        return { what: { clave: "shell.service.failed" }, detail: error.code };
      }
      case "revoked":
        return { what: t("web.revoked"), detail: "revoked" };
      case "mcp_values_over_relay":
        return { what: t("settings.tools.paste_over_relay"), detail: error.code };
      case "mcp_block_invalid":
        return { what: t("settings.tools.paste_invalid"), detail: error.code };
      case "workspace_not_linked":
        return { what: t("web.workspace_not_linked"), detail: "workspace_not_linked" };
      case "operation_failed": {
        // El motor de allá falló: su propio `Failure` viaja en `detail`.
        const own = error.detail as { what?: unknown } | string | null;
        if (typeof own === "string" || (own && typeof own === "object" && "what" in own)) return own as Failure;
        return { what: { clave: "shell.service.failed" }, detail: error.code };
      }
      default: {
        // El rechazo del motor de allá (`handler_*`…) conserva su frase y su motivo, como en `proxy.rs`.
        const own = `cli.error.${error.code}`;
        const clave = SERVICE_KEYS[error.code] ?? (clavesConocidas().has(own) ? own : "shell.service.failed");
        return { what: { clave }, detail: error.detail == null ? error.code : { code: error.code, detail: error.detail } };
      }
    }
  };
  const missing = (machine: string): Failure => ({ what: t("web.machines.missing_workspace", { name: fleet.name(machine) }), detail: "workspace_missing" });

  function notify(command: string) {
    const change = CHANGES[command];
    if (!change) return;
    pending.add(change);
    clearTimeout(notifyTimer);
    notifyTimer = setTimeout(() => {
      const changes = [...pending];
      pending = new Set();
      config.onSlices?.(changes);
    }, NOTIFY_AFTER);
  }

  /** `step` y, si con él la flota supo de un space más de la cuenta, la ventana relee las tareas. */
  function learning<T>(step: () => T): T {
    const known = fleet.sharedCount();
    const out = step();
    if (fleet.sharedCount() > known) notify("list_live_sessions");
    return out;
  }

  const differs = (a: Slice | null, b: Slice) => !a || a.status !== b.status || a.has !== b.has || JSON.stringify(a.value) !== JSON.stringify(b.value);

  /** Pregunta otra vez a `envelope.machine` si hace rato que no; si su rebanada cambió, la ventana relee. */
  function refresh(envelope: Envelope, before: Slice | null) {
    const id = JSON.stringify([envelope.machine, envelope.command, envelope.workspace, envelope.args]);
    const last = lastRead.get(id) ?? 0;
    if (Date.now() - last < REFRESH_GAP) return;
    lastRead.set(id, Date.now());
    void fleet.read(envelope).then(
      (slice) => {
        if (differs(before, slice)) notify(envelope.command);
      },
      () => {},
    );
  }

  /**
   * Lo de cada máquina: lo guardado ya, y se relee detrás (si cambia, la ventana
   * relee); la que no tiene nada guardado de esta lectura se espera. Con `fresh`, lo que la ventana no vuelve a leer sola (la lista de
   * workspaces, las cuentas) espera a lo vivo un momento (`FRESH_WAIT`). Solo sin
   * nada guardado de ninguna (ni el registro de la cuenta, con `settles`) se
   * espera a que contesten, con su tope. Una apagada con copia contesta de su copia sin preguntar.
   */
  async function gather(envelopes: Envelope[], { settles = false, fresh = false } = {}): Promise<Slice[]> {
    if (PROGRESSIVE.has(envelopes[0]?.command)) return gatherAvailable(envelopes, settles);
    const before = envelopes.map((envelope) => fleet.peek(envelope));
    if (!settles && !before.some((b) => b?.has)) return Promise.all(envelopes.map((e) => fleet.read(e)));
    if (!fresh) {
      // La que tiene algo guardado de esta lectura contesta ya; la que no, se espera con su tope.
      return Promise.all(
        envelopes.map((envelope, i) => {
          const kept = before[i];
          if (!kept?.has) return fleet.read(envelope);
          refresh(envelope, kept);
          return kept;
        }),
      );
    }
    const live = Promise.all(envelopes.map((e) => fleet.read(e)));
    const quick = await Promise.race([live, new Promise<null>((done) => setTimeout(() => done(null), FRESH_WAIT))]);
    if (quick) return quick;
    void live.then(
      (slices) => {
        if (slices.some((slice, i) => differs(before[i], slice))) notify(envelopes[0]?.command ?? "");
      },
      () => {},
    );
    return before.filter((b): b is Slice => !!b);
  }

  /** La primera máquina con datos libera la lista; las pendientes conservan su última rebanada y avisan al contestar. */
  async function gatherAvailable(envelopes: Envelope[], settles: boolean): Promise<Slice[]> {
    const slices = envelopes.map(previousSlice);
    let returned = false;
    let finish!: () => void;
    const available = new Promise<void>(resolve => { finish = resolve; });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const soon = () => { timer ??= setTimeout(finish, FIRST_ANSWER_GRACE); };
    if (settles || slices.some(slice => slice?.has)) timer = setTimeout(finish, 0);
    const live = envelopes.map(async (envelope, i) => {
      const before = slices[i];
      const slice = await fleet.read(envelope);
      slices[i] = slice;
      if (envelope.command === "list_live_sessions" && slice.has) sessionReads.set(JSON.stringify([envelope.machine, envelope.workspace, envelope.args?.project]), envelope);
      if (returned) {
        if (differs(before, slice)) notify(envelope.command);
      } else if (slice.has) soon();
    });
    await Promise.race([Promise.all(live), available]);
    returned = true;
    clearTimeout(timer);
    return slices.filter((slice): slice is Slice => !!slice);
  }

  /** Nadie trajo nada: se dice por qué, y la ventana se queda con lo que tenía. */
  function noAnswer(slices: Slice[], workspace: string | null): Failure {
    const failed = slices.find((s) => s.error) ?? slices[0];
    const code = failed?.status === "outdated" ? "version_mismatch" : failed?.error === "machine_off" || !failed ? "machine_off" : (failed.error ?? "machine_timeout");
    const machine = failed?.machine ?? leadOf(workspace);
    // Leer nunca enciende una máquina: la enciende un mensaje o una acción (`fleet.send`).
    // Si ya se está encendiendo (la encendió otro), la ventana vuelve a leer cuando esté en línea.
    if (code === "machine_off" && machine && fleet.power(machine) === "starting" && !rereadOnline.has(machine)) {
      rereadOnline.add(machine);
      void fleet
        .untilOnline(machine)
        .then(() => config.onSlices?.(["workspaces", "projects", "sessions", "spaces", "attention", "mentions"]))
        .catch(() => {})
        .finally(() => rereadOnline.delete(machine));
    }
    // Una lectura no sabe si el relay la encendería: lo dice la lista de la cuenta (`wakes`).
    return named(new FleetError(code, machine, null, code === "machine_off"));
  }

  /**
   * Las pestañas de esa máquina que ninguna de sus rebanadas del workspace conoce
   * (una tarea recién creada), con el id del panel. Una pestaña sin fila en
   * ninguna carpeta cierra la vista: solo la respuesta de su máquina a este
   * `open` puede confirmarlo. Una máquina sin lecturas aquí no retrasa la lista.
   */
  function unknownOpen(envelope: Envelope): string[] {
    if (envelope.command !== "list_live_sessions") return [];
    const open = fleet.argsFor(envelope.machine, envelope.args ?? {}).open;
    if (!Array.isArray(open) || open.length === 0 || fleet.peek(envelope)?.has) return [];
    let seen = false;
    const known = new Set<unknown>();
    for (const [key, read] of sessionReads) {
      const [machine, workspace] = JSON.parse(key) as [string, string | null];
      const slice = machine === envelope.machine && workspace === envelope.workspace ? fleet.peek(read) : null;
      if (!slice?.has || !Array.isArray(slice.value)) continue;
      seen = true;
      for (const row of slice.value) if (row && typeof row === "object") known.add((row as { id?: unknown }).id);
    }
    return seen ? open.filter((id): id is string => typeof id === "string" && !known.has(id)).map(id => wrap(envelope.machine, id)) : [];
  }

  /**
   * La lectura de una máquina con pestañas que nadie conoce: se espera su
   * respuesta un momento (`FRESH_WAIT`). Si no llega o falla, contesta lo
   * anterior de esa máquina, esas pestañas quedan sin confirmar y la siguiente
   * lectura ya no espera; lo que llegue tarde avisa a la ventana para releer.
   */
  async function openRead(envelope: Envelope, unknown: string[], unconfirmed: string[]): Promise<Slice | null> {
    const before = previousSlice(envelope);
    const key = JSON.stringify([envelope.machine, envelope.workspace, fleet.argsFor(envelope.machine, envelope.args ?? {})]);
    if (unanswered.has(key)) refresh(envelope, before);
    else {
      const live = fleet.read(envelope);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const slice = await Promise.race([live, new Promise<null>(done => { timer = setTimeout(() => done(null), FRESH_WAIT); })]).finally(() => clearTimeout(timer));
      if (slice?.has) {
        sessionReads.set(JSON.stringify([envelope.machine, envelope.workspace, envelope.args?.project]), envelope);
        return slice;
      }
      unanswered.add(key);
      if (!slice) void live.then(late => { if (late.has && differs(before, late)) notify(envelope.command); }, () => {});
    }
    unconfirmed.push(...unknown);
    return before;
  }

  function previousSlice(envelope: Envelope): Slice | null {
    const slice = fleet.peek(envelope);
    if (envelope.command !== "list_live_sessions") return slice;
    const key = JSON.stringify([envelope.machine, envelope.workspace, envelope.args?.project]);
    if (slice?.has) {
      sessionReads.set(key, envelope);
      return slice;
    }
    const previous = sessionReads.get(key);
    const kept = previous ? fleet.peek(previous) : null;
    return kept?.has ? { ...kept, status: "cached" } : slice;
  }

  /** Una lectura de la barra: lo de aquí ya, más lo último de cada otra máquina del workspace. */
  async function fanRead(command: string, args: Args, workspace: string | null, options: Options): Promise<unknown> {
    const members = command === "list_workspace_attention" ? fleet.machines().map((m) => m.id) : fleet.membersOf(workspace);
    // El canal de avance se queda en la ventana: por el relay vuelve solo la respuesta final.
    const envelopes = members.map((machine) => ({ machine, workspace, command, args: withoutChannel(command, args) }));
    const slices: Slice[] = [];
    const unconfirmed: string[] = [];
    // Lo que las copias del motor de aquí ya tienen no se pregunta a su máquina.
    const copies = await Promise.all(envelopes.map((envelope) => copySlice(envelope)));
    const asked = envelopes.filter((_, i) => !copies[i]);
    slices.push(...copies.filter((slice): slice is Slice => !!slice));
    if (!elsewhere(workspace)) {
      const value = (await localIndexed(command, args, workspace)) ?? (await native(command, fleet.argsFor(self as string, args), options));
      slices.unshift({ machine: self as string, status: "ok", has: true, value, at: Date.now() });
      const remoteSlices = await Promise.all(asked.map(async envelope => {
        const unknown = unknownOpen(envelope);
        if (unknown.length) return openRead(envelope, unknown, unconfirmed);
        const before = previousSlice(envelope);
        refresh(envelope, before);
        return before;
      }));
      slices.push(...remoteSlices.filter((slice): slice is Slice => !!slice));
    } else if (asked.length) {
      // El refresco remoto de Git depende de que la observación local haya terminado en el motor.
      const opening = asked.map(unknownOpen);
      const result = command === "list_session_git"
        ? await Promise.all(asked.map(envelope => fleet.read(envelope)))
        : (await Promise.all([
            gather(asked.filter((_, i) => !opening[i].length)),
            ...asked.map((envelope, i) => (opening[i].length ? openRead(envelope, opening[i], unconfirmed).then(slice => (slice ? [slice] : [])) : null)).filter(read => !!read),
          ])).flat();
      slices.push(...result);
    }
    if (command === "list_workspace_attention") for (const s of slices) if (s.has) attention.set(s.machine, fleet.encode(s.machine, s.value));
    const merged = learning(() => fleet.merge(command, command === "list_session_git" ? slices.map(gitSlice) : slices, workspace));
    if (Array.isArray(merged) && unconfirmed.length) Object.defineProperty(merged, UNCONFIRMED, { value: unconfirmed });
    if (merged !== undefined) return merged;
    throw noAnswer(slices, workspace);
  }

  /** Una llamada a otra máquina. Crear algo en un workspace que esa máquina no acepta se dice con su nombre. */
  async function remote(machine: string, command: string, args: Args, workspace: string | null): Promise<unknown> {
    if (!CREATE.has(command)) return remoteCall(machine, command, args, workspace);
    try {
      return await remoteCall(machine, command, args, workspace);
    } catch (error) {
      if (error instanceof FleetError && REFUSED_WORKSPACE.has(error.code))
        throw { what: t("web.machines.workspace_refused", { name: fleet.name(machine) }), detail: error.code };
      throw error;
    }
  }

  /** Una llamada a otra máquina, con el workspace del sobre. Una lectura sale de su rebanada: apagada con copia, no se pregunta. */
  async function remoteCall(machine: string, command: string, args: Args, workspace: string | null): Promise<unknown> {
    args = withoutChannel(command, args);
    // Apagada o encendiéndose, el resumen de la máquina sale de su copia (la de
    // la flota o la del relay) con su hora, sin encenderla: es una lectura.
    if (command === "list_workspaces" && fleet.power(machine) !== "on") {
      const slice = await fleet.read({ machine, workspace: null, command, args });
      if (!slice.has || !slice.value || typeof slice.value !== "object") throw new FleetError("machine_off", machine);
      return { ...(fleet.encode(machine, slice.value, command) as object), cached_at: slice.at };
    }
    if (STORAGE.has(command) || command === "list_workspaces" || command === "workspaces_startup" || command === "set_provider_consent") {
      if (fleet.power(machine) !== "on") throw new FleetError("machine_off", machine);
      if (STORAGE.has(command) && !workspace) throw missing(machine);
      return fleet.call({ machine, workspace: command === "list_workspaces" ? null : workspace, command, args });
    }
    if (CREATE.has(command) && workspace && fleet.inRegistry(workspace) && !fleet.membersOf(workspace).includes(machine)) await materialize(machine, workspace);
    if (WITH_SPACE.has(command)) args = await withSharedSpace(machine, workspace, args);
    if (command === "load_history") {
      const session = await remoteCall(machine, "load_session", {
        project: args.project, id: args.id,
        history_request: { version: 1, before: args.before ?? null, revision: args.revision ?? null },
      }, workspace) as { turns?: unknown[]; history?: unknown } | null;
      if (session?.history) return session;
      const total = Array.isArray(session?.turns) ? session.turns.length : 0;
      return { ...session, history: { total, start: 0, end: total, limit: total, has_more: false } };
    }
    const envelope = { machine, workspace, command, args };
    // Apagada no hay turnos ni árbol que revisar: archivar sigue y se aplaza.
    if (command === "task_blockers" && fleet.power(machine) === "off") return { unsaved: [], not_finished: false };
    if (classOf(command) !== "read") {
      const value = await fleet.call(envelope);
      // Con la máquina apagada el relay la guardó y su copia ya la refleja: la lista se relee de allá.
      if (isDeferrable(command)) deferredChanged(machine);
      return value;
    }
    const slice = await fleet.read(envelope);
    if (!slice.has) throw noAnswer([slice], workspace);
    rememberSources(command, machine, workspace, slice.value);
    return fleet.encode(machine, command === "list_session_git" ? gitSlice(slice).value : slice.value, command);
  }

  /** Cambió la cola de aplazadas de `machine`: sus lecturas salen otra vez al relay ya, sin esperar el respiro. */
  function deferredChanged(machine: string) {
    for (const id of [...lastRead.keys()]) if (id.startsWith(`[${JSON.stringify(machine)},`)) lastRead.delete(id);
    notify("list_live_sessions");
    notify("list_spaces");
  }

  /**
   * Lo nuevo en otra máquina nace en el space de la ventana: uno que aún no es
   * de la cuenta se comparte antes (`share_space`) en la máquina que lo guarda
   * (esta computadora, o en la web la de su prefijo), y allá se crea con el mismo
   * id. Si no se puede compartir (workspace sin cuenta, motor anterior), nace sin space.
   */
  async function withSharedSpace(machine: string, workspace: string | null, args: Args): Promise<Args> {
    const space = args.space;
    if (typeof space !== "string" || !space) return args;
    const own = unwrap(space, fleet.remotes());
    const id = own?.id ?? space;
    if (fleet.isShared(id)) return own ? { ...args, space: id } : args;
    if (own?.machine === machine) return args;
    try {
      if (own) await fleet.call({ machine: own.machine, workspace, command: "share_space", args: { id } });
      else if (local) await native("share_space", { id });
      else return { ...args, space: null };
      fleet.markShared(id);
      return { ...args, space: id };
    } catch {
      return { ...args, space: null };
    }
  }

  /** Una máquina que no tiene el workspace de algo nuevo lo hace suyo primero, con el mismo id. */
  async function materialize(machine: string, workspace: string) {
    if (stale.has(machine)) throw missing(machine);
    try {
      // Por el relay toda llamada dice su workspace (seldon-host #106): el que se hace suyo.
      await fleet.call({ machine, workspace, command: "materialize_workspace", args: { id: workspace } });
    } catch (error) {
      const code = error instanceof FleetError ? error.code : null;
      if (!code || !UNKNOWN.has(code)) throw error;
      stale.add(machine);
      throw missing(machine);
    }
  }

  async function listing(command: string, args: Args, options: Options): Promise<unknown> {
    await readRegistry();
    if (!local) return webListing(command, args);
    const value = (await native(command, args, options)) as { workspaces?: { id?: unknown }[]; active?: unknown } | null;
    if (Array.isArray(value?.workspaces)) listed = new Set(value.workspaces.map((w) => w?.id).filter((id): id is string => typeof id === "string"));
    if (active === null && typeof value?.active === "string") active = value.active;
    const merged = withOrganizations(fleet.merge(command, [{ machine: self as string, status: "ok", has: true, value, at: Date.now() }], null) as { active?: unknown } | undefined);
    if (!merged) return value;
    // El activo es el de esta ventana, aunque sea un workspace que solo tienen otras máquinas.
    return active && elsewhere(active) ? { ...merged, active } : merged;
  }

  /** En la web: ninguna máquina ni el registro dijeron los workspaces la última vez. */
  let unlisted = false;
  /** Los workspaces en la web: los del registro de la cuenta ya, más lo que lista cada máquina. El activo es de esta página. */
  async function webListing(command: string, args: Args): Promise<unknown> {
    const envelopes = fleet.machines().map((m) => ({ machine: m.id, workspace: null, command, args }));
    const slices = await gather(envelopes, { settles: !!fleet.getRegistry(), fresh: true });
    const merged = withOrganizations(fleet.merge(command, slices, null) as { workspaces?: { id?: unknown }[]; active?: unknown } | undefined);
    unlisted = !merged;
    if (!merged) throw noAnswer(slices, null);
    const ids = (merged.workspaces ?? []).map((w) => w?.id).filter((id): id is string => typeof id === "string");
    // Una máquina sin workspaces no deja la página sin ninguno abierto: el primero de la cuenta.
    if (!active || !ids.includes(active)) active = typeof merged.active === "string" && ids.includes(merged.active) ? merged.active : (ids[0] ?? null);
    rememberContexts(merged);
    return { ...merged, active };
  }

  async function poll(args: Args, options: Options): Promise<unknown> {
    if (!local) return webPoll();
    const page = (await native("service_poll", args, options)) as { batches?: { events?: { name: string; payload: unknown }[] }[] } | null;
    // El `attention` de aquí habla solo de esta máquina: la ventana recibe la lista de todas.
    if (page && Array.isArray(page.batches) && fleet.machines().length)
      page.batches = page.batches.map((b) =>
        Array.isArray(b?.events) ? { ...b, events: b.events.map((e) => (e.name === "attention" ? { ...e, payload: attention.update(self as string, e.payload) } : e)) } : b,
      );
    return page;
  }

  /** En la web los eventos de cada máquina llegan solos (`events`); el sondeo solo marca el paso. */
  let tick = 0;
  const pollers = new Set<() => void>();
  function webPoll(): Promise<unknown> {
    return new Promise((done) => {
      const finish = () => {
        clearTimeout(timer);
        pollers.delete(finish);
        tick += 1;
        done({ cursor: tick, gap: false, replay: false, runtime: "fleet", reset: false });
      };
      const timer = setTimeout(finish, POLL_WAIT);
      pollers.add(finish);
    });
  }

  const selfMaterializes = (_workspace: string | null) => ({ materializes: true });

  function machineList() {
    const workspace = active;
    const lead = defaultMachine(workspace);
    const members = new Set(fleet.membersOf(workspace));
    const home = config.home?.();
    const selfOs = systemOf(home?.os);
    return [
      ...(self !== null ? [{ id: self, local: true, active: lead === self, on: true, power: "on" as const, hosts: hasHere(workspace), ...selfMaterializes(workspace), wakes: home?.wakes ?? false, ...(home?.features?.length ? { features: [...home.features] } : {}), ...(home?.version ? { version: home.version } : {}), ...(selfOs ? { os: selfOs } : {}) }] : []),
      // Una de otro contrato no corre tareas nuevas hasta actualizarse.
      ...fleet.machines().filter((m) => fleet.power(m.id) !== "outdated").map((m) => {
        const os = systemOf(m.os);
        return {
          id: m.id,
          local: false,
          active: lead === m.id,
          on: fleet.power(m.id) === "on",
          connection: fleet.state(m.id),
          power: fleet.power(m.id),
          hosts: workspace ? members.has(m.id) : null,
          materializes: adopts(m, workspace),
          refuses: !permitted(m, workspace),
          wakes: m.wakes,
          ...(m.features?.length ? { features: [...m.features] } : {}),
          ...(m.version ? { version: m.version } : {}),
          ...(os ? { os } : {}),
        };
      }),
    ];
  }

  /**
   * En la web los ids de otra máquina llevan su prefijo. Si los argumentos
   * nombran una sola, esa es la máquina de la llamada; si nombran dos, `null`
   * y el candado de la flota la rechaza.
   */
  const OWN_ARG = new Set(["id", "session", "parent", "portfolio", "account", "space", "task"]);
  function homeOf(args: Args): string | null {
    const found = new Set<string>();
    const walk = (value: unknown, key: string | null): void => {
      if (typeof value === "string") {
        if (!key || !OWN_ARG.has(key)) return;
        const own = unwrap(value, fleet.remotes());
        if (own) found.add(own.machine);
        return;
      }
      if (Array.isArray(value)) {
        for (const item of value) walk(item, key);
        return;
      }
      if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) return;
      for (const [k, item] of Object.entries(value as Record<string, unknown>)) walk(item, k);
    };
    walk(args, null);
    return found.size === 1 ? [...found][0] : null;
  }

  /** Lo de una máquina sin máquina en el sobre, en la web: las cuentas de todas juntas; lo demás, en la que nombra el id o en la que atiende el workspace. */
  async function ofAMachine(command: string, args: Args, workspace: string | null): Promise<unknown> {
    if (command === "list_accounts") {
      const envelopes = membersOf(workspace).map((machine) => ({ machine, workspace, command, args }));
      const slices = await gather(envelopes, { fresh: true });
      const merged = fleet.merge(command, slices, workspace);
      if (merged !== undefined) return merged;
      throw noAnswer(slices, workspace);
    }
    const named = homeOf(args);
    const lead = (named && fleet.has(named) ? named : null) ?? leadOf(workspace) ?? leadOf(null);
    if (!lead) throw { what: t("web.machines.none_for_workspace"), detail: "no_machine" };
    return remote(lead, command, args, callWorkspace(workspace, args));
  }

  /** En el escritorio, las cuentas de esta computadora y las de las demás, agrupadas como en la web: cada una con sus máquinas. */
  async function accountsHere(args: Args, workspace: string | null, options: Options): Promise<unknown> {
    const value = await native("list_accounts", args, options);
    const envelopes = fleet.machines().map((m) => ({ machine: m.id, workspace, command: "list_accounts", args }));
    const others = await gather(envelopes, { fresh: true }).catch(() => [] as Slice[]);
    const merged = fleet.merge("list_accounts", [{ machine: self as string, status: "ok", has: true, value, at: Date.now() }, ...others.filter((s) => s.has)], workspace);
    return merged === undefined ? value : merged;
  }

  async function handle(command: string, args: Args = {}, options?: Options): Promise<unknown> {
    if (command === "machine_list") return machineList();
    if (command === "machine_select") {
      const id = args.id;
      if (typeof id === "string" && (id === self || fleet.has(id))) return { runtime: null };
    }
    const machine = headerOf(options, "x-terminus-machine");
    const workspace = command === "list_workspaces" ? null : headerOf(options, "x-terminus-workspace") ?? active;
    if (command === "list_workspaces") options = withoutHeader(options, "x-terminus-workspace");
    if (command === "handler_action") {
      const input = args.input as Args | undefined;
      if (!local || !self || !input || (machine && machine !== self) || namesOther(input) || elsewhere(workspace))
        throw { what: t("shell.machines.local_only"), detail: "handler_local_only" };
      return native(command, { input: fleet.argsFor(self, input) }, options);
    }
    if (STORAGE.has(command) && !workspace) throw { what: { clave: "shell.service.failed" }, detail: "workspace_missing" };
    if (local && ofThisMachine(command)) {
      if (OF_THIS_WINDOW.test(command)) return native(command, args, options);
      try {
        // Los chips de una cuenta actúan en su máquina: la de la cabecera o la que nombra el id.
        const there = machine && machine !== self && fleet.has(machine) ? machine : homeOf(args);
        if (there && fleet.has(there)) return await remote(there, command, args, callWorkspace(workspace, args));
        if (machine && machine !== self) throw new FleetError("unknown_machine", machine);
        // Workspace que vive en otra máquina (la VM de la organización): sus cuentas, allá.
        if (!machine && elsewhere(workspace)) return await ofAMachine(command, args, workspace);
        if (command === "list_accounts" && fleet.machines().length) return await accountsHere(args, workspace, withoutHeader(options, "x-terminus-machine"));
      } catch (error) {
        if (error instanceof FleetError) throw named(error);
        throw error;
      }
      return native(command, args, withoutHeader(options, "x-terminus-machine"));
    }
    if (!local && command in NO_SETUP) return NO_SETUP[command];
    if (FILES.test(command) && ((machine && machine !== self && fleet.has(machine)) || namesOther(args)))
      throw { what: t("shell.machines.local_only"), detail: "machine_files" };
    try {
      if (machine && machine === self && (STORAGE.has(command) || command === "list_workspaces" || command === "workspaces_startup" || command === "set_provider_consent")) {
        if (STORAGE.has(command) && !hasHere(workspace)) throw missing(machine);
        return await native(command, fleet.argsFor(machine, args), withoutHeader(options, "x-terminus-machine"));
      }
      // Elegida esta computadora para algo nuevo: se crea aquí aunque el workspace viva en otra.
      if (local && machine && machine === self && (CREATE.has(command) || command === "get_project_directory")) {
        const opts = withoutHeader(options, "x-terminus-machine");
        if (CREATE.has(command) && workspace && !hasHere(workspace)) {
          await native("materialize_workspace", { id: workspace }, opts);
          listed?.add(workspace);
        }
        return await native(command, fleet.argsFor(self, args), opts);
      }
      if (machine && machine !== self && fleet.has(machine)) return await remote(machine, command, args, callWorkspace(workspace, args));
      // Una máquina que ya no es de la cuenta no se cambia por otra en silencio.
      if (machine && machine !== self) throw new FleetError("unknown_machine", machine);
      if (!local && ofThisMachine(command)) return await ofAMachine(command, args, workspace);
      if (!local) {
        const named = homeOf(args);
        if (named && fleet.has(named)) return await remote(named, command, args, callWorkspace(workspace, args));
      }
      const opts = withoutHeader(options, "x-terminus-machine");
      if (command === "set_active_workspace" && typeof args.id === "string") {
        const id = args.id;
        // En la web el activo es de la página: el relay no lo cambia en ninguna máquina.
        if (elsewhere(id)) {
          active = id;
          return null;
        }
        const value = await native(command, args, opts);
        active = id;
        return value;
      }
      if (LISTING.has(command)) return await listing(command, args, opts);
      if (command === "service_poll") return await poll(args, opts);
      if (FAN.has(command)) return await fanRead(command, args, workspace, opts);
      const context = !local ? contextOwner(command, args, workspace) : null;
      if (context) return await remote(context, command, args, callWorkspace(workspace, args));
      if (elsewhere(workspace)) {
        const lead = leadOf(workspace);
        if (lead) return await remote(lead, command, args, callWorkspace(workspace, args));
        if (!local) throw { what: t("web.machines.none_for_workspace"), detail: "no_machine" };
      }
      const value = await native(command, fleet.argsFor(self as string, args), opts);
      rememberSources(command, self as string, workspace, value);
      if (command === "remove_workspace" && args.id === active) active = null;
      return value;
    } catch (error) {
      if (error instanceof FleetError) throw named(error);
      throw error;
    }
  }

  const namesOther = (args: Args) => {
    if (self === null) return true;
    try {
      fleet.argsFor(self, args);
      return false;
    } catch {
      return true;
    }
  };

  /** Eventos de otra máquina: `attention` sale como la lista de todas. */
  function events(machine: string, list: { name: string; payload: unknown }[]) {
    // Un cambio de tarea, carpeta, portafolio o espacio (`cli-changed`)
    // invalida el intervalo: la relectura que dispara el evento debe consultar
    // la VM aunque acabemos de leer su lista.
    if (list.some((event) => event.name === "session" || event.name === "cli-changed")) {
      for (const id of lastRead.keys()) {
        const [owner, command] = JSON.parse(id) as [string, string];
        if (owner === machine && FAN.has(command)) lastRead.delete(id);
      }
    }
    // `machine-usage` no dice de qué máquina es: el panel «Máquinas» relee la suya.
    config.deliver?.(list.map((e) => (e.name === "attention" ? { ...e, payload: attention.update(machine, e.payload) }
      : e.name === "machine-usage" && e.payload && typeof e.payload === "object" ? { ...e, payload: { ...e.payload, machine } } : e)));
  }

  /** Dónde se crea algo nuevo de `workspace` ahora y si esa máquina lo encabeza; `null` si ninguna puede. */
  function createsOn(workspace: string | null): { machine: string; lead: boolean } | null {
    const ws = workspace ?? active;
    const picked = config.pickedFor?.(ws) ?? null;
    const lead = defaultMachine(ws);
    // Una elegida que no tiene permiso en este workspace no cuenta: «Ejecutar en» no la ofrece aquí.
    const runs = (id: string) => (id === self ? true : !!fleet.info(id) && (!ws || fleet.membersOf(ws).includes(id) || permitted(fleet.info(id) as MachineInfo, ws)));
    const machine = picked && runs(picked) ? picked : lead;
    return machine ? { machine, lead: machine === lead } : null;
  }

  /** `state.changed` de esta máquina: lo leído de ese recurso se vuelve a pedir con su versión. */
  function stateChanged(payload: unknown) {
    const { workspace, resource } = (payload ?? {}) as { workspace?: unknown; resource?: unknown };
    if (typeof workspace !== "string" || typeof resource !== "string") return;
    const known = index.get(indexKey(workspace, null, resource));
    if (known) known.stale = true;
  }

  /** `state.copy_changed`: cambió la copia de otra máquina; solo ese recurso se vuelve a pedir y la barra lo relee. */
  function copyChanged(payload: unknown) {
    const { workspace, machine, resource } = (payload ?? {}) as { workspace?: unknown; machine?: unknown; resource?: unknown };
    if (typeof workspace !== "string" || typeof machine !== "string" || typeof resource !== "string") return;
    const known = index.get(indexKey(workspace, machine, resource));
    if (known) known.stale = true;
    if (workspace !== active) return;
    if (resource === "tasks") notify("list_live_sessions");
    if (resource === "projects") notify("list_projects");
  }

  return {
    handle,
    events,
    stateChanged,
    copyChanged,
    deferredChanged,
    createsOn,
    activeWorkspace: () => active,
    /** Si nadie dijo los workspaces la última vez: al encenderse una máquina, la ventana los vuelve a leer. */
    unlisted: () => unlisted,
    forget(machine: string) {
      attention.forget(machine);
      for (const [key, envelope] of sessionReads) if (envelope.machine === machine) sessionReads.delete(key);
    },
    /** El registro de la cuenta cambió (un workspace recién vinculado): la próxima lista lo vuelve a leer. */
    registryChanged() {
      registryAt = 0;
    },
    close() {
      sessionReads.clear();
      clearTimeout(notifyTimer);
      for (const finish of [...pollers]) finish();
      fleet.close();
    },
  };
}

export type Router = ReturnType<typeof createRouter>;
