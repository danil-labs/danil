import { type ObservedTurnActivity } from "../../../../../apps/desktop/src/lib/activityObservation.ts";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { type SenderTask } from "../../../../../apps/desktop/src/lib/recipients.ts";
import { type ContentTab, type FileTab, type Tab } from "../../../../../apps/desktop/src/lib/tabs.ts";
import { esProvisional } from "../../../../../apps/desktop/src/lib/taskDraft";
import { type OlderState } from "../model/history.ts";
import { invoke } from "../../../../engine-client/src/client.ts";
import { claveDe } from "../../../../ui/src/Failure";
import { type ComandoEnVivo } from "../components/ShellCard.tsx";
import { type HandoverState } from "../model/handover.ts";
import { type Msg } from "../model/messageTypes.ts";
import { type ChatEvent, type Session, type TranscriptOrigin } from "../model/transcript.ts";
import { type PermissionRequest } from "../screens/Chat.tsx";
import { type LiveTurn } from "./sleepSession.ts";
import { createEffect, on, onCleanup, onMount, type Accessor, type Setter } from "solid-js";
import type { ContextSource, ConversationScope, Dependencies, FilterSessions, HandoffFact, HandoffPresentation, HandoffView, Hilo, IdsDeTurnos, Machine, MachineWait, PollRequest, PushedBatch, ServiceError, ServicePage, ServicePageData, StartupContext, TranscriptMetadata, Transition } from "./types.js";


/** Lo que el bloque usaba del cuerpo de App. */
export type ResyncDeps = { applyPushed: (batches: PushedBatch[]) => void; asleep: (error: unknown) => boolean; conversationScope: (id: string, projectId?: string) => ConversationScope; createServiceStream: (deps: Dependencies) => { paged: () => boolean; filterChanged: () => void; start: () => void; dispose: () => void; }; esDeLaAbierta: (session: string) => boolean; handoff: { requestStop: (scope: ConversationScope) => Promise<void>; replaceWithQueued: (scope: ConversationScope, id: string) => Promise<void>; observe: (fact: HandoffFact) => void; view: (scope: ConversationScope) => HandoffView; presentation: (scope: ConversationScope) => HandoffPresentation; blocked: (scope: ConversationScope) => boolean; reset: () => void; dispose: () => void; }; leerTarea: (project: string, id: string, before?: number | null | undefined) => Promise<Session>; lifecycleRevision: number; liveThreads: Set<string>; loadResult: (id: string, session: Session, clear: boolean, generation: number) => void; machines: Accessor<Machine[]>; marcarViva: (id: string, desde?: number, startConfirmed?: boolean) => void; pendingStarts: Map<string, symbol>; pestanas: { pinned: Accessor<ReadonlySet<string>>; isPinned: (id: string) => boolean; pin: (id: string) => void; restorable: () => string[]; replacePreviews(groups: readonly (readonly string[])[], visible: readonly (string | null)[]): void; open: Accessor<Tab[]>; active: Accessor<string | null>; activeTab: () => Tab | null; load(ws: string | null, desk?: string | null): string | null; ensure(p: { id: string; project: string; titulo: string; }): void; commitDraft(draft: string, p: { id: string; project: string; titulo: string; }): void; openObservability(title: string): void; openScreen(machine: string, title: string): void; openContent(p: ContentTab): void; activate: (id: string | null) => void; close: (id: string) => Tab | null; closeMany: (ids: readonly string[], opts?: { remember?: boolean; }) => Tab | null; canReopen: () => boolean; reopen(alive: (p: Tab) => boolean): Tab | null; attachPreviewFiles(project: string, session: string, tree: string): [string, string][]; renameFiles(session: string, tree: string, from: string, end: string): [string, string][]; navigate(id: string, url: string): void; moveToProject(session: string, project: string): void; markChanged(id: string): void; dirty: Accessor<ReadonlySet<string>>; setDirty(id: string, dirty: boolean): void; registerSaver(id: string, save: (() => Promise<boolean>) | null): void; dirtyTabsToClose(ids: string | readonly string[]): FileTab[]; saveFiles(ids: string[]): Promise<boolean>; sync(find: (id: string) => { project: string; titulo: string; } | null): string[]; }; ponerTerminal: (session: string, comando: ComandoEnVivo) => void; project: Accessor<string>; recargarMaterial: () => Promise<void>; releerTrasHueco: () => void; reponerGates: (session: string, workspace?: string | null) => Promise<void>; serviceListenersReady: Promise<unknown>; sesionesConPestana: Accessor<string[]>; sessionId: Accessor<string | null>; setConnectionError: Setter<string | null>; setDesdeDeTurno: Setter<Record<string, number>>; setEnFondo: Setter<string[]>; setError: Setter<string | null>; setPermissions: Setter<PermissionRequest[]>; settleTurn: (session: string, ok?: boolean | null, unsaved?: boolean) => Promise<void>; settlingTurns: Accessor<string[]>; soltarVistasHuerfanas: () => void; tareaDelRiel: (id: string) => SenderTask | null; terminales: Accessor<Record<string, ComandoEnVivo>>; threads: { read: (project: string, id: string, before?: number | null | undefined) => Promise<Session>; acceptSession: (id: string, session: Session, clear: boolean, generation: number, latest?: boolean | undefined) => boolean; activities: (id: string, visible: readonly Msg[]) => ObservedTurnActivity<Msg>[]; beginActivity: (id: string, startedAt: number | null, startConfirmed?: boolean) => void; finishActivity: (id: string, workspace?: string | null) => void; rows: Accessor<Record<string, Hilo>>; current: Accessor<Hilo>; messages: Accessor<Msg[]>; loading: Accessor<string | null>; origins: Accessor<Readonly<Record<string, TranscriptOrigin | null>>>; offline: Accessor<Readonly<Record<string, string>>>; machineWaits: Accessor<Readonly<Record<string, MachineWait>>>; handovers: Accessor<Readonly<Record<string, HandoverState>>>; olderAvailable: Accessor<Readonly<Record<string, boolean>>>; recentAvailable: Accessor<Readonly<Record<string, boolean>>>; olderStatus: Accessor<Readonly<Record<string, OlderState>>>; recentTail: Accessor<Readonly<Record<string, Msg[]>>>; appendLive: (session: string, messages: Msg[], workspace?: string | null) => void; appendPersisted: (session: string, messages: Msg[]) => void; appendOptimistic: (session: string, messages: Msg[]) => void; acknowledgeOptimistic: (session: string, messages: Msg[]) => void; commitUniqueTurn: (session: string, message: Msg) => void; replaceTurn: (session: string, message: Msg) => void; reviseOptimistic: (session: string, target: Msg, patch: Pick<Msg, "respuestas" | "author">) => void; rejectOptimistic: (session: string, messages: Msg[]) => void; question: (session: string, fields: Pick<Msg, "turno" | "preguntas" | "questionRequestId" | "agent">, workspace?: string | null) => void; replay: (session: string, workspace?: string | null, replayId?: string) => void; finishSteps: (session: string) => void; event: (payload: ChatEvent, metadata: TranscriptMetadata) => void; older: (project: string, id: string) => Promise<(() => void) | null>; latest: (id: string) => Promise<void>; replaceHistory: (session: string, leida: Msg[], vaciarVivo: boolean, antepuesta?: boolean, guardados?: IdsDeTurnos, cola?: IdsDeTurnos, readRevision?: number) => void; saveWorkspace: (previous: string | null) => void; activateWorkspace: (workspace: string | null) => void; resetService: () => void; adoptDraft: (id: string) => void; dropSaved: (workspace: string, id: string) => void; flush: () => void; markMachineWait: (id: string, wait: MachineWait | null) => void; markAwake: (id: string) => void; startLoading: (id: string) => void; finishLoading: (id: string) => void; reading: (id: string, active: boolean) => void; drop: (session: string) => void; dispose: () => void; }; vivas: Accessor<string[]>; workspaceActivo: Accessor<string | null>; workspaceContext: { active: Accessor<string | null>; mode: Accessor<string | null>; root: Accessor<string | null>; confirmed: Accessor<boolean>; generation: () => number; beginTransition: (startup: StartupContext) => Transition; activate: (token: Transition) => boolean; beginMaterial: () => Readonly<{ generation: number; material: number; }>; current: (token: Readonly<{ generation: number; material: number; }>) => boolean; currentMaterial: (token: Readonly<{ generation: number; material: number; }>) => boolean; confirmContext: (token: Readonly<{ generation: number; material: number; }>, candidate: string | null, listed: ContextSource[]) => "obsolete" | "unavailable" | "accepted"; modeChanged: (workspace: string | null, value: string | null, requestedGeneration?: number) => void; dispose: () => void; } };

/** Movido tal cual de packages/shell/src/app/App.tsx (líneas 2197–2350, tarea 2.5). Lo que usaba del cuerpo de App llega por `deps`. */
export function createResync(deps: ResyncDeps) {
  const { applyPushed, asleep, conversationScope, createServiceStream, esDeLaAbierta, handoff, leerTarea, liveThreads, loadResult, machines, marcarViva, pendingStarts, pestanas, project, recargarMaterial, releerTrasHueco, sesionesConPestana, sessionId, setConnectionError, setDesdeDeTurno, setEnFondo, setError, setPermissions, settleTurn, settlingTurns, soltarVistasHuerfanas, tareaDelRiel, terminales, threads, vivas, workspaceActivo, workspaceContext } = deps;
  const ponerTerminal: ResyncDeps["ponerTerminal"] = (...a: Parameters<ResyncDeps["ponerTerminal"]>) => deps.ponerTerminal(...a);
  const reponerGates: ResyncDeps["reponerGates"] = (...a: Parameters<ResyncDeps["reponerGates"]>) => deps.reponerGates(...a);
  /** `session_resync`: el turno en curso no cupo en el reenvío; se relee lo guardado y se conserva lo vivo. */
  function releerUna(session: string) {
    const generation = workspaceContext.generation();
    const projectId = esDeLaAbierta(session) ? project() : pestanas.open().find((p) => p.id === session)?.project ?? tareaDelRiel(session)?.folder;
    if (projectId === undefined) return;
    void leerTarea(projectId, session)
      .then((s) => loadResult(session, s, false, generation))
      .catch(() => {});
  }
  // El filtro de la suscripción: de las demás tareas solo llegan inicio y fin, no su flujo token a token.
  const tareasQueSeVen = () => {
    const ids = new Set([...sesionesConPestana(), sessionId() ?? "", ...vivas()]);
    for (const key of liveThreads) ids.add(key.slice(key.indexOf("/") + 1));
    return [...ids].filter((id) => id !== "" && !esProvisional(id)).sort();
  };
  const enviarFiltro = () => serviceStream.filterChanged();
  createEffect(on([sesionesConPestana, sessionId, vivas], enviarFiltro, { defer: true }));

  const serviceStream = createServiceStream({
    ready: () => deps.serviceListenersReady,
    read: (request: PollRequest) => invoke<ServicePage>("service_poll", request),
    filter: (sessions: FilterSessions) => invoke("service_filter", { sessions }),
    visibleSessions: tareasQueSeVen,
    applyBatches: applyPushed,
    applyPage: (page: ServicePageData, recovered: boolean) => {
      if (page.reset || page.gap || page.resync || page.streams || recovered) window.dispatchEvent(new CustomEvent("harness:service-resync"));
      // Un stream de comando cortado (árbol, git) se relee, pero no es salida en vivo perdida.
      if (page.reset || page.gap || page.resync || page.streams) releerTrasHueco();
      const affectedTurns = vivas().length > 0;
      if (page.reset) {
        threads.flush();
        liveThreads.clear();
        enviarFiltro();
        threads.resetService();
        setPermissions([]);
        if (affectedTurns) setError(t("chat.error.service_restarted"));
        void reconcileActiveTurns();
      }
      // Un reinicio sin turnos vivos también corta el stream (`page.gap`); sin
      // esta guarda el aviso de hueco sale sin que nada se haya perdido.
      if (page.gap && !page.reset && affectedTurns) setError(t("chat.error.service_gap"));
    },
    classifyFailure: (error: ServiceError) => {
      const code = claveDe(error);
      if (code === "shell.service.machine_off" || code === "shell.service.machine_starting" || asleep(error)) return "sleep";
      if (code === "shell.service.engine_missing") return "missing";
      if (code === "shell.service.managed") return "managed";
      return code === "shell.service.engine_down" ? "down" : "unavailable";
    },
    connectionStatus: (key: string | null) => setConnectionError(key === null ? null : t(key)),
  });
  onMount(serviceStream.start);
  onCleanup(serviceStream.dispose);

  async function reconcileActiveTurns() {
    const workspace = workspaceActivo();
    if (!workspace) return;
    const revision = deps.lifecycleRevision;
    const generation = workspaceContext.generation();
    try {
      const [active, timing] = await Promise.all([
        invoke<string[]>("list_active_turns", { workspace }),
        invoke<LiveTurn[]>("list_live_turns").catch(() => []),
      ]);
      if (generation !== workspaceContext.generation() || revision !== deps.lifecycleRevision) return;
      const enVuelo = timing.filter((turn) => turn.workspace === workspace && active.includes(turn.session));
      setDesdeDeTurno((previous) => ({ ...previous, ...Object.fromEntries(
        enVuelo.map((turn) => [turn.session, turn.started_at]),
      ) }));
      // Una ventana que reabre con un `!` en marcha lo pinta como comando y no
      // como turno del agente; el diario repite después su salida.
      for (const turn of enVuelo) {
        if (turn.shell && !terminales()[turn.session]) {
          ponerTerminal(turn.session, { ...turn.shell, cwd: null, output: "", truncated: false, desde: turn.started_at });
        }
      }
      // El evento efímero no basta al reabrir una ventana.
      const esperandoHijas = new Set(enVuelo.filter((turn) => turn.background).map((turn) => turn.session));
      const conocidas = new Set(enVuelo.filter((turn) => typeof turn.background === "boolean").map((turn) => turn.session));
      setEnFondo((ids) => {
        const siguiente = [...new Set([...ids.filter((id) => !conocidas.has(id) || esperandoHijas.has(id)), ...esperandoHijas])];
        return siguiente.length === ids.length && siguiente.every((id) => ids.includes(id)) ? ids : siguiente;
      });
      for (const id of active) pendingStarts.delete(id);
      const nuevas = active.filter((id) => !vivas().includes(id));
      const finished = vivas().filter((id) => !active.includes(id) && !pendingStarts.has(id));
      for (const id of nuevas) void reponerGates(id);
      for (const id of active) if (!settlingTurns().includes(id)) { marcarViva(id, undefined, true); handoff.observe({ kind: "started", scope: conversationScope(id) }); }
      for (const id of finished) void settleTurn(id);
    } catch {
      // Un IPC fallido no demuestra que el turno haya terminado.
    }
  }

  // Con el índice de estado ligero del motor, los turnos vivos se reconcilian por
  // eventos (`session`, una copia de otra máquina, un hueco); sin él, cada 5 s.
  const turnosPorEventos = () => machines().find((m) => m.local)?.features?.includes("light_state_v1") === true;
  let reconcileTimer: ReturnType<typeof setTimeout> | undefined;
  let lastReconcile = 0;
  /** Una tanda de eventos reconcilia una vez, como mucho cada 2 s. */
  function reconcileSoon() {
    if (!turnosPorEventos() || reconcileTimer) return;
    reconcileTimer = setTimeout(() => {
      reconcileTimer = undefined;
      lastReconcile = Date.now();
      void reconcileActiveTurns();
    }, Math.max(300, 2_000 - (Date.now() - lastReconcile)));
  }
  onCleanup(() => clearTimeout(reconcileTimer));
  createEffect(() => {
    if (turnosPorEventos()) return;
    const timer = setInterval(() => void reconcileActiveTurns(), 5000);
    onCleanup(() => clearInterval(timer));
  });

  onMount(() => {
    const refresh = () => void reconcileActiveTurns();
    const resync = () => { reconcileSoon(); void recargarMaterial(); };
    const refrescarAgentes = () => {
      // Al volver a la ventana (o a la pestaña) se releen los agentes: pueden
      // haberse escrito o editado archivos en `.agents/` por fuera de la app.
      window.dispatchEvent(new CustomEvent("harness:encargados"));
      window.dispatchEvent(new CustomEvent("harness:profiles"));
    };
    const alHacerseVisible = () => {
      if (document.visibilityState === "visible") refrescarAgentes();
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("focus", refrescarAgentes);
    window.addEventListener("harness:service-resync", resync);
    document.addEventListener("visibilitychange", alHacerseVisible);
    onCleanup(() => {
      window.removeEventListener("harness:service-resync", resync);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("focus", refrescarAgentes);
      document.removeEventListener("visibilitychange", alHacerseVisible);
    });
  });
  createEffect(on(workspaceActivo, () => void reconcileActiveTurns()));

  // Los tres oyentes de Rust. Los nombres van como cadena literal:
  // `scripts/guards/bridge.mjs` comprueba que alguien emita lo que la interfaz
  // escucha, y es lo único que sabe leer; una constante lo deja ciego sin
  // fallar. Se suscriben una vez: las funciones de respuesta leen
  // `sessionId()` y las demás señales al recibir cada evento, y copiar sus
  // valores al montar las dejaría trabajando con la sesión anterior.

  // Las capas nativas son hijas de la ventana, no del documento: una recarga
  // del webview —HMR en desarrollo, o un proceso de contenido que se cae y
  // vuelve— las dejaría flotando sobre la interfaz sin pestaña que las
  // cierre. Aquí es el primer instante en que se sabe que el documento es
  // nuevo. Ver `sites::site_sweep`.
  onMount(() => void invoke("site_sweep").catch(() => {}));
  // Lo mismo con los Tinymist de la vista de Typst: sin visor que los suelte, seguirían vivos.
  onMount(soltarVistasHuerfanas);
  return { enviarFiltro, reconcileActiveTurns, reconcileSoon, releerUna, serviceStream };
}
