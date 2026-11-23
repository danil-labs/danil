/**
 * Las otras máquinas de la cuenta detrás de un panel: una sesión de relay por
 * pareja (máquina, contexto), cada llamada con su sobre explícito y
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
import { type AccountWorkspace, type Blocked, type CallResult, cachedAt, callWorkspace, type DeferredFrame, isDeferrable, linkedAttention, linkedEvents, linkedListing, type MachineState, requestId, unlinkedWorkspaces } from "../../computers/src/index.ts";
import { COMMAND_NOT_HERE, isScopeRefusal, isUnknownCommand } from "../../engine-client/src/index.ts";
import { classOf, DEADLINES, type Deadlines, PASSIVE } from "./deadlines.ts";
import { FleetError, fromRelay } from "./errors.ts";
import { argsFor } from "./ids.ts";
import { memberKey, sameContext } from "./member-key.ts";
import { encode, encodeEvent, type MergeContext, merge } from "./merge.ts";
import { type Slice, SliceBook } from "./slices.ts";
import { listedWorkspaces } from "./workspace-listing.ts";
import { serves, alwaysOn, normalized, OFF, OUTDATED, RETRY_ACTION, RETRY_READ, sameLinks, type Row, type MachineInfo, type Listed, type Power, type Envelope, type FleetConfig, type Member } from "./fleet-types.ts";
export { relayLink } from "./fleet-types.ts";
export type { MachineInfo, Listed, Power, Envelope, Link, FleetEvent, FleetConfig } from "./fleet-types.ts";

export class Fleet {
  readonly self: string | null;
  private members = new Map<string, Member>();
  /** Lo último que cada máquina contestó en `list_workspaces`; sin entrada, aún no se sabe. */
  private listings = new Map<string, readonly Listed[]>();
  private listingListeners = new Set<(machine: string, context?: string) => void>();
  private registries = new Map<string, AccountWorkspace[]>();
  /** Los spaces compartidos con la cuenta que se conocen: del registro y de las respuestas con `account`. */
  private sharedSpaces = new Map<string, Set<string>>();
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

  private member(machine: string, context?: string): Member | undefined {
    return this.members.get(memberKey(machine, context));
  }

  private forgetInflight(machine: string, context?: string) {
    const prefix = `${machine}\u0000${context ?? ""}\u0000`;
    for (const key of this.inflight.keys()) if (key.startsWith(prefix)) this.inflight.delete(key);
  }

  private purgeAbsentScopes() {
    const current = new Set(this.machines().map((m) => m.context ?? ""));
    for (const scope of this.registries.keys()) if (scope && !current.has(scope)) this.registries.delete(scope);
    for (const scope of this.sharedSpaces.keys()) if (scope && !current.has(scope)) this.sharedSpaces.delete(scope);
  }

  private scoped(context?: string): MachineInfo[] {
    return this.machines().filter((info) => sameContext(info.context, context));
  }

  private shared(context?: string): Set<string> {
    const key = context ?? "";
    let value = this.sharedSpaces.get(key);
    if (!value) { value = new Set(); this.sharedSpaces.set(key, value); }
    return value;
  }

  /**
   * Las máquinas de la cuenta como las dice ahora `GET /v1/computers`: las nuevas
   * se conectan, las que ya no están se cierran y olvidan, y a las demás se les
   * cambia nombre, contrato o vínculos sin reconectar.
   */
  setMachines(list: readonly MachineInfo[]) {
    if (this.closed) return;
    const next = new Map(list.filter((m) => m.id !== this.self).map((m) => [memberKey(m.id, m.context), normalized(m)]));
    for (const [id, member] of [...this.members])
      if (!next.has(id) || next.get(id)?.context !== member.info.context) {
        this.drop(member);
        this.members.delete(id);
        this.forgetInflight(member.info.id, member.info.context);
        this.book.forget(member.info.id, member.info.context);
        this.contextRows.delete(id);
        this.listings.delete(id);
        this.config.onChange?.(member.info.id, member.info.context);
      }
    for (const info of next.values()) {
      const member = this.member(info.id, info.context);
      if (!member) {
        this.add(info);
        continue;
      }
      const before = member.info;
      const same = before.name === info.name && before.wakes === info.wakes && before.os === info.os && !!before.outdated === !!info.outdated && sameLinks(before.linked ?? null, info.linked ?? null)
        && (before.features ?? []).join() === (info.features ?? []).join()
        && JSON.stringify(before.organization ?? null) === JSON.stringify(info.organization ?? null)
        && (before.kind ?? null) === (info.kind ?? null) && (before.organizationId ?? null) === (info.organizationId ?? null);
      // Un contrato que vuelve a ser compatible quita la marca que puso el relay.
      if (before.outdated && !info.outdated) member.outdated = false;
      member.info = info;
      if (!same) this.config.onChange?.(info.id, info.context);
    }
    this.purgeAbsentScopes();
  }

  /** Una máquina renombrada en la cuenta (`PATCH /v1/computers/:id`): sus etiquetas leen el nombre nuevo. `true` si cambió. */
  rename(machine: string, name: string, context?: string): boolean {
    const member = this.member(machine, context);
    const next = name.trim();
    if (!member || !next || member.info.name === next) return false;
    member.info = { ...member.info, name: next };
    this.config.onChange?.(machine, context);
    return true;
  }

  setRegistry(list: AccountWorkspace[] | null, context?: string) {
    if (list) this.registries.set(context ?? "", list); else this.registries.delete(context ?? "");
    for (const w of list ?? []) for (const s of w.spaces ?? []) this.shared(context).add(s.id);
  }

  /** Un space que ya es de la cuenta (`share_space`): viaja sin prefijo a cualquier máquina. */
  markShared(space: string, context?: string) {
    if (space) this.shared(context).add(space);
  }

  isShared(space: string, context?: string): boolean {
    return this.shared(context).has(space);
  }

  /**
   * Cuántos spaces de la cuenta conoce; solo sube. Si subió tras una lectura,
   * las tareas de otra máquina leídas antes nombraban con prefijo un space que
   * ya es de la cuenta (al migrar sus spaces): la ventana las relee.
   */
  sharedCount(context?: string): number {
    return this.shared(context).size;
  }

  /** Aprende los spaces compartidos de una respuesta (`account: true`). */
  private learn(command: string, value: unknown, context?: string) {
    if (!/space/.test(command)) return;
    for (const r of Array.isArray(value) ? value : [value])
      if (r && typeof r === "object" && (r as Row).account === true && typeof (r as Row).id === "string") this.shared(context).add((r as Row).id as string);
  }

  getRegistry(context?: string): AccountWorkspace[] | null {
    return this.registries.get(context ?? "") ?? null;
  }

  private described(member: Member): MachineInfo {
    return member.engineFeatures === undefined ? member.info : { ...member.info, features: member.engineFeatures };
  }

  /** Las otras máquinas, administradas (las VM y los servidores de organización) primero y luego por nombre. */
  machines(context?: string): MachineInfo[] {
    const managed = (m: MachineInfo) => Number(m.wakes || alwaysOn(m));
    return [...this.members.values()].map((m) => this.described(m)).filter((m) => context === undefined || sameContext(m.context, context)).sort((a, b) => managed(b) - managed(a) || a.name.localeCompare(b.name));
  }

  has(machine: string | null | undefined, context?: string): boolean {
    return !!machine && !!this.member(machine, context);
  }

  info(machine: string, context?: string): MachineInfo | undefined {
    const member = this.member(machine, context);
    return member && this.described(member);
  }

  /** Lo que `machine` contestó en `list_workspaces`; una respuesta sin lista no borra la anterior. */
  setListing(machine: string, workspaces: readonly Listed[], context?: string) {
    if (!this.member(machine, context)) return;
    const id = memberKey(machine, context);
    const before = this.listings.get(id);
    this.listings.set(id, workspaces);
    if (JSON.stringify(before ?? null) === JSON.stringify(workspaces)) return;
    this.config.onChange?.(machine, context);
    for (const listener of this.listingListeners) listener(machine, context);
  }

  /** Avisa cada vez que cambia lo que una máquina lista; devuelve cómo dejar de escuchar. */
  onListing(listener: (machine: string, context?: string) => void): () => void {
    this.listingListeners.add(listener);
    return () => void this.listingListeners.delete(listener);
  }

  /** Cada lectura de `list_workspaces` de otra máquina, sea de quien sea, queda como su lista. */
  private noteListing(machine: string, value: unknown, context?: string) {
    const rows = listedWorkspaces(value);
    if (rows) this.setListing(machine, rows, context);
  }

  /** Las máquinas `kind=organization` de `organization`, según su fila de `/v1/machines`. */
  organizationMachines(organization: string, context?: string): string[] {
    return this.scoped(context).filter((m) => m.kind === "organization" && m.organizationId === organization).map((m) => m.id);
  }

  /**
   * Los workspaces que sirven las máquinas de `organization`, de su `list_workspaces`.
   * `null` mientras ninguna contestó: la fuente no está asentada y nada se decide con ella.
   */
  available(organization: string, context?: string): Listed[] | null {
    const found = new Map<string, Listed>();
    let settled = false;
    for (const id of this.organizationMachines(organization, context)) {
      const listed = this.listings.get(memberKey(id, context));
      if (!listed) continue;
      settled = true;
      for (const w of listed) if ((!w.account || w.account.org === organization) && !found.has(w.id)) found.set(w.id, w);
    }
    return settled ? [...found.values()] : null;
  }

  /** Si `info` atiende `workspace` por una organización: por su fila, o por su `list_workspaces` si es `kind=organization`. */
  private serves(info: MachineInfo | undefined, workspace: string): boolean {
    if (serves(info, workspace)) return true;
    return !!info && info.kind === "organization" && !!info.organizationId && !!this.listings.get(memberKey(info.id, info.context))?.some((w) => w.id === workspace);
  }

  name(machine: string, context?: string): string {
    return this.info(machine, context)?.name ?? machine;
  }

  state(machine: string, context?: string): MachineState {
    return this.member(machine, context)?.link.state() ?? "unknown";
  }

  canContinue(machine: string, context?: string): boolean {
    const member = this.member(machine, context);
    return !!member && !this.isOutdated(member) && this.online(member);
  }

  power(machine: string, context?: string): Power {
    const member = this.member(machine, context);
    if (!member) return "off";
    if (this.isOutdated(member)) return "outdated";
    if (this.online(member)) return "on";
    const state = this.stateOf(member);
    // Un endpoint de organización no se enciende desde aquí: solo un `offline` de su relay lo apaga.
    if (alwaysOn(member.info)) return OFF.includes(state) ? "off" : "on";
    return state === "starting" ? "starting" : "off";
  }

  /**
   * Lo que otra fuente sabe del estado de `machine` (la vista del motor, de la
   * lista de la cuenta). Solo vale mientras su sesión no dijo nada: el relay manda.
   */
  observe(machine: string, state: MachineState, context?: string) {
    const member = this.member(machine, context);
    if (!member || member.hint === state) return;
    const before = this.power(machine, context);
    member.hint = state;
    if (this.power(machine, context) !== before) this.config.onChange?.(machine, context);
  }

  /** El estado de la sesión, o el de otra fuente si la sesión aún no dijo ninguno. */
  private stateOf(member: Member): MachineState {
    const state = member.link.state();
    return state === "unknown" && member.hint ? member.hint : state;
  }

  /**
   * Si la flota no le pregunta por estar apagada: según su relay y sin una
   * respuesta en vivo más nueva. A un endpoint de organización siempre se le
   * pregunta: su relay contesta (en vivo, de su copia o `machine_off`).
   */
  private isOff(member: Member): boolean {
    return !member.live && !alwaysOn(member.info) && OFF.includes(this.stateOf(member));
  }

  /** En línea según lo último que se supo: su sesión, o una respuesta en vivo más nueva que ella. */
  private online(member: Member): boolean {
    return member.live || this.stateOf(member) === "online";
  }

  /** Contestó el motor de allá (no la copia del relay): está en línea aunque su último `state` dijera otra cosa. */
  private answered(member: Member) {
    if (member.live || member.link.state() === "online") return;
    member.live = true;
    // Como al llegar su `online`: lo leído mientras parecía apagada se relee.
    if (this.listening) this.config.onEvents?.(member.info.id, [], true, undefined, member.info.context);
    this.config.onChange?.(member.info.id, member.info.context);
  }

  /** El relay dijo que no la alcanza: la evidencia en vivo ya no vale. */
  private unanswered(member: Member) {
    if (!member.live) return;
    member.live = false;
    this.config.onChange?.(member.info.id, member.info.context);
  }

  /**
   * Las otras máquinas que tienen `workspace`, según el registro de la cuenta
   * más las que su fila dice que lo tienen (el workspace de una organización no
   * está en el registro de quien no es su dueña); sin registro, las que lo
   * tienen vinculado. Nunca según quién contestó al final.
   * Si alguna fila lo sirve por una organización, solo esas: vive en su servidor.
   */
  /** Si `machine` listó `workspace` en su `list_workspaces`; `null` mientras no se conoce su lista. */
  lists(machine: string, workspace: string, context?: string): boolean | null {
    const listed = this.listings.get(memberKey(machine, context));
    return listed ? listed.some((w) => w.id === workspace) : null;
  }

  membersOf(workspace: string | null, context?: string): string[] {
    if (!workspace) return [];
    const order = this.scoped(context).map((m) => m.id);
    const servers = order.filter((id) => this.serves(this.info(id, context), workspace));
    if (servers.length) return servers;
    // Lo que una máquina contestó en `list_workspaces` manda; las hijas son de todos.
    const lists = (id: string) => !!this.listings.get(memberKey(id, context))?.some((w) => w.id === workspace);
    const listed = order.filter((id) => lists(id) || this.info(id, context)?.child === true);
    const registered = this.getRegistry(context)?.find(row => row.id === workspace);
    if (order.some(lists)) return order.filter(id => listed.includes(id) || (!this.listings.has(memberKey(id, context)) && (registered?.computers.includes(id) ?? false)));
    // Una máquina de organización cuya lista ya se conoce no toma lo que no lista.
    const known = (id: string) => this.info(id, context)?.kind === "organization" && this.listings.has(memberKey(id, context));
    if (this.getRegistry(context)) {
      return order.filter((id) => !known(id) && ((registered?.computers.includes(id) ?? false) || this.info(id, context)?.child === true || (this.info(id, context)?.linked?.has(workspace) ?? false)));
    }
    return order.filter((id) => {
      const linked = this.info(id, context)?.linked ?? null;
      return !known(id) && (linked === null || linked.has(workspace));
    });
  }

  leadOf(workspace: string | null, context?: string): string | null {
    const members = this.membersOf(workspace, context).filter((id) => this.power(id, context) !== "outdated");
    return members.find((id) => this.power(id, context) === "on") ?? members[0] ?? null;
  }

  /** Solo un conjunto de sesiones asentado puede revocar contextos; el inventario no basta. */
  pruneContexts(validContexts: Iterable<string>) {
    const valid = new Set(validContexts);
    for (const member of [...this.members.values()]) if (member.info.context && !valid.has(member.info.context)) this.closeMember(member.info.id, member.info.context);
    for (const scope of this.registries.keys()) if (scope && !valid.has(scope)) this.registries.delete(scope);
    for (const scope of this.sharedSpaces.keys()) if (scope && !valid.has(scope)) this.sharedSpaces.delete(scope);
    this.book.pruneContexts(valid);
  }

  closeMember(machine: string, context?: string) {
    const key = memberKey(machine, context);
    const member = this.members.get(key);
    if (!member) return;
    this.drop(member);
    this.members.delete(key);
    this.forgetInflight(machine, context);
    this.listings.delete(key);
    this.contextRows.delete(key);
    this.book.forget(machine, context);
    this.purgeAbsentScopes();
    this.config.onChange?.(machine, context);
  }

  /** Si alguna máquina tiene `workspace` vinculado según su fila (o no dice cuáles tiene). */
  private linkedAnywhere(workspace: string, context?: string): boolean {
    return [...this.members.values()].filter((m) => sameContext(m.info.context, context)).some((m) => {
      const linked = m.info.linked ?? null;
      return linked === null || linked.has(workspace) || this.serves(m.info, workspace);
    });
  }

  /** Los workspaces de organización que atienden las máquinas según sus filas, con su nombre y quién los atiende. */
  organizationWorkspaces(context?: string): { id: string; name: string; machines: string[] }[] {
    const found = new Map<string, { id: string; name: string; machines: string[] }>();
    for (const m of this.scoped(context)) {
      for (const w of m.organization?.workspaces ?? []) {
        const seen = found.get(w.id) ?? { id: w.id, name: w.name, machines: [] };
        seen.machines.push(m.id);
        found.set(w.id, seen);
      }
    }
    return [...found.values()];
  }

  inRegistry(workspace: string | null, context?: string): boolean {
    return !!workspace && !!this.getRegistry(context)?.some((w) => w.id === workspace);
  }

  /** Los ids que van con prefijo: los de las otras máquinas. */
  remotes(context?: string): ReadonlySet<string> {
    return new Set(this.scoped(context).map((m) => m.id));
  }

  /** `args` para `machine`; lanza `cross_machine` si nombran algo de otra. */
  argsFor(machine: string, args: Row, context?: string): Row {
    return argsFor(args, machine, this.remotes(context), this.self, (s) => this.shared(context).has(s));
  }

  context(context?: string): MergeContext {
    return {
      self: this.self,
      on: (m) => m === this.self || this.power(m, context) === "on",
      order: this.scoped(context).map((m) => m.id),
      registry: this.getRegistry(context),
      shared: (s) => this.shared(context).has(s),
      name: (m) => this.name(m, context),
      workspaceContext: (workspace) => this.workspaceContext(workspace, context),
    };
  }

  encode(machine: string, value: unknown, command = "", context?: string): unknown {
    this.learn(command, value, context);
    return encode(this.context(context), machine, value, command);
  }

  private workspaceContext(workspace: string, context?: string): { machine: string; row: Row } | null {
    const members = new Set([...(this.self ? [this.self] : []), ...this.membersOf(workspace, context)]);
    const primary = (machine: string) => {
      const row = this.contextRows.get(memberKey(machine, context))?.get(workspace);
      return row && typeof row.context_root === "string" && row.context_root.trim() ? row : null;
    };
    const ownerKey = memberKey(workspace, context);
    const previous = this.contextOwners.get(ownerKey);
    const machine = previous && members.has(previous) && this.power(previous, context) === "outdated" && primary(previous)
      ? previous
      : [...members].find((id) => primary(id));
    if (!machine) {
      this.contextOwners.delete(ownerKey);
      return null;
    }
    this.contextOwners.set(ownerKey, machine);
    return { machine, row: primary(machine)! };
  }

  /** Las rebanadas juntas; `undefined` si ninguna trae valor (`merge.ts`). */
  merge(command: string, slices: readonly Slice[], workspace: string | null = null, context?: string): unknown {
    const scoped = slices.filter((s) => s.machine === this.self || sameContext(s.context, context));
    for (const s of scoped) if (s.has) {
      this.learn(command, s.value, context);
      if (command === "list_workspaces" || command === "workspaces_startup") {
        const rows = (s.value as { workspaces?: Row[] } | null)?.workspaces;
        if (Array.isArray(rows)) this.contextRows.set(memberKey(s.machine, context), new Map(rows.filter((row) => typeof row?.id === "string").map((row) => [row.id as string, row])));
      }
    }
    return merge(this.context(context), command, scoped, workspace);
  }

  /** El estado de cada máquina en su lectura más reciente, para la barra y su caché. */
  sliceStatuses(context?: string) {
    return this.book.statuses(context);
  }

  /**
   * Una llamada a otra máquina. Una lectura con la máquina apagada contesta la
   * copia del relay o `machine_off`; una acción ligera (`isDeferrable`) la guarda
   * el relay sin encenderla; otra acción a una apagada la enciende antes si se
   * puede, o falla con `machine_off` (con `canWake`) sin esperar.
   */
  async call(envelope: Envelope): Promise<unknown> {
    const { machine, command, context } = envelope;
    const { value } = await this.send(envelope);
    return this.encode(machine, value, command, context);
  }

  /**
   * Como `call`, con la respuesta tal como la dio la máquina (sus ids sueltos) y,
   * si salió de la copia del relay, su hora: para quien nombra la máquina aparte.
   */
  async raw(envelope: Envelope): Promise<{ value: unknown; at: number | null }> {
    const { value, cached } = await this.send(envelope);
    return { value, at: cachedAt(cached) };
  }

  /** An execution fact cannot come from a relay copy or a prior in-flight display read. */
  async readLive(envelope: Envelope): Promise<unknown> {
    const { machine, command, context } = envelope;
    const { value, cached } = await this.send(envelope);
    if (cached !== null) throw new FleetError("machine_off", envelope.machine, envelope.command);
    return this.encode(machine, value, command, context);
  }

  /** La última rebanada de una lectura de `machine`, sin preguntar. */
  peek(envelope: Envelope): Slice | null {
    const key = this.keyOf(envelope);
    return key === null ? null : this.book.get(envelope.machine, key, envelope.context);
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
    const id = `${envelope.machine}\u0000${envelope.context ?? ""}\u0000${key}`;
    const running = this.inflight.get(id);
    if (running) return running;
    const run = this.readNow(envelope, key).finally(() => { if (this.inflight.get(id) === run) this.inflight.delete(id); });
    this.inflight.set(id, run);
    return run;
  }

  /**
   * Enciende `machine` y espera a que diga `online`, con el tope de un intent.
   * Una máquina propia apagada, o sin plano de control para encenderla, es `machine_off`.
   */
  async wake(machine: string, context?: string): Promise<void> {
    const member = this.member(machine, context);
    if (!member) throw new FleetError("unknown_machine", machine);
    if (this.online(member) || (alwaysOn(member.info) && !OFF.includes(this.stateOf(member)))) return;
    if (!member.info.wakes) throw new FleetError("machine_off", machine, null, false);
    await this.wakeMember(member);
  }

  /**
   * Espera a que `machine`, que ya se está encendiendo, diga `online`, sin pedir
   * que la enciendan: leer nunca enciende una máquina.
   */
  async untilOnline(machine: string, context?: string): Promise<void> {
    const member = this.member(machine, context);
    if (!member) throw new FleetError("unknown_machine", machine);
    if (this.online(member) || (alwaysOn(member.info) && !OFF.includes(this.stateOf(member)))) return;
    if (member.link.state() !== "starting") throw new FleetError("machine_off", machine, null, member.info.wakes);
    await new Promise<void>((resolve, reject) => {
      const done = (ok: boolean) => {
        clearTimeout(timer);
        stop();
        ok ? resolve() : reject(new FleetError("machine_timeout", machine, "start"));
      };
      const timer = setTimeout(() => done(false), this.deadlines.intent);
      const stop = member.link.onState((state) => (state === "online" ? done(true) : OFF.includes(state) && done(false)));
      if (member.link.state() === "online") done(true);
    });
  }

  /** Las acciones aplazadas de `machine` que esperan a que se conecte. */
  deferred(machine: string, context?: string): DeferredFrame["actions"] {
    return this.member(machine, context)?.link.deferred?.().actions ?? [];
  }

  /** Por qué está detenida la sesión con `machine` (`license_required`), o `null`. */
  blocked(machine: string, context?: string): Blocked | null {
    return this.member(machine, context)?.link.blocked?.() ?? null;
  }

  /** `license_required` si alguna máquina está detenida por la licencia: la UI enseña el aviso de Terminus de pago. */
  license(context?: string): "license_required" | null {
    return this.scoped(context).some((m) => this.blocked(m.id, context) === "license_required") ? "license_required" : null;
  }

  /** «Reintentar»: vuelve a abrir las sesiones detenidas. */
  retry() {
    // Una VM apagada no se reabre aquí: reabrirla pide un ticket sin `wake` y vuelve el 409. La enciende `wake`.
    for (const m of this.members.values()) if (m.link.blocked?.() === "license_required") m.link.retry?.();
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
    if (!this.member(envelope.machine, envelope.context)) return null;
    // La llave es la lectura como la entiende esa máquina: las pestañas de otra no la cambian.
    const args = this.argsFor(envelope.machine, envelope.args ?? {}, envelope.context);
    const scope = envelope.context;
    return JSON.stringify([...(scope ? [scope] : []), envelope.command, envelope.workspace, args]);
  }

  private async readNow(envelope: Envelope, key: string): Promise<Slice> {
    const { machine, context } = envelope;
    const before = this.book.get(machine, key, context);
    const keep = (status: Slice["status"], error?: string): Slice =>
      before?.has ? { ...before, status, error } : { machine, ...(context ? { context } : {}), status, has: false, value: null, at: null, error };
    // Una máquina apagada no contesta: su última rebanada es la respuesta, sin salir a la red.
    const member = this.member(machine, context);
    // Salvo si cambió la cola de aplazadas: la copia del relay ya la refleja y la de aquí no.
    const settled = !member?.fresh || member.fresh.has(key);
    if (before?.has && member && settled && classOf(envelope.command) === "read" && this.isOff(member)) return { ...before, status: "cached", error: "machine_off" };
    // Con otro contrato no se le pregunta: lo dirá su próximo `hello` (R14) o la lista de la cuenta.
    if (member && this.isOutdated(member)) return this.settle(keep("outdated", "version_mismatch"), key);
    let slice: Slice;
    try {
      const { value, cached } = await this.send(envelope);
      if (this.member(machine, context) !== member) throw new FleetError("unknown_machine", machine);
      const at = cachedAt(cached);
      slice = { machine, ...(context ? { context } : {}), status: cached ? "cached" : "ok", has: true, value, at: at ?? Date.now() };
      if (envelope.command === "list_workspaces" && !cached) this.noteListing(machine, value, context);
      member?.fresh?.add(key);
    } catch (error) {
      if (this.member(machine, context) !== member) throw new FleetError("unknown_machine", machine);
      const e = fromRelay(error, machine);
      if (e.code === "cross_machine" || e.code === "unknown_machine") throw e;
      if (e.code === "machine_off") slice = before?.has ? { ...before, status: "cached", error: e.code } : keep("off", e.code);
      else if (e.code === "version_mismatch") slice = keep("outdated", e.code);
      else if (e.code === "license_required") slice = keep("license_required", e.code);
      // Classify before discarding the relay detail: the old engine wraps
      // unknown commands in command_failed. Never cache its arbitrary details.
      else slice = keep("no_answer", isScopeRefusal(e) ? COMMAND_NOT_HERE : isUnknownCommand(e) ? "command" : e.code);
    }
    return this.settle(slice, key);
  }

  /** Guarda la rebanada; si cambia el estado que la barra enseña de su máquina, avisa para repintarlo. */
  private settle(slice: Slice, key: string): Slice {
    const last = this.book.statuses(slice.context)[slice.machine]?.status;
    this.book.put(slice, key);
    if (this.book.statuses(slice.context)[slice.machine]?.status !== last) this.config.onSlice?.(slice.machine, slice.context);
    return slice;
  }

  /** Una llamada con el sobre: plazo por clase, un reintento y la VM encendida antes si hace falta. */
  private async send(envelope: Envelope): Promise<{ value: unknown; cached: CallResult["cached"] }> {
    const { machine, command, context } = envelope;
    const member = this.member(machine, context);
    if (!member) throw new FleetError("unknown_machine", machine);
    const args = this.argsFor(machine, envelope.args ?? {}, context);
    // Sin licencia no se pregunta nada: la sesión espera a «Reintentar».
    const stopped = member.link.blocked?.();
    const kind = classOf(command);
    // VM apagada (409 `machine_stopped` del ticket): el canal no la enciende. Un mensaje o un gesto
    // de la persona la enciende antes por el plano de control (#883); lo demás sigue detenido.
    const halted = stopped === "machine_stopped" && kind !== "read" && !PASSIVE.has(command) && !this.defers(command, args, context);
    if (stopped && !halted) throw new FleetError(stopped, machine);
    if (kind !== "read" && this.isOutdated(member)) throw new FleetError("version_mismatch", machine);
    const off = this.isOff(member);
    // Lo que la ventana pide sola (`PASSIVE`) no enciende la VM: solo un mensaje o un gesto de la persona.
    if (off && PASSIVE.has(command)) throw new FleetError("machine_off", machine);
    // Archivar, borrar, renombrar, fijar o mover de space: el relay la guarda sin encenderla.
    if (halted || (off && kind !== "read" && !this.defers(command, args, context))) {
      if (!member.info.wakes) throw new FleetError("machine_off", machine, null, false);
      // El relay enciende la VM solo con un intent; otra acción, o el canal detenido, la enciende antes el plano de control.
      if (kind === "action" || halted) await this.wakeMember(member);
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
        if (e.code === "machine_off") this.unanswered(member);
        if (e.code === "not_remotely_startable") throw new FleetError("machine_off", machine, null, false);
        const again = kind === "read" ? RETRY_READ : RETRY_ACTION;
        if (retried || command === "list_storage" || !again.has(e.code)) throw e;
        return attempt(true);
      }
    };
    const result = await attempt(false);
    if (this.member(machine, context) !== member) throw new FleetError("unknown_machine", machine);
    if (!result.cached && !result.deferred) this.answered(member);
    return { value: this.linkedOnly(member, command, result.value), cached: result.cached };
  }

  /**
   * Si el relay guarda esta acción con la máquina apagada. Mover a un space de
   * la cuenta no: ese space es de la cuenta (`share_space`), no de la cola de
   * una máquina, y sigue el camino de cualquier acción.
   */
  private defers(command: string, args: Row, context?: string): boolean {
    if (!isDeferrable(command)) return false;
    return !(command === "move_task_to_space" && typeof args.space === "string" && this.shared(context).has(args.space));
  }

  /** Los encendidos en vuelo, uno por máquina: dos intents a la vez esperan el mismo, no piden otro (`409 operation_in_progress`, #883). */
  private starting = new Map<string, Promise<void>>();

  /** Enciende la VM y espera a que diga `online`, con el tope de un intent. */
  private wakeMember(member: Member): Promise<void> {
    const key = memberKey(member.info.id, member.info.context);
    const running = this.starting.get(key);
    if (running) return running;
    const start = this.startMember(member).finally(() => this.starting.delete(key));
    this.starting.set(key, start);
    return start;
  }

  private async startMember(member: Member) {
    const { id } = member.info;
    if (alwaysOn(member.info)) throw new FleetError("machine_off", id, null, false);
    if (!this.config.wake) throw new FleetError("machine_off", id, null, true);
    const started = member.link.state() === "starting" || (await this.config.wake(id, member.info.context).catch(() => false));
    if (started === "not_startable") throw new FleetError("machine_off", id, "not_remotely_startable", false);
    if (!started) throw new FleetError("machine_off", id, "start_failed", true);
    // La sesión se detuvo al ver la VM apagada (409): ya encendida, vuelve a pedir su ticket.
    if (member.link.blocked?.() === "machine_stopped") member.link.retry?.();
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
    this.config.onChange?.(member.info.id, member.info.context);
  }

  private add(info: MachineInfo) {
    const link = this.config.connect(info);
    const member: Member = { info, link, stops: [], was: link.state(), outdated: false, engine: null, fresh: null, live: false, hint: null };
    member.stops.push(
      link.onState((state) => {
        // Cada `state` de la sesión es lo más nuevo: deja atrás la respuesta en vivo anterior.
        member.live = false;
        if (OUTDATED.includes(state)) member.outdated = true;
        const cameOn = state === "online" && member.was !== "online";
        // Se apagó en esta sesión: cada lectura vuelve a pedirse una vez a la copia del relay (no la enciende).
        if (OFF.includes(state) && (member.was === "online" || member.was === "starting")) member.fresh = new Set();
        member.was = state;
        if (cameOn && this.listening) this.config.onEvents?.(info.id, [], true, undefined, info.context);
        this.config.onChange?.(info.id, info.context);
      }),
      // Un `hello` nuevo: si ya habla este contrato, se quita la marca de desactualizada (R14).
      link.onEngine?.((engine) => {
        const verdict = this.config.compatible?.(engine.contract) ?? null;
        const featuresChanged = JSON.stringify(member.engineFeatures) !== JSON.stringify(engine.service_features);
        member.engineFeatures = engine.service_features;
        if (verdict === null && !featuresChanged) return;
        if (verdict !== null) member.engine = verdict;
        if (verdict) member.outdated = false;
        this.config.onChange?.(info.id, info.context);
      }) ?? (() => {}),
      link.onBlocked?.(() => this.config.onChange?.(info.id, info.context)) ?? (() => {}),
      link.onDeferred?.((frame) => {
        if (!frame.actions.length && !frame.done.length && !member.fresh) return;
        member.fresh = new Set();
        this.config.onDeferred?.(info.id, frame, info.context);
      }) ?? (() => {}),
      link.onEvents((page) => {
        if (!this.listening || this.isOutdated(member)) return;
        // Uno vinculado en otra máquina de la cuenta también llega por esta (el `account` del relay): eso no es una lista vieja.
        const unknown = unlinkedWorkspaces(page.events ?? [], member.info.linked ?? null).filter((w) => !this.linkedAnywhere(w, info.context));
        if (unknown.length) this.config.onUnlinked?.(info.id, unknown, info.context);
        const linked = linkedEvents(page.events ?? [], member.info.linked ?? null);
        const events = this.config.panelIds === false ? linked.map((e) => ({ name: e.name, payload: e.payload, ...(e.seq === undefined ? {} : { seq: e.seq }) })) : linked.map((e) => ({ name: e.name, payload: encodeEvent(this.context(info.context), info.id, e.name, e.payload), ...(e.seq === undefined ? {} : { seq: e.seq }) }));
        this.config.onEvents?.(info.id, events, page.gap === true, { cursor: page.cursor, runtime: page.runtime, replay: page.replay, replayId: page.replayId }, info.context);
      }),
    );
    this.members.set(memberKey(info.id, info.context), member);
    link.start();
    if (this.listening) link.subscribe(null);
    this.config.onChange?.(info.id, info.context);
  }

  private drop(member: Member) {
    for (const stop of member.stops) stop();
    member.link.close();
  }
}
