import { aplicarLenguaDeWorkspace, t } from "../../../../apps/desktop/src/lib/i18n";
import { type InternalTaskLink } from "../../../../apps/desktop/src/lib/links";
import { listen } from "../../../host/src/serviceEvents.ts";
import { type ContentTab, type FileTab, type Tab } from "../../../../apps/desktop/src/lib/tabs-types.ts";
import { type UsageRecord, ventanaDe } from "../../../../apps/desktop/src/lib/usage";
import { type Ventana } from "../../../../apps/desktop/src/lib/usage.ts";
import { invoke } from "../../../engine-client/src/client.ts";
import { type createChatEvents as T_createChatEvents } from "../../../features/chat/src";
import { type ChatEvent, type PreguntaEvent, type SessionEvent } from "../../../features/chat/src/model/transcript";
import { type Session } from "../../../features/chat/src/model/transcript.ts";
import { avisarDeLosArboles } from "../../../features/code/src/queries/refresh";
import { apagarVistasDe, hayVistasDe } from "../../../features/code/src/queries/typst";
import { asleep } from "../../../features/machines/src/queries/lastAnswer";
import { type createDeskStrip as T_createDeskStrip, type createWorkspaceSession as T_createWorkspaceSession } from "../../../features/projects/src";
import { type SessionRow } from "../../../features/projects/src/screens/Sessions.tsx";
import { type WorkspaceStore } from "../../../features/projects/src/screens/workspace-session.ts";
import { type Startup } from "../../../features/settings/src/queries/workspaces-store";
import { prosaDe } from "../../../ui/src/Failure";
import { onCleanup, onMount, type Accessor, type Setter } from "solid-js";


/** Lo que el bloque usaba del cuerpo de App. */
export type ServiceListenersDeps = { abrirEnlace: (url: string) => Promise<void>; abrirRuta: (path: string, rel?: string) => Promise<void>; abrirSesion: (proyecto: string, id: string, activar?: string, propagateError?: boolean) => Promise<void>; agent: Accessor<string>; alEventoDeChat: ReturnType<typeof T_createChatEvents>["alEventoDeChat"]; aplicar: (a: Startup) => Promise<void>; carpetasDeTarea: (session: string, project?: string | null) => string[]; composer: ReturnType<typeof T_createDeskStrip>["composer"]; esDeLaAbierta: (session: string) => boolean; esDelWorkspaceAbierto: (ws?: string) => boolean; filaDe: (id: string) => SessionRow | undefined; grupos: Accessor<string[]>; input: () => string; leerTarea: (project: string, id: string, before?: number | null | undefined) => Promise<Session>; loadResult: (id: string, session: Session, clear: boolean, generation: number) => void; mandarTexto: (texto: string) => Promise<boolean>; pestanas: { pinned: Accessor<ReadonlySet<string>>; isPinned: (id: string) => boolean; pin: (id: string) => void; restorable: () => string[]; replacePreviews(groups: readonly (readonly string[])[], visible: readonly (string | null)[]): void; open: Accessor<Tab[]>; active: Accessor<string | null>; activeTab: () => Tab | null; load(ws: string | null, desk?: string | null): string | null; ensure(p: { id: string; project: string; titulo: string; }): void; commitDraft(draft: string, p: { id: string; project: string; titulo: string; }): void; openScreen(machine: string, title: string): void; openContent(p: ContentTab): void; activate: (id: string | null) => void; close: (id: string) => Tab | null; closeMany: (ids: readonly string[], opts?: { remember?: boolean; }) => Tab | null; canReopen: () => boolean; reopen(alive: (p: Tab) => boolean): Tab | null; attachPreviewFiles: (project: string, session: string, tree: string) => [string, string][]; renameFiles: (session: string, tree: string, from: string, end: string) => [string, string][]; navigate(id: string, url: string): void; moveToProject(session: string, project: string): void; markChanged: (id: string) => void; dirty: Accessor<ReadonlySet<string>>; setDirty: (id: string, dirty: boolean) => void; registerSaver: (id: string, save: (() => Promise<boolean>) | null) => void; dirtyTabsToClose: (ids: string | readonly string[]) => FileTab[]; saveFiles: (ids: string[]) => Promise<boolean>; sync(find: (id: string) => { project: string; titulo: string; } | null): string[]; }; project: Accessor<string>; projectCatalog: ReturnType<typeof T_createWorkspaceSession>["projectCatalog"]; reconcileSoon: () => void; refreshSessions: (proyectos: string[]) => Promise<void>; refreshSessionsOnEvent: (proyectos: string[]) => Promise<void>; refreshTaskCandidates: () => Promise<void>; releerTrasHueco: () => void; reloadSpaces: () => Promise<void>; serviceListenersReady: Promise<unknown>; sessionId: Accessor<string | null>; setCuentasTocadas: Setter<number>; setError: Setter<string | null>; setProjectReadError: Setter<string | null>; setStartupReadError: Setter<string | null>; setVentana: Setter<Ventana>; threads: ReturnType<typeof T_createDeskStrip>["threads"]; vivas: Accessor<string[]>; workspaceActivo: Accessor<string | null>; workspaceContext: WorkspaceStore };

/** Movido tal cual de packages/shell/src/app/App.tsx (líneas 484–718, tarea 2.5). Lo que usaba del cuerpo de App llega por `deps`. */
export function createServiceListeners(deps: ServiceListenersDeps) {
  const { agent, alEventoDeChat, aplicar, carpetasDeTarea, composer, esDeLaAbierta, esDelWorkspaceAbierto, filaDe, grupos, input, leerTarea, loadResult, pestanas, project, projectCatalog, reconcileSoon, refreshSessions, refreshSessionsOnEvent, refreshTaskCandidates, releerTrasHueco, reloadSpaces, sessionId, setCuentasTocadas, setError, setProjectReadError, setStartupReadError, setVentana, threads, vivas, workspaceActivo, workspaceContext } = deps;
  const abrirEnlace: ServiceListenersDeps["abrirEnlace"] = (...a: Parameters<ServiceListenersDeps["abrirEnlace"]>) => deps.abrirEnlace(...a);
  const abrirRuta: ServiceListenersDeps["abrirRuta"] = (...a: Parameters<ServiceListenersDeps["abrirRuta"]>) => deps.abrirRuta(...a);
  const abrirSesion: ServiceListenersDeps["abrirSesion"] = (...a: Parameters<ServiceListenersDeps["abrirSesion"]>) => deps.abrirSesion(...a);
  const mandarTexto: ServiceListenersDeps["mandarTexto"] = (...a: Parameters<ServiceListenersDeps["mandarTexto"]>) => deps.mandarTexto(...a);
  onMount(() => {
    const chat = listen<ChatEvent>("chat", alEventoDeChat);
    onCleanup(() => void chat.then((f) => f()));

  // El agente preguntó algo. Llega por su propio evento y no por el del chat:
  // es estructura —opciones que se eligen—, no texto que se pinta. El nombre
  // va en inglés y los campos no, sin ser una inconsistencia: el nombre del
  // evento es una ruta entre dos procesos y los campos son el vocabulario ya
  // persistido en `session.json`.
    const question = listen<PreguntaEvent>("question", (e) => {
      const { workspace, session, turno, preguntas, request_id } = e.payload;
      // Con qué agente se contesta: el de ESA tarea, que puede no ser la
      // abierta. El historial lo sabe por fila; el selector solo sabe el de la
      // que se mira.
      const conAgente = filaDe(session)?.provider ?? (session === sessionId() ? agent() : undefined);
      threads.question(session, { turno, preguntas, questionRequestId: request_id, agent: conAgente }, workspace ?? workspaceActivo());
    });
    onCleanup(() => void question.then((f) => f()));

    // El consumo llega como dato y se conserva por turno. No entra a `msgs`:
    // una línea de tokens es diagnóstico, no una intervención en la conversación.
    const usageEv = listen<UsageRecord>("usage", (e) => {
      const rec = e.payload;
      // `UsageRecord` trae su workspace desde que existe: cada línea del
      // registro tiene que saber de dónde salió aunque se lea suelta.
      if (!esDeLaAbierta(rec.session) || !esDelWorkspaceAbierto(rec.workspace))
        return;
      setVentana(ventanaDe([rec]));
      composer.refreshCommands(agent());
    });
    onCleanup(() => void usageEv.then((f) => f()));

    // Instalar un agente lo deja usable aquí, no solo en la pantalla
    // donde se instaló. Esta lista se leía una vez en `onMount`: quien
    // conectaba una cuenta desde Ajustes veía ahí su consumo, y en el
    // chat el mismo agente seguía diciendo «no está instalado», con el
    // campo muerto hasta cerrar y volver a abrir la app.
    const agentsEv = listen("providers", () => {
      void composer.refreshProviders();
      // Y qué se puede usar, que es lo que decide el menú. Conectar una cuenta
      // desde Configuración añade una entrada aquí; desinstalar un CLI se la
      // lleva. Sin esto había que cerrar la app para verlo.
      void composer.refreshSurfaces(false);
    });
    onCleanup(() => void agentsEv.then((f) => f()));

    // Un plugin instalado o activado trae skills: sin esto `/typst` no se
    // reconoce hasta el siguiente turno.
    const pluginsEv = listen("integrations-changed", () => composer.refreshCommands(agent()));
    onCleanup(() => void pluginsEv.then((f) => f()));

    // Cambió qué cuenta va a correr: cambió qué se puede usar.
    // `surfaces::sin_cuenta` pregunta por la cuenta activa, y la sonda de
    // estado la quita en cuanto una deja de responder
    // (`accounts::account_status`). Sin escuchar esto, el selector sigue
    // ofreciendo un agente que ya no puede correr, y el turno muere
    // contra el guarda con un muro de texto.
    const cuentaEv = listen("account", () => {
      void composer.refreshSurfaces(false);
      // El reloj de cupo cambia la activa sin pasar por Configuración: sin esto la franja enseña la agotada.
      setCuentasTocadas((n) => n + 1);
    });
    onCleanup(() => void cuentaEv.then((f) => f()));

    // La otra ventana escribió en esta carpeta de datos: hay que releer,
    // igual que el `done` de un turno propio, con dos diferencias. Rust
    // ya descartó el eco (`sync::arrancar` compara la firma); y un turno
    // vivo AQUÍ manda —si esta ventana contesta esa misma tarea, releer
    // con `vaciarVivo` borraría `vivo` a media respuesta.

    // Lo que la ventana no puede pintar. Ver `abrirEnlace`.
    const sitioPedido = listen<string>("sitio-pedido", (e) => {
      void abrirEnlace(e.payload);
    });
    onCleanup(() => void sitioPedido.then((f) => f()));
    const enlaceDelChat = (e: Event) => {
      void abrirEnlace((e as CustomEvent<string>).detail);
    };
    window.addEventListener("harness:abrir-sitio", enlaceDelChat);
    onCleanup(() => window.removeEventListener("harness:abrir-sitio", enlaceDelChat));
    const localFileLink = (e: Event) => {
      const path = (e as CustomEvent<string>).detail;
      if (typeof path === "string") void abrirRuta(path);
    };
    window.addEventListener("harness:open-file", localFileLink);
    onCleanup(() => window.removeEventListener("harness:open-file", localFileLink));
    // «Que lo arregle el agente» en un documento Typst: sale como si la persona lo escribiera, en su tarea.
    const pedirAlAgente = (e: Event) => {
      const pedido = (e as CustomEvent<{ project: string; session: string; texto: string } | null>).detail;
      if (!pedido?.texto || !pedido.session) return;
      void (async () => {
        if (sessionId() !== pedido.session) await abrirSesion(pedido.project, pedido.session);
        if (sessionId() === pedido.session) await mandarTexto(pedido.texto);
      })();
    };
    window.addEventListener("harness:pedir-al-agente", pedirAlAgente);
    onCleanup(() => window.removeEventListener("harness:pedir-al-agente", pedirAlAgente));
    const taskLink = (e: Event) => {
      const target = (e as CustomEvent<InternalTaskLink>).detail;
      if (!target || target.workspace !== workspaceActivo()) {
        setError(t("markdown.link.other_workspace"));
        return;
      }
      void leerTarea(target.folder, target.task)
        .then(() => {
          if (target.workspace === workspaceActivo()) void abrirSesion(target.folder, target.task);
        })
        .catch((error) => setError(prosaDe(error)));
    };
    window.addEventListener("harness:open-task-link", taskLink);
    onCleanup(() => window.removeEventListener("harness:open-task-link", taskLink));
    // Con proyecto lo avisa un gesto de `Sessions.tsx`; sin él, `cli-changed`.
    const tasksChanged = (event: Event) => {
      const project = (event as CustomEvent<{ project?: string } | null>).detail?.project;
      void (project !== undefined ? refreshSessions([project]) : refreshSessionsOnEvent(grupos()));
    };
    window.addEventListener("harness:tasks-changed", tasksChanged);
    onCleanup(() => window.removeEventListener("harness:tasks-changed", tasksChanged));
    // Otra máquina de la cuenta trajo una rebanada distinta (`features/machines/router.ts`): se relee solo eso.
    const machineSlices = (event: Event) => {
      const changes = (event as CustomEvent<{ changes?: string[] } | null>).detail?.changes ?? [];
      if (changes.includes("sessions")) {
        void refreshSessionsOnEvent(grupos());
        reconcileSoon();
      }
      if (changes.includes("spaces")) void reloadSpaces();
      if (changes.includes("mentions") && input().includes("@")) void refreshTaskCandidates();
      if (changes.includes("projects")) {
        const workspace = workspaceActivo();
        void projectCatalog.changed().then(() => {
          if (workspace === workspaceActivo()) setProjectReadError(null);
        }).catch(() => {});
      }
    };
    window.addEventListener("harness:machine-slices", machineSlices);
    onCleanup(() => window.removeEventListener("harness:machine-slices", machineSlices));
    // La otra mitad de la elección del enlace (`ui/Markdown.tsx`): sale al
    // navegador de la persona por una puerta más estrecha que la de dentro.
    // Ver `sites::abrible_fuera`.
    const enlaceFuera = (e: Event) => {
      void invoke("site_open_external", {
        url: (e as CustomEvent<string>).detail,
      }).catch(() => {});
    };
    window.addEventListener("harness:abrir-fuera", enlaceFuera);
    onCleanup(() => window.removeEventListener("harness:abrir-fuera", enlaceFuera));

    const cliChanged = listen<{ workspace: string | null; command: string }>("cli-changed", (e) => {
      window.dispatchEvent(new CustomEvent("harness:workspace-name"));
      if (!esDelWorkspaceAbierto(e.payload.workspace ?? undefined)) return;
      const workspace = workspaceActivo();
      void projectCatalog.changed().then(() => {
        if (workspace === workspaceActivo()) setProjectReadError(null);
      }).catch((error) => { if (workspace === workspaceActivo() && !asleep(error)) setProjectReadError(prosaDe(error)); });
      void reloadSpaces();
      void composer.refreshSurfaces(false);
      setCuentasTocadas((n) => n + 1);
      window.dispatchEvent(new CustomEvent("harness:tasks-changed"));
      // El mismo aviso que dan `NewAgent.tsx` y `AgentProfile.tsx`: sin él, lo
      // creado o cambiado desde el CLI no sale en el riel hasta cambiar de carpeta.
      if (e.payload.command === "handler.create" || e.payload.command === "handler.update") {
        window.dispatchEvent(new CustomEvent("harness:encargados"));
        window.dispatchEvent(new CustomEvent("harness:profiles"));
      }
      if (e.payload.command === "config.set") {
        const modeGeneration = workspaceContext.generation();
        void invoke<Startup>("list_workspaces").then((startup) => {
          if (workspace !== workspaceActivo()) return;
          const current = startup.workspaces.find((w) => w.id === workspace);
          aplicarLenguaDeWorkspace(current?.lengua ?? null);
          workspaceContext.modeChanged(workspace, current?.default_permission_mode ?? null, modeGeneration);
          setStartupReadError(null);
        }).catch((error) => { if (workspace === workspaceActivo() && !asleep(error)) setStartupReadError(prosaDe(error)); });
      }
    });
    onCleanup(() => void cliChanged.then((stop) => stop()));
    const cliOpen = listen<{ workspace: string; folder: string; task: string; operation: string; by_agent?: boolean }>("cli-open-task", (e) => {
      void (async () => {
        if (e.payload.workspace !== workspaceActivo()) {
          // Un agente que abre una tarea de otro workspace no se lleva a la
          // persona del que está mirando: lo pidió ella para lo suyo.
          if (e.payload.by_agent) {
            await invoke("cli_task_opened", { operation: e.payload.operation, error: "workspace_not_shown" });
            return;
          }
          await invoke("set_active_workspace", { id: e.payload.workspace });
          await aplicar(await invoke<Startup>("list_workspaces"));
        }
        await abrirSesion(e.payload.folder, e.payload.task, e.payload.task, true);
        const opened = sessionId() === e.payload.task && project() === e.payload.folder;
        await invoke("cli_task_opened", { operation: e.payload.operation, error: opened ? null : "open_superseded" });
      })().catch((error) => {
        setError(prosaDe(error));
        void invoke("cli_task_opened", { operation: e.payload.operation, error: prosaDe(error) }).catch(() => {});
      });
    });
    onCleanup(() => void cliOpen.then((stop) => stop()));

    const sourcesEv = listen<{ workspace?: string | null; source?: string; commit?: string }>("sources-updated", (e) => {
      if (!esDelWorkspaceAbierto(e.payload?.workspace ?? undefined)) return;
      window.dispatchEvent(new CustomEvent("harness:sources"));
    });
    onCleanup(() => void sourcesEv.then((stop) => stop()));

    const sesionEv = listen<SessionEvent>("session", (e) => {
      const generation = workspaceContext.generation();
      const { session, project, workspace } = e.payload;
      if (!esDelWorkspaceAbierto(workspace)) return;
      // El historial primero, y para todos: una tarea que la otra ventana
      // acaba de crear no está en ningún hilo de esta. Releer solo la abierta
      // la dejaría invisible hasta cambiar de proyecto. Su carpeta basta: el
      // aviso la trae, y releerlas todas esperaba a la más lenta.
      void refreshSessionsOnEvent(carpetasDeTarea(session, project));
      reconcileSoon();
      // La otra instancia escribió esa tarea: su árbol también pudo moverse.
      // Mismo motivo que en el cierre de turno.
      avisarDeLosArboles(session);
      // Borrada desde el CLI con su vista de Typst abierta: su Tinymist no tiene ya árbol que servir.
      if (hayVistasDe(session))
        void leerTarea(project, session).catch(() => void apagarVistasDe(session));
      if (vivas().includes(session)) return;
      if (esDeLaAbierta(session)) {
        void leerTarea(project, session)
          .then((s) => loadResult(session, s, true, generation))
          .catch(() => {});
        return;
      }
      const pestana = pestanas.open().find((p) => p.id === session);
      if (pestana)
        void leerTarea(pestana.project, session)
          .then((s) => loadResult(session, s, true, generation))
          .catch(() => {});
    });
    onCleanup(() => void sesionEv.then((f) => f()));
    // Los eventos de otra máquina llegan por el relay, no por `service_poll`:
    // un hueco ahí se llevó sus `session` y el sondeo de esta ventana no lo ve.
    const trasHueco = () => releerTrasHueco();
    window.addEventListener("harness:service-gap", trasHueco);
    onCleanup(() => window.removeEventListener("harness:service-gap", trasHueco));
    deps.serviceListenersReady = Promise.all([chat, question, usageEv, agentsEv, cuentaEv, cliChanged, cliOpen, sourcesEv, sesionEv]);
  });
}
