import { type ObservedTurnActivity } from "../../../../../apps/desktop/src/lib/activityObservation.ts";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { type Agent, type AgentModels, type ModoDePermiso, type Project } from "../../../../../apps/desktop/src/lib/model.ts";
import { type CatalogosDeModelos, type OpcionDeModelo } from "../../../../../apps/desktop/src/lib/models.ts";
import { type Frase } from "../../../../../apps/desktop/src/lib/prose.ts";
import { type SenderTask } from "../../../../../apps/desktop/src/lib/recipients.ts";
import { type ResourceState } from "../../../../../apps/desktop/src/lib/resource.ts";
import { deliver, listen } from "../../../../../apps/desktop/src/lib/serviceEvents";
import { type JournalEvent } from "../../../../../apps/desktop/src/lib/serviceEvents.ts";
import { type CliCommand, type Skill } from "../../../../../apps/desktop/src/lib/skills.ts";
import { type Superficie } from "../../../../../apps/desktop/src/lib/surfaces.ts";
import { type ContentTab, type FileTab, type Tab } from "../../../../../apps/desktop/src/lib/tabs.ts";
import { type TaskMention } from "../../../../../apps/desktop/src/lib/taskMentions.ts";
import { type OlderState } from "../model/history.ts";
import { invoke } from "../../../../engine-client/src/client.ts";
import { claveDe, prosaDe } from "../../../../ui/src/Failure";
import { type Encolado } from "../components/MessageQueue.tsx";
import { type HandoverState } from "../model/handover.ts";
import { type Msg } from "../model/messageTypes.ts";
import { type ChatEvent, type Session, type TranscriptOrigin } from "../model/transcript.ts";
import { type PermissionRequest } from "../screens/Chat.tsx";
import { TRANSPORTE } from "./sleepSession.ts";
import { batch, createEffect, on, onCleanup, onMount, type Accessor, type Setter } from "solid-js";

type ComposerConfiguration = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type ContextSource = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type ConversationScope = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type DraftSelection = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type Forma = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type HandoffFact = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type HandoffPresentation = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type HandoffView = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type Hilo = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type IdsDeTurnos = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type MachineWait = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type PushedBatch = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type ReadyScope = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type Saved = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type SessionRow = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type Startup = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type StartupContext = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type TranscriptMetadata = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type Transition = any; // pendiente: el tipo llega de otra feature por el shell (R3)

/** Lo que el bloque usaba del cuerpo de App. */
export type AttachmentsMountDeps = { advanceTurn: (id: string) => number; agent: Accessor<string>; aplicar: (a: Startup) => Promise<void>; asleep: (error: unknown) => boolean; bloqueo: Accessor<Frase | null>; closeActiveTab: () => void; composer: { agents: Accessor<Agent[]>; agent: Accessor<string>; superficies: Accessor<Superficie[] | null>; superficie: Accessor<string>; catalogos: Accessor<CatalogosDeModelos>; models: Accessor<AgentModels | null>; modelosParaAgentes: Accessor<{ superficies: Superficie[]; catalogos: CatalogosDeModelos; }>; model: Accessor<string>; effort: Accessor<string>; modo: Accessor<string>; modos: Accessor<ModoDePermiso[]>; skills: Accessor<Skill[]>; cliCommands: Accessor<CliCommand[]>; sideCommand: Accessor<string | null>; menu: () => Superficie[] | null; options: () => { headers: { "x-terminus-workspace"?: string | undefined; "x-terminus-machine"?: string | undefined; }; }; installEffects: () => void; refreshProviders: () => Promise<void>; prepareCredits: (prepare: (headers: Record<string, string>) => Promise<unknown>) => Promise<void>; startNewDraft: () => void; refreshSurfaces: (inicial: boolean) => Promise<void>; refreshCommands: (a: string) => void; readModels: (a: string, forzar?: boolean) => Promise<void>; snapshot: () => ComposerConfiguration; effortForTurn: () => string | null; restoreDraft: (configuration?: ComposerConfiguration) => void; restoreSessionDraft: (draft: DraftSelection, session?: { provider?: string | null; }) => void; useProfile: (profile: { provider?: string | null; model?: string | null; effort?: string | null; }) => void; resumeTask: (selection: { provider: string; model: string; effort: string; mode?: string; }) => void; runtimeFact: (fact: { kind: "model" | "effort" | "mode"; value: string; }) => void; selectModel: (choice: OpcionDeModelo) => string; chooseEffort: (id: string) => void; chooseMode: (id: string) => void; unavailable: () => void; dispose: () => void; }; conversationScope: (id: string, projectId?: string) => ConversationScope; createBatchDelivery: (deps: { resync: (session: string) => void; replay: (session: string, workspace?: string | null, replayId?: string) => void; deliver: (events: readonly JournalEvent[]) => void; }) => (batches: PushedBatch[]) => void; enCache: Accessor<boolean>; finishedTurns: Map<string, boolean | null | undefined>; grupos: Accessor<string[]>; handoff: { requestStop: (scope: ConversationScope) => Promise<void>; replaceWithQueued: (scope: ConversationScope, id: string) => Promise<void>; observe: (fact: HandoffFact) => void; view: (scope: ConversationScope) => HandoffView; presentation: (scope: ConversationScope) => HandoffPresentation; blocked: (scope: ConversationScope) => boolean; reset: () => void; dispose: () => void; }; hilos: Accessor<Record<string, Hilo>>; leerTarea: (project: string, id: string, before?: number | null | undefined) => Promise<Session>; listaBasta: (lista: Forma) => boolean; loadResult: (id: string, session: Session, clear: boolean, generation: number) => void; mandarElegido: (session: string) => undefined; marcarQuieta: (id: string) => void; pestanas: { pinned: Accessor<ReadonlySet<string>>; isPinned: (id: string) => boolean; pin: (id: string) => void; restorable: () => string[]; replacePreviews(groups: readonly (readonly string[])[], visible: readonly (string | null)[]): void; open: Accessor<Tab[]>; active: Accessor<string | null>; activeTab: () => Tab | null; load(ws: string | null, desk?: string | null): string | null; ensure(p: { id: string; project: string; titulo: string; }): void; commitDraft(draft: string, p: { id: string; project: string; titulo: string; }): void; openObservability(title: string): void; openScreen(machine: string, title: string): void; openContent(p: ContentTab): void; activate: (id: string | null) => void; close: (id: string) => Tab | null; closeMany: (ids: readonly string[], opts?: { remember?: boolean; }) => Tab | null; canReopen: () => boolean; reopen(alive: (p: Tab) => boolean): Tab | null; attachPreviewFiles(project: string, session: string, tree: string): [string, string][]; renameFiles(session: string, tree: string, from: string, end: string): [string, string][]; navigate(id: string, url: string): void; moveToProject(session: string, project: string): void; markChanged(id: string): void; dirty: Accessor<ReadonlySet<string>>; setDirty(id: string, dirty: boolean): void; registerSaver(id: string, save: (() => Promise<boolean>) | null): void; dirtyTabsToClose(ids: string | readonly string[]): FileTab[]; saveFiles(ids: string[]): Promise<boolean>; sync(find: (id: string) => { project: string; titulo: string; } | null): string[]; }; project: Accessor<string>; projectCatalog: { rows: Accessor<Project[]>; readyScope: Accessor<ReadyScope | null>; state: Accessor<ResourceState<string, Project[]>>; refresh: () => Promise<Project[]>; changed: () => Promise<Project[]>; fromCache(projects: Project[]): void; workspaceChanged(preserveCached?: boolean): void; discardUnconfirmedCache(): void; readForMachine(machine: string): Promise<Project[]>; rename: (id: string, name: string) => Promise<void>; attach: (id: string, source: string) => Promise<void>; detach: (id: string, source: string) => Promise<void>; workTree: (id: string, dir: string | null) => Promise<void>; remove: (id: string) => Promise<void>; dispose(): void; }; recargarMaterial: () => Promise<void>; reconciliar: (previa: Forma | null, arranque: Forma) => "aplicar" | "nada"; refreshSessions: (proyectos: string[]) => Promise<void>; releerProyectos: () => Promise<void>; releerUna: (session: string) => void; sessionId: Accessor<string | null>; setBloqueo: Setter<Frase | null>; setEnCache: Setter<boolean>; setEnFondo: Setter<string[]>; setPermissions: Setter<PermissionRequest[]>; setSesiones: Setter<Record<string, SessionRow[]>>; setSettings: Setter<string | null>; setSettlingTurns: Setter<string[]>; setStartupReadError: Setter<string | null>; soltarHilo: (session: string) => void; soltarTerminal: (session: string) => void; tareaDelRiel: (id: string) => SenderTask | null; taskQueues: { items: Accessor<Encolado[]>; owner: Accessor<string | null>; editing: Accessor<boolean>; saved: (session: string) => Readonly<Saved> | undefined; openSession: (session: string, project: string, isCurrent?: () => boolean, fromEngine?: boolean) => Promise<void>; detach: () => void; remove: (id: string, session?: string | null) => void; persist: (session: string, project: string, queued: Encolado[]) => Promise<unknown>; adopt: (session: string) => string; editMode: (value: boolean) => boolean; enqueue: (message: Encolado, front?: boolean) => Encolado[]; edit: (id: string, text: string, mentions?: TaskMention[]) => Encolado[]; prioritize: (id: string) => Encolado[]; workspaceChanged: () => void; dispose: () => void; }; threads: { read: (project: string, id: string, before?: number | null | undefined) => Promise<Session>; acceptSession: (id: string, session: Session, clear: boolean, generation: number, latest?: boolean | undefined) => boolean; activities: (id: string, visible: readonly Msg[]) => ObservedTurnActivity<Msg>[]; beginActivity: (id: string, startedAt: number | null, startConfirmed?: boolean) => void; finishActivity: (id: string, workspace?: string | null) => void; rows: Accessor<Record<string, Hilo>>; current: Accessor<Hilo>; messages: Accessor<Msg[]>; loading: Accessor<string | null>; origins: Accessor<Readonly<Record<string, TranscriptOrigin | null>>>; offline: Accessor<Readonly<Record<string, string>>>; machineWaits: Accessor<Readonly<Record<string, MachineWait>>>; handovers: Accessor<Readonly<Record<string, HandoverState>>>; olderAvailable: Accessor<Readonly<Record<string, boolean>>>; recentAvailable: Accessor<Readonly<Record<string, boolean>>>; olderStatus: Accessor<Readonly<Record<string, OlderState>>>; recentTail: Accessor<Readonly<Record<string, Msg[]>>>; appendLive: (session: string, messages: Msg[], workspace?: string | null) => void; appendPersisted: (session: string, messages: Msg[]) => void; appendOptimistic: (session: string, messages: Msg[]) => void; acknowledgeOptimistic: (session: string, messages: Msg[]) => void; commitUniqueTurn: (session: string, message: Msg) => void; replaceTurn: (session: string, message: Msg) => void; reviseOptimistic: (session: string, target: Msg, patch: Pick<Msg, "respuestas" | "author">) => void; rejectOptimistic: (session: string, messages: Msg[]) => void; question: (session: string, fields: Pick<Msg, "turno" | "preguntas" | "questionRequestId" | "agent">, workspace?: string | null) => void; replay: (session: string, workspace?: string | null, replayId?: string) => void; finishSteps: (session: string) => void; event: (payload: ChatEvent, metadata: TranscriptMetadata) => void; older: (project: string, id: string) => Promise<(() => void) | null>; latest: (id: string) => Promise<void>; replaceHistory: (session: string, leida: Msg[], vaciarVivo: boolean, antepuesta?: boolean, guardados?: IdsDeTurnos, cola?: IdsDeTurnos, readRevision?: number) => void; saveWorkspace: (previous: string | null) => void; activateWorkspace: (workspace: string | null) => void; resetService: () => void; adoptDraft: (id: string) => void; dropSaved: (workspace: string, id: string) => void; flush: () => void; markMachineWait: (id: string, wait: MachineWait | null) => void; markAwake: (id: string) => void; startLoading: (id: string) => void; finishLoading: (id: string) => void; reading: (id: string, active: boolean) => void; drop: (session: string) => void; dispose: () => void; }; turnRevisions: Map<string, number>; vivas: Accessor<string[]>; workspaceContext: { active: Accessor<string | null>; mode: Accessor<string | null>; root: Accessor<string | null>; confirmed: Accessor<boolean>; generation: () => number; beginTransition: (startup: StartupContext) => Transition; activate: (token: Transition) => boolean; beginMaterial: () => Readonly<{ generation: number; material: number; }>; current: (token: Readonly<{ generation: number; material: number; }>) => boolean; currentMaterial: (token: Readonly<{ generation: number; material: number; }>) => boolean; confirmContext: (token: Readonly<{ generation: number; material: number; }>, candidate: string | null, listed: ContextSource[]) => "obsolete" | "unavailable" | "accepted"; modeChanged: (workspace: string | null, value: string | null, requestedGeneration?: number) => void; dispose: () => void; } };

/** Movido tal cual de packages/shell/src/app/App.tsx (líneas 2006–2194, tarea 2.5). Lo que usaba del cuerpo de App llega por `deps`. */
export function createAttachmentsMount(deps: AttachmentsMountDeps) {
  const { advanceTurn, agent, aplicar, asleep, bloqueo, closeActiveTab, composer, conversationScope, createBatchDelivery, enCache, finishedTurns, grupos, handoff, hilos, leerTarea, listaBasta, loadResult, marcarQuieta, pestanas, project, projectCatalog, recargarMaterial, reconciliar, refreshSessions, releerProyectos, sessionId, setBloqueo, setEnCache, setEnFondo, setPermissions, setSesiones, setSettings, setSettlingTurns, setStartupReadError, soltarHilo, tareaDelRiel, taskQueues, threads, turnRevisions, vivas, workspaceContext } = deps;
  const mandarElegido: AttachmentsMountDeps["mandarElegido"] = (...a: Parameters<AttachmentsMountDeps["mandarElegido"]>) => deps.mandarElegido(...a);
  const releerUna: AttachmentsMountDeps["releerUna"] = (...a: Parameters<AttachmentsMountDeps["releerUna"]>) => deps.releerUna(...a);
  const soltarTerminal: AttachmentsMountDeps["soltarTerminal"] = (...a: Parameters<AttachmentsMountDeps["soltarTerminal"]>) => deps.soltarTerminal(...a);
  onMount(() => {
    // Aquí es cuando deja de verse la ventana en blanco: `Setup` no monta esto
    // hasta que su comprobación vuelve. Sin esta línea el arranque no se mide
    // en ningún sitio y cualquier mejora suya es una opinión.
    void invoke("window_ready", { at: Math.round(performance.now()) });
    // El webview es la mayor parte de la memoria de la app y nadie sabe de qué.
    // Nodos, heap y lo que la ventana retiene separan las causas posibles, que
    // piden arreglos distintos. `memory` no existe en todos los motores: cero dice «no se sabe».
    const vitales = () => {
      const memoria = (performance as { memory?: { usedJSHeapSize: number } }).memory;
      const retenidos = Object.values(hilos());
      void invoke("window_vitals", {
        nodes: document.getElementsByTagName("*").length,
        heapMb: Math.round((memoria?.usedJSHeapSize ?? 0) / 1048576),
        tabs: pestanas.open().length,
        threads: retenidos.length,
        messages: retenidos.reduce((n, h) => n + h.base.length + h.vivo.length, 0),
      });
    };
    vitales();
    const latido = setInterval(vitales, 300_000);
    onCleanup(() => clearInterval(latido));
    const closeTab = listen("close-tab", closeActiveTab);
    onCleanup(() => void closeTab.then((unlisten) => unlisten()));

    // Sin respuesta (una máquina apagada sin copia, en la web) se queda la lista de antes.
    void composer.refreshProviders();
    // Lo primero de todo: sin workspace no hay dónde leer ni escribir. El
    // arranque migra lo que hubiera suelto de antes y devuelve cuál quedó
    // activo. Lo que el workspace tiene es su fuente de contexto, no «dónde
    // están los proyectos»: lo que quede en `localStorage` de cuando esa
    // carpeta era una preferencia de esta máquina se lee UNA vez, aquí.
    let workspaceRequest = 0;
    // `workspaces_startup` migra dentro y tarda minutos; la ventana abre con
    // `list_workspaces` y el arranque la confirma al llegar (`early-startup.ts`).
    let arranqueLlego = false;
    let aplicadaDeLista: Startup | null = null;
    void invoke<Startup>("list_workspaces").then((lista) => {
      if (arranqueLlego || workspaceRequest !== 0 || bloqueo()) return;
      if (!listaBasta(lista)) return;
      aplicadaDeLista = lista;
      return aplicar(lista);
    }).catch(() => {
      // Sin lista se espera al arranque, como antes: su error es el que se pinta.
    });
    // Que el servicio no conteste todavía no es una respuesta. Recién
    // instalado arranca en frío —`workspaces_startup` tardó nueve segundos
    // en una medición— y el primer intento de la ventana se pasa del plazo:
    // la app abría a medias y no se recuperaba sola.
    const arrancar = async (quedan: number) => {
      try {
        const a = await invoke<Startup>("workspaces_startup");
        arranqueLlego = true;
        // `bloqueo` no pasa por `aplicar`: es lo que lo hace seguro. Viene
        // con `workspaces` y `active` vacíos, que para `aplicar` significan
        // «primer arranque» y abren el alta — la negativa acabaría
        // invitando a crear un workspace en la carpeta que se negó a tocar.
        if (a.bloqueo) {
          // Antes que `workspaceRequest`: tapa aunque la lista ya abriera la ventana.
          setEnCache(false);
          setBloqueo(a.bloqueo);
          return;
        }
        if (workspaceRequest !== 0) return;
        setStartupReadError(null);
        // Lo que la lista ya pintó se queda si el arranque dice lo mismo:
        // volver a aplicar cerraría la tarea que la persona ya abrió.
        if (reconciliar(aplicadaDeLista, a) === "nada") return;
        await aplicar(a);
      } catch (e) {
        if (workspaceRequest !== 0) return;
        if (quedan > 0 && TRANSPORTE.has(claveDe(e) ?? "")) {
          setTimeout(() => void arrancar(quedan - 1), 1000);
          return;
        }
        // Una máquina apagada tiene su indicador; al conectarse trae sus workspaces.
        if (!asleep(e)) setStartupReadError(prosaDe(e));
        // La lista ya abrió la ventana: se dice el error y no se vacía lo que se está usando.
        if (aplicadaDeLista) return;
        if (enCache()) {
          batch(() => {
            setEnCache(false);
            projectCatalog.discardUnconfirmedCache();
            setSesiones({});
          });
        }
        // Sin arranque no hay workspace: no hay nada que ofrecer. Dejarlo
        // en «leyendo» pintaría una caja muda esperando una respuesta que
        // ya falló; vacío es lo que hay, y encima está el error.
        composer.unavailable();
      }
    };
    void arrancar(10);

    // El selector de workspace vive en otra pantalla y no sabe nada de esta. Se
    // hablan por el evento y no por props para que se pueda mover de sitio —al
    // pie del sidebar— sin tocar a nadie.
    const alMudar = () => {
      const request = ++workspaceRequest;
      void invoke<Startup>("list_workspaces")
        .then((startup) => request === workspaceRequest ? aplicar(startup) : undefined)
        .catch((e) => { if (request === workspaceRequest && !asleep(e)) setStartupReadError(prosaDe(e)); });
    };
    window.addEventListener("harness:workspace", alMudar);
    onCleanup(() => window.removeEventListener("harness:workspace", alMudar));

    // Y el otro aviso, que se parece y no es el mismo: cambió el material
    // de este workspace, no el workspace. Son dos eventos: dos
    // consecuencias distintas, una mudanza y un estante nuevo.
    // Las fuentes de skills también avisan por aquí y cambian el menú de `/`.
    const alCambiarMaterial = () => {
      void recargarMaterial();
      composer.refreshCommands(agent());
    };
    window.addEventListener("harness:sources", alCambiarMaterial);
    onCleanup(() =>
      window.removeEventListener("harness:sources", alCambiarMaterial),
    );

    // Lo piden las vistas que necesitan un plugin: `DrawioMcpCanvas.tsx`.
    const alPedirAjustes = (e: Event) => {
      const panel = (e as CustomEvent<unknown>).detail;
      setSettings(typeof panel === "string" ? panel : "");
    };
    window.addEventListener("harness:open-settings", alPedirAjustes);
    onCleanup(() =>
      window.removeEventListener("harness:open-settings", alPedirAjustes),
    );
  });

  // Y al revés: quien ofrezca cambiar de workspace sabe que hay un agente
  // contestando. El bloqueo de verdad lo impone el backend, esto es para
  // no ofrecer un clic que va a fallar. `turn`, no `turno` (AGENTS.md §
  // Qué comprueba cada guarda); `dispatchEvent` sin suscriptores no avisa,
  // igual que `app.emit`. Viaja la cuenta real de `vivas`, no el `busy`
  // de la sesión visible.
  createEffect(
    on(vivas, (v) =>
      window.dispatchEvent(
        new window.CustomEvent("harness:turn", { detail: v.length }),
      ),
    ),
  );

  async function settleTurn(session: string, ok?: boolean | null, unsaved = false) {
    const generation = workspaceContext.generation();
    const revision = advanceTurn(session);
    finishedTurns.set(session, ok);
    batch(() => {
      setSettlingTurns((ids) => [...new Set([...ids, session])]);
      marcarQuieta(session);
      threads.finishSteps(session);
      // Igual que en el `done`: el turno se acabó, y con él la espera de sus
      // hijas. Este camino es el del turno que cerró sin que su evento llegara.
      setEnFondo((ids) => ids.filter((id) => id !== session));
      handoff.observe({ kind: "terminal", scope: conversationScope(session) });
      setPermissions((items) => items.filter((permission) => permission.session !== session));
      soltarTerminal(session);
      // `fallo` y no `aviso`: un aviso se pliega dentro del registro del turno,
      // y éste tiene que verse junto a la respuesta que se perderá.
      if (unsaved) threads.appendLive(session, [{ role: "system", text: t("chat.turn.unsaved"), meta: "fallo" }]);
    });
    const tab = pestanas.open().find((item) => item.id === session);
    const projectId = session === sessionId() ? project() : tab?.project ?? taskQueues.saved(session)?.project ?? tareaDelRiel(session)?.folder;
    try {
      // El motor no pudo escribir el turno: el disco no lo tiene, y releerlo
      // borraría del chat la respuesta que la persona acaba de ver llegar.
      if (unsaved) return;
      if (projectId !== undefined) {
        const result = await leerTarea(projectId, session);
        if (generation === workspaceContext.generation() && revision === turnRevisions.get(session))
          loadResult(session, result, true, generation);
      } else soltarHilo(session);
    } catch {
      // El fallo de lectura conserva lo recibido en vivo y no revive el proceso.
    } finally {
      if (generation === workspaceContext.generation() && revision === turnRevisions.get(session)) {
        batch(() => {
          setSettlingTurns((ids) => ids.filter((id) => id !== session));
          void refreshSessions(grupos());
          void releerProyectos();
        });
        mandarElegido(session);
      }
    }
  }

  // Lo que reconstruye el turno en curso de una tarea que pasa a verse: lo filtrado y lo que lo acompaña.
  const applyPushed = createBatchDelivery({ resync: releerUna, replay: threads.replay, deliver });
  return { applyPushed, settleTurn };
}
