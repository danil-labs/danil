import { For, Show, createEffect, createSignal, on, onCleanup } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { alMoverseElArbol, avisarDeLosArboles } from "./refresh";
import { precargarEditor } from "./editorLoad";
import { Skeleton } from "../../ui/Skeleton";
import { Channel } from "@tauri-apps/api/core";
import { invoke } from "../../lib/invoke.ts";
import { machineOf } from "../machines/store";
import { FailureNote, asFailure, type Failure } from "../../ui/Failure";
import type { ArbolEnTarea } from "../../lib/model";
import { t } from "../../lib/i18n";
import ArbolDeArchivos from "./FileTreeLazy";
import KnIntegrate from "./KnIntegrate";
import KnCloud from "./KnCloud";
import { siguienteLista } from "./trees";
import { recordarArboles } from "./treeKind";

/**
 * El árbol de trabajo: la carpeta del proyecto donde corre el agente, una
 * sola (`development::list_task_trees`). `kind` decide la forma: un
 * repositorio trae rama; una carpeta trae solo sus
 * archivos. Este panel elige; el archivo se lee en una pestaña del
 * centro (`lib/tabs.ts`, `FileViewer.tsx`).
 */

export default function Codigo(props: {
  project: string;
  session: string;
  /**
   * Si la columna que lo contiene está abierta. Cerrada, los árboles apuntan lo
   * que llegue y se ponen al día al volver, en vez de recomparar sin que nadie
   * mire (`refresh.ts`).
   */
  visible: boolean;
  /** Abrir un archivo es abrir una pestaña del centro; lo hace `App.tsx`. */
  onAbrir: (arbol: string, ruta: string, cambiado: boolean) => void;
  onAbrirFijo?: (arbol: string, ruta: string, cambiado: boolean) => void;
  onMovido: (session: string, arbol: string, desde: string, hasta: string) => void;
  onBorrado: (session: string, arbol: string, ruta: string) => void;
}) {
  precargarEditor();
  const [trees, setTrees] = createStore<{ items: ArbolEnTarea[] }>({ items: [] });
  const arboles = () => trees.items;
  const setArboles = (items: ArbolEnTarea[]) => setTrees("items", reconcile(items, { key: "key" }));
  const [fallo, setFallo] = createSignal<Failure | null>(null);
  const [watchFailure, setWatchFailure] = createSignal<Failure | null>(null);

  /**
   * Arranca en `true`: el primer render es siempre antes de la primera lectura,
   * y sin el tercer estado el panel afirma «sin carpeta» mientras consulta.
   */
  const [cargando, setCargando] = createSignal(true);

  let generation = 0;
  onCleanup(() => { generation++; });

  async function cargar() {
    const sid = props.session;
    const current = ++generation;
    const mia = () => props.session === sid && generation === current;
    if (!arboles().length) setCargando(true);
    try {
      const as = await invoke<ArbolEnTarea[]>("list_task_trees", {
        project: props.project,
        session: sid,
      }, machineOf(sid));
      recordarArboles(sid, as);
      if (!mia()) return;
      setArboles(siguienteLista(arboles(), { ok: true, lista: as }));
      setFallo(null);
    } catch (e) {
      if (!mia()) return;
      setArboles(siguienteLista(arboles(), { ok: false }));
      setFallo(asFailure(e));
    } finally {
      if (mia()) setCargando(false);
    }
  }

  // Al cambiar de tarea no sobrevive nada de la anterior: se vacía antes de
  // leer. El efecto corre también la primera vez y sustituye a la carga del
  // montaje.
  createEffect(
    on(
      () => props.session,
      () => {
        setArboles([]);
        setFallo(null);
        void cargar();
      },
    ),
  );

  createEffect(on(() => arboles().filter((tree) => !tree.missing).map((tree) => tree.path).join("\n"), (path) => {
    setWatchFailure(null);
    // El canal no cruza el relay (`router.ts` · `CHANNELS`): el árbol de otra máquina se relee al cerrar cada turno.
    if (!path || machineOf(props.session)) return;
    let disposed = false;
    let scheduled: ReturnType<typeof setTimeout> | undefined;
    const changes = new Channel<void>();
    changes.onmessage = () => {
      if (disposed || scheduled !== undefined) return;
      scheduled = setTimeout(() => {
        scheduled = undefined;
        if (!disposed) avisarDeLosArboles(props.session);
      }, 700);
    };
    const watcher = invoke<string>("watch_task_tree", { project: props.project, session: props.session, changes });
    void watcher.catch((error) => { if (!disposed) setWatchFailure(asFailure(error)); });
    onCleanup(() => {
      disposed = true;
      clearTimeout(scheduled);
      void watcher.then((id) => invoke("unwatch_task_tree", { id })).catch(() => {});
    });
  }));

  alMoverseElArbol(
    () => props.session,
    () => props.visible,
    () => void cargar(),
    true,
  );

  return (
    <div class="flex h-full min-h-0 flex-col overflow-hidden">
      <div class="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <Show when={!cargando()} fallback={<Skeleton filas={2} class="m-3 h-9" />}>
          <Show
            when={arboles().length > 0}
            fallback={<p class="m-0 px-3 py-3 text-xs text-neutral-500">{t("code.empty")}</p>}
          >
        <For each={arboles()}>
          {(a) => (
            <section class="flex flex-col last-of-type:flex-1">
              <Show
                when={!a.missing}
                fallback={
                  <p class="m-0 break-words px-3 py-2 text-xs text-neutral-500">
                    {t("code.tree.missing", { path: a.path })}
                  </p>
                }
              >
                <Show when={a.kind === "kn"}>
                  <KnCloud project={props.project} session={props.session} />
                </Show>
                <ArbolDeArchivos
                  project={props.project}
                  session={props.session}
                  arbol={a.key}
                  kind={a.kind}
                  visible={props.visible}
                  acciones={a.kind === "kn" && a.changed !== 0
                    ? <KnIntegrate project={props.project} session={props.session} changed={a.changed} corto />
                    : undefined}
                  onAbrir={(ruta, cambiado) => props.onAbrir(a.key, ruta, cambiado)}
                  onAbrirFijo={(ruta, cambiado) => props.onAbrirFijo?.(a.key, ruta, cambiado)}
                  onMovido={(desde, hasta) => props.onMovido(props.session, a.key, desde, hasta)}
                  onBorrado={(ruta) => props.onBorrado(props.session, a.key, ruta)}
                />
              </Show>
            </section>
          )}
        </For>
          </Show>
        </Show>

        <Show when={watchFailure()}>
          {(failure) => <div class="px-3 pb-3"><FailureNote f={failure()} /></div>}
        </Show>

        <Show when={fallo()}>
          {(f) => (
            <div class="px-3 pb-3">
              <FailureNote f={f()} />
            </div>
          )}
        </Show>
      </div>

    </div>
  );
}
