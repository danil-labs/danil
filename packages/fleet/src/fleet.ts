/**
 * Las otras máquinas de la cuenta detrás de un panel: una sesión de relay por
 * máquina, cada llamada con su sobre `{machine, workspace, command, args}` y
 * cada lectura como una rebanada con estado (`slices.ts`).
 *
 * - La máquina sale solo del sobre; los argumentos nunca la eligen (`ids.ts`).
 * - Toda espera tiene tope (`deadlines.ts`) y un solo reintento.
 * - Una acción ligera (`isDeferrable`) a una máquina apagada no la enciende ni
 *   falla: el relay la guarda y la aplica al conectarse; la lista la refleja.
 * - Los miembros de un workspace salen del registro de la cuenta, no de la
 *   última respuesta.
 * - Altas, bajas y renombres de máquinas se aplican en vivo, sin cerrar las demás.
 *
 * La máquina de la ventana no pasa por aquí: quien la tiene la lee nativa y
 * suma su rebanada con `merge`.
 */
import { type AccountWorkspace, type Blocked, type CallResult, type DeferredFrame, type EngineInfo, type EventsPage, type MachineState, type SystemId, cachedAt, callWorkspace, isDeferrable, linkedAttention, linkedEvents, linkedListing, requestId, unlinkedWorkspaces } from "../../computers/src/index.ts";
import { DEADLINES, type Deadlines, classOf } from "./deadlines.ts";
import { FleetError, fromRelay } from "./errors.ts";
import { argsFor } from "./ids.ts";
import { type MergeContext, encode, encodeEvent, merge } from "./merge.ts";
import { type Slice, SliceBook, type StorageLike } from "./slices.ts";

type Row = Record<string, unknown>;

/** `outdated`: su motor habla otro contrato, sabido por el plano de control. `linked`: `null` enseña todos sus workspaces. */
/** `os` solo si se sabe: la tarjeta de la tarea lo lee y, si falta, no inventa un sistema. */
/** `features`: lo que su motor anuncia (`status.service_features`); cada función se enciende por máquina. */
/** `version`: la `host_version` de su último `hello`, según el plano de control; se conserva apagada. */
export type MachineInfo = { id: string; name: string; wakes: boolean; outdated?: boolean; linked?: ReadonlySet<string> | null; os?: SystemId; features?: readonly string[]; version?: string };
export type Power = "on" | "off" | "starting" | "outdated";

export type Envelope = { machine: string; workspace: string | null; command: string; args?: Row };

/** Lo que la flota usa de una sesión de relay (`RelaySession` de `@terminus/computers`). */
export type Link = {
  state(): MachineState;
  call(id: string, command: string, workspace: string | null, folder: string | null, args: unknown, timeoutMs?: number): Promise<CallResult>;
  onState(listener: (state: MachineState) => void): () => void;
  onEvents(listener: (page: EventsPage) => void): () => void;
  subscribe(after: number | null): void;
  start(): void;
  close(): void;
  /** Cada `hello` del motor (`{"type":"engine"}`); una sesión de antes no lo tiene. */
  onEngine?(listener: (engine: EngineInfo) => void): () => void;
  /** Detenida sin reintentar sola (`license_required`) hasta `retry()`; una sesión de antes no lo tiene. */
  blocked?(): Blocked | null;
  onBlocked?(listener: (blocked: Blocked | null) => void): () => void;
  retry?(): void;
  /** Cada cambio de la cola de acciones aplazadas de la máquina; una sesión de antes no lo tiene. */
  onDeferred?(listener: (frame: DeferredFrame) => void): () => void;
  deferred?(): DeferredFrame;
};

/** Una sesión de relay como enlace de la flota, con su estado leído aparte: hasta que el relay lo diga vale el de la fila. */
export function relayLink(relay: Required<Link>, state: Link["state"]): Link {
  return {
    state,
    call: (id, command, workspace, folder, args, timeout) => relay.call(id, command, workspace, folder, args, timeout),
    onState: (listener) => relay.onState(listener),
    onEvents: (listener) => relay.onEvents(listener),
    onEngine: (listener) => relay.onEngine(listener),
    blocked: () => relay.blocked(),
    onBlocked: (listener) => relay.onBlocked(listener),
    retry: () => relay.retry(),
    onDeferred: (listener) => relay.onDeferred(listener),
    deferred: () => relay.deferred(),
    subscribe: (after) => relay.subscribe(after),
    start: () => relay.start(),
    close: () => relay.close(),
  };
}

export type FleetEvent = { name: string; payload: unknown };

export type FleetConfig = {
  /** La máquina de la ventana (sus ids van sueltos), o `null` en la web. */
  self?: string | null;
  connect(info: MachineInfo): Link;
  /** Si este cliente habla el contrato de un motor: `null` si no se sabe (`machineCompatibility`). */
  compatible?(contract: string | null): boolean | null;
  /** Enciende una VM por el plano de control; `false` si no se pudo, `not_startable` si no es suya de encender. */
  wake?(machine: string): Promise<boolean | "not_startable">;
  storage?: StorageLike | null;
  deadlines?: Partial<Deadlines>;
  /** Una máquina cambió de estado, o se agregó, quitó o renombró. */
  onChange?(machine: string): void;
  /** Cambió el estado de la última rebanada de una máquina (`sliceStatuses`): solo para repintarlo. */
  onSlice?(machine: string): void;
  /** Eventos de otra máquina, ya con los ids del panel. `gap`: se perdieron algunos y hay que releer. */
  onEvents?(machine: string, events: FleetEvent[], gap: boolean): void;
  /** Cambió la cola de acciones aplazadas de `machine` (se encoló o se aplicó una): la lista se relee. */
  onDeferred?(machine: string, frame: DeferredFrame): void;
  /**
   * Llegaron eventos de `workspaces` que ninguna máquina tiene vinculados según
   * su fila (`MachineInfo.linked`). El relay ya los dejó pasar: se vincularon
   * después de listar las computadoras, y la lista se relee para verlos.
   */
  onUnlinked?(machine: string, workspaces: string[]): void;
  /** `false`: los eventos llegan con los ids de su máquina (el teléfono nombra cada tarea con su máquina aparte). */
  panelIds?: boolean;
};

const OFF: readonly MachineState[] = ["offline", "stopped", "provisioning"];
const OUTDATED: readonly MachineState[] = ["version_mismatch", "outdated"];
/** Fallos que se reintentan una vez: el relay perdió el conector, o una lectura no llegó a tiempo. */
const RETRY_ACTION = new Set(["machine_lost"]);
const RETRY_READ = new Set(["machine_lost", "machine_timeout", "io"]);

/**
 * `outdated`: el relay contestó `version_mismatch`. `engine`: lo que dijo el último
 * `hello` (`true` compatible), que manda sobre el contrato que listó el plano de control.
 * `fresh`: con la cola de aplazadas cambiada, o la máquina recién apagada (`null` si
 * nada de eso), las lecturas que ya se volvieron a pedir al relay; las demás no salen
 * de la última rebanada guardada. Al apagarse, la VM deja en el relay su copia, más
 * nueva que lo leído aquí mientras estaba encendida (la respuesta que terminó al final).
 */
type Member = { info: MachineInfo; link: Link; stops: (() => void)[]; was: MachineState; outdated: boolean; engine: boolean | null; fresh: Set<string> | null };

export class Fleet {
  readonly self: string | null;
  private members = new Map<string, Member>();
  private registry: AccountWorkspace[] | null = null;
  /** Los spaces compartidos con la cuenta que se conocen: del registro y de las respuestas con `account`. */
  private shared = new Set<string>();
  private readonly book: SliceBook;
  private readonly deadlines: Deadlines;
  private readonly inflight = new Map<string, Promise<Slice>>();
  private readonly contextRows = new Map<string, Map<string, Row>>();
  private readonly contextOwners = new Map<string, string>();
  private listening = false;
  private closed = false;
  private readonly config: FleetConfig;

  constructor(config: FleetConfig) {
    this.config = config;
    this.self = config.self ?? null;
    this.book = new SliceBook(config.storage ?? null);
    this.deadlines = { ...DEADLINES, ...config.deadlines };
  }

  /**
   * Las máquinas de la cuenta como las dice ahora `GET /v1/computers`: las nuevas
   * se conectan, las que ya no están se cierran y olvidan, y a las demás se les
   * cambia nombre, contrato o vínculos sin reconectar.
   */
  setMachines(list: readonly MachineInfo[]) {
    if (this.closed) return;
    const next = new Map(list.filter((m) => m.id !== this.self).map((m) => [m.id, m]));
    for (const [id, member] of [...this.members])
      if (!next.has(id)) {
        this.drop(member);
        this.members.delete(id);
        this.book.forget(id);
        this.contextRows.delete(id);
        this.config.onChange?.(id);
      }
    for (const info of next.values()) {
      const member = this.members.get(info.id);
      if (!member) {
        this.add({ ...info });
        continue;
      }
      const before = member.info;
      const same = before.name === info.name && before.wakes === info.wakes && before.os === info.os && !!before.outdated === !!info.outdated && sameLinks(before.linked ?? null, info.linked ?? null)
        && (before.features ?? []).join() === (info.features ?? []).join();
      // Un contrato que vuelve a ser compatible quita la marca que puso el relay.
      if (before.outdated && !info.outdated) member.outdated = false;
      member.info = { ...info };
      if (!same) this.config.onChange?.(info.id);
    }
  }

  /** Una máquina renombrada en la cuenta (`PATCH /v1/computers/:id`): sus etiquetas leen el nombre nuevo. `true` si cambió. */
  rename(machine: string, name: string): boolean {
    const member = this.members.get(machine);
    const next = name.trim();
    if (!member || !next || member.info.name === next) return false;
    member.info = { ...member.info, name: next };
    this.config.onChange?.(machine);
    return true;
  }

  setRegistry(list: AccountWorkspace[] | null) {
    this.registry = list;
    for (const w of list ?? []) for (const s of w.spaces ?? []) this.shared.add(s.id);
  }

  /** Un space que ya es de la cuenta (`share_space`): viaja sin prefijo a cualquier máquina. */
  markShared(space: string) {
    if (space) this.shared.add(space);
  }

  isShared(space: string): boolean {
    return this.shared.has(space);
  }

  /**
   * Cuántos spaces de la cuenta conoce; solo sube. Si subió tras una lectura,
   * las tareas de otra máquina leídas antes nombraban con prefijo un space que
   * ya es de la cuenta (al migrar sus spaces): la ventana las relee.
   */
  sharedCount(): number {
    return this.shared.size;
  }

  /** Aprende los spaces compartidos de una respuesta (`account: true`). */
  private learn(command: string, value: unknown) {
    if (!/space/.test(command)) return;
    for (const r of Array.isArray(value) ? value : [value])
      if (r && typeof r === "object" && (r as Row).account === true && typeof (r as Row).id === "string") this.shared.add((r as Row).id as string);
  }

  getRegistry(): AccountWorkspace[] | null {
    return this.registry;
  }

  /** Las otras máquinas, administradas primero y luego por nombre. */
  machines(): MachineInfo[] {
    return [...this.members.values()].map((m) => m.info).sort((a, b) => Number(b.wakes) - Number(a.wakes) || a.name.localeCompare(b.name));
  }

  has(machine: string | null | undefined): boolean {
    return !!machine && this.members.has(machine);
  }

  info(machine: string): MachineInfo | undefined {
    return this.members.get(machine)?.info;
  }

  name(machine: string): string {
    return this.info(machine)?.name ?? machine;
  }

  state(machine: string): MachineState {
    return this.members.get(machine)?.link.state() ?? "unknown";
  }

  power(machine: string): Power {
    const member = this.members.get(machine);
    if (!member) return "off";
    if (this.isOutdated(member)) return "outdated";
    const state = member.link.state();
    return state === "online" ? "on" : state === "starting" ? "starting" : "off";
  }

  /**
   * Las otras máquinas que tienen `workspace`, según el registro de la cuenta;
   * sin registro, las que lo tienen vinculado. Nunca según quién contestó al final.
   */
  membersOf(workspace: string | null): string[] {
    if (!workspace) return [];
    const order = this.machines().map((m) => m.id);
    if (this.registry) {
      const w = this.registry.find((x) => x.id === workspace);
      return w ? order.filter((id) => w.computers.includes(id)) : [];
    }
    return order.filter((id) => {
      const linked = this.info(id)?.linked ?? null;
      return linked === null || linked.has(workspace);
    });
  }

  /** Si alguna máquina tiene `workspace` vinculado según su fila (o no dice cuáles tiene). */
  private linkedAnywhere(workspace: string): boolean {
    return [...this.members.values()].some((m) => {
      const linked = m.info.linked ?? null;
      return linked === null || linked.has(workspace);
    });
  }

  inRegistry(workspace: string | null): boolean {
    return !!workspace && !!this.registry?.some((w) => w.id === workspace);
  }

  /** Los ids que van con prefijo: los de las otras máquinas. */
  remotes(): ReadonlySet<string> {
    return new Set(this.members.keys());
  }

  /** `args` para `machine`; lanza `cross_machine` si nombran algo de otra. */
  argsFor(machine: string, args: Row): Row {
    return argsFor(args, machine, this.remotes(), this.self, (s) => this.shared.has(s));
  }

  context(): MergeContext {
    return {
      self: this.self,
      on: (m) => m === this.self || this.power(m) === "on",
      order: this.machines().map((m) => m.id),
      registry: this.registry,
      shared: (s) => this.shared.has(s),
      name: (m) => this.name(m),
      workspaceContext: (workspace) => this.workspaceContext(workspace),
    };
  }

  encode(machine: string, value: unknown, command = ""): unknown {
    this.learn(command, value);
    return encode(this.context(), machine, value, command);
  }

  private workspaceContext(workspace: string): { machine: string; row: Row } | null {
    const members = new Set([...(this.self ? [this.self] : []), ...this.membersOf(workspace)]);
    const primary = (machine: string) => {
      const row = this.contextRows.get(machine)?.get(workspace);
      return row && typeof row.context_root === "string" && row.context_root.trim() ? row : null;
    };
    const previous = this.contextOwners.get(workspace);
    const machine = previous && members.has(previous) && this.power(previous) === "outdated" && primary(previous)
      ? previous
      : [...members].find((id) => primary(id));
    if (!machine) {
      this.contextOwners.delete(workspace);
      return null;
    }
    this.contextOwners.set(workspace, machine);
    return { machine, row: primary(machine)! };
  }

  /** Las rebanadas juntas; `undefined` si ninguna trae valor (`merge.ts`). */
  merge(command: string, slices: readonly Slice[], workspace: string | null = null): unknown {
    for (const s of slices) if (s.has) {
      this.learn(command, s.value);
      if (command === "list_workspaces" || command === "workspaces_startup") {
        const rows = (s.value as { workspaces?: Row[] } | null)?.workspaces;
        if (Array.isArray(rows)) this.contextRows.set(s.machine, new Map(rows.filter((row) => typeof row?.id === "string").map((row) => [row.id as string, row])));
      }
    }
    return merge(this.context(), command, slices, workspace);
  }

  /** El estado de cada máquina en su lectura más reciente, para la barra y su caché. */
  sliceStatuses() {
    return this.book.statuses();
  }

  /**
   * Una llamada a otra máquina. Una lectura con la máquina apagada contesta la
   * copia del relay o `machine_off`; una acción ligera (`isDeferrable`) la guarda
   * el relay sin encenderla; otra acción a una apagada la enciende antes si se
   * puede, o falla con `machine_off` (con `canWake`) sin esperar.
   */
  async call(envelope: Envelope): Promise<unknown> {
    const { machine, command } = envelope;
    const { value } = await this.send(envelope);
    return this.encode(machine, value, command);
  }

  /**
   * Como `call`, con la respuesta tal como la dio la máquina (sus ids sueltos) y,
   * si salió de la copia del relay, su hora: para quien nombra la máquina aparte.
   */
  async raw(envelope: Envelope): Promise<{ value: unknown; at: number | null }> {
    const { value, cached } = await this.send(envelope);
    return { value, at: cachedAt(cached) };
  }

  /** La última rebanada de una lectura de `machine`, sin preguntar. */
  peek(envelope: Envelope): Slice | null {
    const key = this.keyOf(envelope);
    return key === null ? null : this.book.get(envelope.machine, key);
  }

  /**
   * Una lectura de `machine` como rebanada. Nunca lanza por la máquina: lo que
   * no contesta queda `no_answer` con lo anterior, lo apagado `cached` u `off`.
   * Dos lecturas iguales a la vez comparten la misma pregunta.
   */
  read(envelope: Envelope): Promise<Slice> {
    let key: string | null;
    try {
      key = this.keyOf(envelope);
    } catch (error) {
      return Promise.reject(error);
    }
    if (key === null) return Promise.reject(new FleetError("unknown_machine", envelope.machine));
    const id = `${envelope.machine}\u0000${key}`;
    const running = this.inflight.get(id);
    if (running) return running;
    const run = this.readNow(envelope, key).finally(() => this.inflight.delete(id));
    this.inflight.set(id, run);
    return run;
  }

  /**
   * Enciende `machine` y espera a que diga `online`, con el tope de un intent.
   * Una máquina propia apagada, o sin plano de control para encenderla, es `machine_off`.
   */
  async wake(machine: string): Promise<void> {
    const member = this.members.get(machine);
    if (!member) throw new FleetError("unknown_machine", machine);
    if (member.link.state() === "online") return;
    if (!member.info.wakes) throw new FleetError("machine_off", machine, null, false);
    await this.wakeMember(member);
  }

  /** Las acciones aplazadas de `machine` que esperan a que se conecte. */
  deferred(machine: string): DeferredFrame["actions"] {
    return this.members.get(machine)?.link.deferred?.().actions ?? [];
  }

  /** Por qué está detenida la sesión con `machine` (`license_required`), o `null`. */
  blocked(machine: string): Blocked | null {
    return this.members.get(machine)?.link.blocked?.() ?? null;
  }

  /** `license_required` si alguna máquina está detenida por la licencia: la UI enseña el aviso de Terminus de pago. */
  license(): Blocked | null {
    return [...this.members.keys()].map((id) => this.blocked(id)).find(Boolean) ?? null;
  }

  /** «Reintentar»: vuelve a abrir las sesiones detenidas. */
  retry() {
    for (const m of this.members.values()) if (m.link.blocked?.()) m.link.retry?.();
  }

  /** Los eventos de todas: cada máquina se suscribe ahora y las que lleguen después, al agregarse. */
  subscribeEvents() {
    if (this.listening) return;
    this.listening = true;
    for (const m of this.members.values()) m.link.subscribe(null);
  }

  close() {
    this.closed = true;
    for (const m of this.members.values()) this.drop(m);
    this.members.clear();
    this.book.flush();
  }

  flush() {
    this.book.flush();
  }

  private keyOf(envelope: Envelope): string | null {
    if (!this.members.has(envelope.machine)) return null;
    // La llave es la lectura como la entiende esa máquina: las pestañas de otra no la cambian.
    const args = this.argsFor(envelope.machine, envelope.args ?? {});
    return JSON.stringify([envelope.command, envelope.workspace, args]);
  }

  private async readNow(envelope: Envelope, key: string): Promise<Slice> {
    const { machine } = envelope;
    const before = this.book.get(machine, key);
    const keep = (status: Slice["status"], error?: string): Slice =>
      before?.has ? { ...before, status, error } : { machine, status, has: false, value: null, at: null, error };
    // Una máquina apagada no contesta: su última rebanada es la respuesta, sin salir a la red.
    const member = this.members.get(machine);
    // Salvo si cambió la cola de aplazadas: la copia del relay ya la refleja y la de aquí no.
    const settled = !member?.fresh || member.fresh.has(key);
    if (before?.has && member && settled && classOf(envelope.command) === "read" && OFF.includes(member.link.state())) return { ...before, status: "cached", error: "machine_off" };
    // Con otro contrato no se le pregunta: lo dirá su próximo `hello` (R14) o la lista de la cuenta.
    if (member && this.isOutdated(member)) return this.settle(keep("outdated", "version_mismatch"), key);
    let slice: Slice;
    try {
      const { value, cached } = await this.send(envelope);
      const at = cachedAt(cached);
      slice = { machine, status: cached ? "cached" : "ok", has: true, value, at: at ?? Date.now() };
      member?.fresh?.add(key);
    } catch (error) {
      const e = fromRelay(error, machine);
      if (e.code === "cross_machine" || e.code === "unknown_machine") throw e;
      if (e.code === "machine_off") slice = before?.has ? { ...before, status: "cached", error: e.code } : keep("off", e.code);
      else if (e.code === "version_mismatch") slice = keep("outdated", e.code);
      else if (e.code === "license_required") slice = keep("license_required", e.code);
      else slice = keep("no_answer", e.code);
    }
    return this.settle(slice, key);
  }

  /** Guarda la rebanada; si cambia el estado que la barra enseña de su máquina, avisa para repintarlo. */
  private settle(slice: Slice, key: string): Slice {
    const last = this.book.statuses()[slice.machine]?.status;
    this.book.put(slice, key);
    if (this.book.statuses()[slice.machine]?.status !== last) this.config.onSlice?.(slice.machine);
    return slice;
  }

  /** Una llamada con el sobre: plazo por clase, un reintento y la VM encendida antes si hace falta. */
  private async send(envelope: Envelope): Promise<{ value: unknown; cached: CallResult["cached"] }> {
    const { machine, command } = envelope;
    const member = this.members.get(machine);
    if (!member) throw new FleetError("unknown_machine", machine);
    const args = this.argsFor(machine, envelope.args ?? {});
    // Sin licencia no se pregunta nada: la sesión espera a «Reintentar».
    const stopped = member.link.blocked?.();
    if (stopped) throw new FleetError(stopped, machine);
    const kind = classOf(command);
    if (kind !== "read" && this.isOutdated(member)) throw new FleetError("version_mismatch", machine);
    const off = OFF.includes(member.link.state());
    if (off && ["list_storage", "reclaim_storage", "empty_build_cache", "collect_orphans"].includes(command)) throw new FleetError("machine_off", machine);
    // Archivar, borrar, renombrar, fijar o mover de space: el relay la guarda sin encenderla.
    if (off && kind !== "read" && !this.defers(command, args)) {
      if (!member.info.wakes) throw new FleetError("machine_off", machine, null, false);
      // El relay enciende la VM solo con un intent; otra acción la enciende antes el plano de control.
      if (kind === "action") await this.wakeMember(member);
    }
    const workspace = callWorkspace(envelope.workspace, args);
    const timeout = envelope.command === "list_storage" ? this.deadlines.action : this.deadlines[kind];
    const id = requestId();
    const attempt = async (retried: boolean): Promise<CallResult> => {
      try {
        // Un intent reintentado lleva el mismo id: el relay no lo entrega dos veces.
        return await member.link.call(kind === "read" ? requestId() : id, command, workspace, null, args, timeout);
      } catch (error) {
        const e = fromRelay(error, machine);
        if (e.code === "version_mismatch") this.markOutdated(member);
        if (e.code === "not_remotely_startable") throw new FleetError("machine_off", machine, null, false);
        const again = kind === "read" ? RETRY_READ : RETRY_ACTION;
        if (retried || command === "list_storage" || !again.has(e.code)) throw e;
        return attempt(true);
      }
    };
    const result = await attempt(false);
    return { value: this.linkedOnly(member, command, result.value), cached: result.cached };
  }

  /**
   * Si el relay guarda esta acción con la máquina apagada. Mover a un space de
   * la cuenta no: ese space es de la cuenta (`share_space`), no de la cola de
   * una máquina, y sigue el camino de cualquier acción.
   */
  private defers(command: string, args: Row): boolean {
    if (!isDeferrable(command)) return false;
    return !(command === "move_task_to_space" && typeof args.space === "string" && this.shared.has(args.space));
  }

  /** Enciende la VM y espera a que diga `online`, con el tope de un intent. */
  private async wakeMember(member: Member) {
    const { id } = member.info;
    if (!this.config.wake) throw new FleetError("machine_off", id, null, true);
    const started = member.link.state() === "starting" || (await this.config.wake(id).catch(() => false));
    if (started === "not_startable") throw new FleetError("machine_off", id, "not_remotely_startable", false);
    if (!started) throw new FleetError("machine_off", id, "start_failed", true);
    await new Promise<void>((resolve, reject) => {
      const done = (ok: boolean) => {
        clearTimeout(timer);
        stop();
        ok ? resolve() : reject(new FleetError("machine_timeout", id, "start"));
      };
      const timer = setTimeout(() => done(false), this.deadlines.intent);
      const stop = member.link.onState((state) => state === "online" && done(true));
      if (member.link.state() === "online") done(true);
    });
  }

  private linkedOnly(member: Member, command: string, value: unknown): unknown {
    const linked = member.info.linked ?? null;
    if (!linked) return value;
    if (command === "list_workspaces" || command === "workspaces_startup") return linkedListing(value, linked);
    if (command === "list_workspace_attention") return linkedAttention(value, linked);
    return value;
  }

  private isOutdated(member: Member): boolean {
    if (member.outdated) return true;
    return member.engine === null ? !!member.info.outdated : !member.engine;
  }

  private markOutdated(member: Member) {
    if (member.outdated) return;
    member.outdated = true;
    this.config.onChange?.(member.info.id);
  }

  private add(info: MachineInfo) {
    const link = this.config.connect(info);
    const member: Member = { info, link, stops: [], was: link.state(), outdated: false, engine: null, fresh: null };
    member.stops.push(
      link.onState((state) => {
        if (OUTDATED.includes(state)) member.outdated = true;
        const cameOn = state === "online" && member.was !== "online";
        // Se apagó en esta sesión: cada lectura vuelve a pedirse una vez a la copia del relay (no la enciende).
        if (OFF.includes(state) && (member.was === "online" || member.was === "starting")) member.fresh = new Set();
        member.was = state;
        if (cameOn && this.listening) this.config.onEvents?.(info.id, [], true);
        this.config.onChange?.(info.id);
      }),
      // Un `hello` nuevo: si ya habla este contrato, se quita la marca de desactualizada (R14).
      link.onEngine?.((engine) => {
        const verdict = this.config.compatible?.(engine.contract) ?? null;
        if (verdict === null) return;
        member.engine = verdict;
        if (verdict) member.outdated = false;
        this.config.onChange?.(info.id);
      }) ?? (() => {}),
      link.onBlocked?.(() => this.config.onChange?.(info.id)) ?? (() => {}),
      link.onDeferred?.((frame) => {
        if (!frame.actions.length && !frame.done.length && !member.fresh) return;
        member.fresh = new Set();
        this.config.onDeferred?.(info.id, frame);
      }) ?? (() => {}),
      link.onEvents((page) => {
        if (!this.listening || this.isOutdated(member)) return;
        // Uno vinculado en otra máquina de la cuenta también llega por esta (el `account` del relay): eso no es una lista vieja.
        const unknown = unlinkedWorkspaces(page.events ?? [], member.info.linked ?? null).filter((w) => !this.linkedAnywhere(w));
        if (unknown.length) this.config.onUnlinked?.(info.id, unknown);
        const linked = linkedEvents(page.events ?? [], member.info.linked ?? null);
        const events = this.config.panelIds === false ? linked.map((e) => ({ name: e.name, payload: e.payload })) : linked.map((e) => ({ name: e.name, payload: encodeEvent(this.context(), info.id, e.name, e.payload) }));
        this.config.onEvents?.(info.id, events, page.gap === true);
      }),
    );
    this.members.set(info.id, member);
    link.start();
    if (this.listening) link.subscribe(null);
    this.config.onChange?.(info.id);
  }

  private drop(member: Member) {
    for (const stop of member.stops) stop();
    member.link.close();
  }
}

function sameLinks(a: ReadonlySet<string> | null, b: ReadonlySet<string> | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.size !== b.size) return false;
  return [...a].every((id) => b.has(id));
}
