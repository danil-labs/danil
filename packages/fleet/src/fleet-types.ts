import { type Blocked, type CallResult, type DeferredFrame, type EngineInfo, type EventsPage, type MachineState, type SystemId } from "../../computers/src/index.ts";
import { type Deadlines } from "./deadlines.ts";
import { type StorageLike } from "./slices.ts";
import { type ListedWorkspace } from "./workspace-listing.ts";

export type Row = Record<string, unknown>;

/** `outdated`: su motor habla otro contrato, sabido por el plano de control. `linked`: `null` enseña todos sus workspaces. */
/** `os` solo si se sabe: la tarjeta de la tarea lo lee y, si falta, no inventa un sistema. */
/** `features`: lo que su motor anuncia (`status.service_features`); cada función se enciende por máquina. */
/** `version`: la `host_version` de su último `hello`, según el plano de control; se conserva apagada. */
/** `child`: una máquina hija de esta computadora (Linux en esta PC): no está en el registro de la cuenta y es de todos sus workspaces. */
/** `organization`: es el endpoint de la persona en el servidor de una organización y atiende esos workspaces (`organization` de su fila). */
/** `kind` y `organizationId`: lo que dice `GET /v1/machines` (`kind=organization` con su `organization_id`, o `personal`); opcionales. */
export type MachineInfo = {
  id: string;
  name: string;
  wakes: boolean;
  outdated?: boolean;
  linked?: ReadonlySet<string> | null;
  os?: SystemId;
  features?: readonly string[];
  version?: string;
  child?: boolean;
  organization?: { id: string; workspaces: readonly { id: string; name: string }[] } | null;
  kind?: string | null;
  /** Máquina hospedada de su organización (no la Mac o PC de una persona): sirve los workspaces de la organización. */
  hosted?: boolean;
  organizationId?: string | null;
  context?: string;
};

/** Un workspace que contestó una máquina en `list_workspaces`. */
export type Listed = ListedWorkspace;

/** Si `info` atiende `workspace` por una organización, según su fila. */
export const serves = (info: MachineInfo | undefined, workspace: string): boolean => !!info?.organization?.workspaces.some((w) => w.id === workspace);

/** El endpoint de una organización vive en su servidor, siempre encendido: nunca se enciende desde aquí. */
export const alwaysOn = (info: MachineInfo): boolean => !!info.organization;

/** La fila del plano de control dice `wakeable` para un endpoint (enciende su servidor); la flota no. */
export const normalized = (info: MachineInfo): MachineInfo => {
  const next = alwaysOn(info) && info.wakes ? { ...info, wakes: false } : { ...info };
  if (next.context === "") delete next.context;
  return next;
};

export type Power = "on" | "off" | "starting" | "outdated";

export type Envelope = { context?: string; machine: string; workspace: string | null; command: string; args?: Row };

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

export type FleetEvent = { name: string; payload: unknown; seq?: number };

export type FleetConfig = {
  /** La máquina de la ventana (sus ids van sueltos), o `null` en la web. */
  self?: string | null;
  connect(info: MachineInfo): Link;
  /** Si este cliente habla el contrato de un motor: `null` si no se sabe. */
  compatible?(contract: string | null): boolean | null;
  /** Enciende una VM por el plano de control; `false` si no se pudo, `not_startable` si no es suya de encender. */
  wake?(machine: string, context?: string): Promise<boolean | "not_startable">;
  storage?: StorageLike | null;
  deadlines?: Partial<Deadlines>;
  /** Una máquina cambió de estado, o se agregó, quitó o renombró. */
  onChange?(machine: string, context?: string): void;
  /** Cambió el estado de la última rebanada de una máquina (`sliceStatuses`): solo para repintarlo. */
  onSlice?(machine: string, context?: string): void;
  /** Eventos de otra máquina, ya con los ids del panel. `gap`: se perdieron algunos y hay que releer. */
  onEvents?(machine: string, events: FleetEvent[], gap: boolean, context?: Pick<EventsPage, "cursor" | "runtime" | "replay" | "replayId">, sessionContext?: string): void;
  /** Cambió la cola de acciones aplazadas de `machine` (se encoló o se aplicó una): la lista se relee. */
  onDeferred?(machine: string, frame: DeferredFrame, context?: string): void;
  /**
   * Llegaron eventos de `workspaces` que ninguna máquina tiene vinculados según
   * su fila (`MachineInfo.linked`). El relay ya los dejó pasar: se vincularon
   * después de listar las computadoras, y la lista se relee para verlos.
   */
  onUnlinked?(machine: string, workspaces: string[], context?: string): void;
  /** `false`: los eventos llegan con los ids de su máquina (el teléfono nombra cada tarea con su máquina aparte). */
  panelIds?: boolean;
};

export const OFF: readonly MachineState[] = ["offline", "stopped", "provisioning"];

export const OUTDATED: readonly MachineState[] = ["version_mismatch", "outdated"];

/** Fallos que se reintentan una vez: el relay perdió el conector, o una lectura no llegó a tiempo. */
export const RETRY_ACTION = new Set(["machine_lost"]);

export const RETRY_READ = new Set(["machine_lost", "machine_timeout", "io"]);

/**
 * `outdated`: el relay contestó `version_mismatch`. `engine`: lo que dijo el último
 * `hello` (`true` compatible), que manda sobre el contrato que listó el plano de control.
 * `fresh`: con la cola de aplazadas cambiada, o la máquina recién apagada (`null` si
 * nada de eso), las lecturas que ya se volvieron a pedir al relay; las demás no salen
 * de la última rebanada guardada. Al apagarse, la VM deja en el relay su copia, más
 * nueva que lo leído aquí mientras estaba encendida (la respuesta que terminó al final).
 */
/**
 * `live`: contestó en vivo (sin `cached`) después del último `state` de su sesión,
 * que entonces no decía `online`; lo más nuevo manda hasta el próximo `state`.
 * `hint`: lo que dijo otra fuente (la vista del motor) antes del primer `state`.
 */
export type Member = { info: MachineInfo; link: Link; stops: (() => void)[]; was: MachineState; outdated: boolean; engine: boolean | null; fresh: Set<string> | null; live: boolean; hint: MachineState | null };

export function sameLinks(a: ReadonlySet<string> | null, b: ReadonlySet<string> | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.size !== b.size) return false;
  return [...a].every((id) => b.has(id));
}
