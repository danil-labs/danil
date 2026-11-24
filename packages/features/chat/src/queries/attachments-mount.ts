
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { type Frase } from "../../../../../apps/desktop/src/lib/prose.ts";
import { type SenderTask } from "../../../../../apps/desktop/src/lib/recipients.ts";
import { deliver, listen } from "../../../../host/src/serviceEvents.ts";
import { invoke } from "../../../../engine-client/src/client.ts";
import { claveDe, prosaDe } from "../../../../ui/src/Failure";
import { type Session } from "../model/transcript.ts";
import { TRANSPORTE } from "./sleepSession.ts";
import { batch, createEffect, on, onCleanup, onMount, type Accessor, type Setter } from "solid-js";
import type { ComposerPort, ContextSourcePort, CreateBatchDelivery, Hilo, ListaBastaPort, ProjectsPort, ReconciliarPort, SessionRow, Startup, WorkspaceContextPort, createThreadsStore } from "./types.ts";
import type { createTabs } from "../../../../ui/src/lib/tabs.ts";
import type { createAttachments } from "./attachments.ts";
import type { createResyncCommands } from "./resync-commands.ts";
import type { createResync } from "./resync.ts";
import type { createShellCommand } from "./shell-command.ts";
import type { createThreadSide } from "./thread-side.ts";
import type { createThreadStream } from "./thread-stream.ts";


/** Lo que el bloque usaba del cuerpo de App. */
export type AttachmentsMountDeps = { advanceTurn: ReturnType<typeof createThreadStream>["advanceTurn"]; agent: Accessor<string>; aplicar: ReturnType<typeof createAttachments>["aplicar"];
  asleep: (error: unknown) => boolean; bloqueo: Accessor<Frase | null>; closeActiveTab: () => void; composer: ComposerPort;
  conversationScope: ReturnType<typeof createThreadStream>["conversationScope"]; createBatchDelivery: CreateBatchDelivery; enCache: Accessor<boolean>;
  finishedTurns: ReturnType<typeof createThreadStream>["finishedTurns"]; grupos: Accessor<string[]>; handoff: ReturnType<typeof createThreadStream>["handoff"]; hilos: Accessor<Record<string, Hilo>>;
  leerTarea: (project: string, id: string, before?: number | null | undefined) => Promise<Session>; listaBasta: ListaBastaPort;
  loadResult: (id: string, session: Session, clear: boolean, generation: number) => void; mandarElegido: ReturnType<typeof createShellCommand>["mandarElegido"];
  marcarQuieta: ReturnType<typeof createThreadStream>["marcarQuieta"]; pestanas: ReturnType<typeof createTabs>; project: Accessor<string>; projectCatalog: ProjectsPort;
  recargarMaterial: ReturnType<typeof createAttachments>["recargarMaterial"]; reconciliar: ReconciliarPort; refreshSessions: (proyectos: string[]) => Promise<void>;
  releerProyectos: ContextSourcePort["releerProyectos"]; releerUna: ReturnType<typeof createResync>["releerUna"]; sessionId: Accessor<string | null>;
  setBloqueo: Setter<Frase | null>; setEnCache: Setter<boolean>; setEnFondo: ReturnType<typeof createThreadStream>["setEnFondo"];
  setPermissions: ReturnType<typeof createThreadStream>["setPermissions"]; setSesiones: Setter<Record<string, SessionRow[]>>; setSettings: ReturnType<typeof createThreadSide>["setSettings"];
  setSettlingTurns: ReturnType<typeof createThreadStream>["setSettlingTurns"]; setStartupReadError: Setter<string | null>; soltarHilo: (session: string) => void;
  soltarTerminal: ReturnType<typeof createResyncCommands>["soltarTerminal"]; tareaDelRiel: (id: string) => SenderTask | null; taskQueues: ReturnType<typeof createThreadStream>["taskQueues"];
  threads: ReturnType<typeof createThreadsStore>; turnRevisions: ReturnType<typeof createThreadStream>["turnRevisions"]; vivas: ReturnType<typeof createThreadStream>["vivas"];
  workspaceContext: WorkspaceContextPort; };

/** Movido tal cual de packages/shell/src/app/App.tsx (líneas 2006–2194, tarea 2.5). Lo que usaba del cuerpo de App llega por `deps`. */
export function createAttachmentsMount(deps: AttachmentsMountDeps) {
  const { advanceTurn, agent, aplicar, asleep, bloqueo, closeActiveTab, composer, conversationScope, createBatchDelivery, enCache, finishedTurns, grupos, handoff, hilos, leerTarea, listaBasta, loadResult, marcarQuieta, pestanas, project, projectCatalog, recargarMaterial, reconciliar, refreshSessions, sessionId, setBloqueo, setEnCache, setEnFondo, setPermissions, setSesiones, setSettings, setSettlingTurns, setStartupReadError, soltarHilo, tareaDelRiel, taskQueues, threads, turnRevisions, vivas, workspaceContext } = deps;
  const releerProyectos = ((...a: Parameters<typeof deps.releerProyectos>) => deps.releerProyectos(...a)) as typeof deps.releerProyectos;
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
