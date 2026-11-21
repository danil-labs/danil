import { listen } from "../../../../apps/desktop/src/lib/serviceEvents";
import Check from "lucide-solid/icons/check";
import ChevronDown from "lucide-solid/icons/chevron-down";
import ChevronUp from "lucide-solid/icons/chevron-up";
import CircleAlert from "lucide-solid/icons/circle-alert";
import FileDown from "lucide-solid/icons/file-down";
import Maximize2 from "lucide-solid/icons/maximize-2";
import Minimize2 from "lucide-solid/icons/minimize-2";
import RotateCcw from "lucide-solid/icons/rotate-ccw";
import TriangleAlert from "lucide-solid/icons/triangle-alert";
import ZoomIn from "lucide-solid/icons/zoom-in";
import ZoomOut from "lucide-solid/icons/zoom-out";
import { For, Show, createEffect, createSignal, on, onCleanup, onMount } from "solid-js";
import { t } from "../../../../apps/desktop/src/lib/i18n";
import { invoke } from "../../../engine-client/src/client.ts";
import { machineOf } from "../../machines/src/store";
import { seguirHueco, type Hueco } from "../../../../apps/desktop/src/lib/sites";
import { Button } from "../../../ui/src/Button";
import { FailureNote, asFailure, type Failure } from "../../../ui/src/Failure";
import { IconButton } from "../../viewers/src/IconButton";
import { clampZoom, ZOOM_STEP } from "../../viewers/src/zoom";
import {
  type DiagnosticoTypst,
  type ExportacionTypst,
  abrirVista,
  reaperturaDe,
  ampliadaDe,
  ampliarVista,
  asegurarCapa,
  capaLista,
  cerrarCapaDe,
  compiladoDe,
  desocuparCapa,
  fijarZoom,
  lugarDe,
  moverOcupante,
  ocuparCapa,
  pedirArreglo,
  principalElegido,
  revelarEnElArbol,
  saltoDeLaVista,
  soltarVista,
  tomarVista,
  vivaDe,
  zoomDe,
} from "./typst";
import { Spinner } from "../../../ui/src/Spinner";

/**
 * La vista en vivo de un documento Typst de la tarea: la página de Tinymist en
 * una capa nativa de origen fijo (`sites::site_open_local`), con nuestra barra
 * encima y sus errores debajo. Exportar escribe `dist/<principal>.pdf`.
 */
export default function VistaPreviaTypst(props: {
  project: string;
  session: string;
  arbol: string;
  ruta: string;
  visible: boolean;
  onIrA: (d: DiagnosticoTypst) => void;
}) {
  const [fallo, setFallo] = createSignal<Failure | null>(null);
  const [desplegada, setDesplegada] = createSignal(false);
  const [enviado, setEnviado] = createSignal(false);
  const [exportando, setExportando] = createSignal(false);
  const [exportado, setExportado] = createSignal<ExportacionTypst | null>(null);
  const [intento, setIntento] = createSignal(0);

  const viva = () => vivaDe(props.session, props.arbol);
  const zoom = () => zoomDe(props.session, props.arbol);
  const ampliada = () => ampliadaDe(props.session, props.arbol);

  // Esc vuelve a lado a lado solo con el foco en este visor: en el chat u otro panel es de ellos.
  let raiz: HTMLDivElement | undefined;
  const alTeclear = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || !props.visible || !ampliada() || e.defaultPrevented) return;
    if (!(e.target instanceof Node) || !raiz?.contains(e.target)) return;
    ampliarVista(props.session, props.arbol, false);
  };
  window.addEventListener("keydown", alTeclear);
  onCleanup(() => window.removeEventListener("keydown", alTeclear));
  const compilado = () => compiladoDe(props.session, props.arbol);
  const compilando = () => compilado()?.status === "compiling";
  const errores = () => compilado()?.diagnostics.filter((d) => d.severity === "error") ?? [];
  const avisos = () => compilado()?.diagnostics.filter((d) => d.severity === "warning") ?? [];

  // Al desmontar, las props pueden venir de un `<Show>` que ya no se cumple: leerlas lanza «Stale read».
  const tomada = { session: props.session, arbol: props.arbol };
  tomarVista(tomada.session, tomada.arbol);
  onCleanup(() => soltarVista(tomada.session, tomada.arbol));

  let pedido = 0;
  // Un fallo de transporte (motor ocupado) no deja la vista muerta: se reintenta unas veces.
  let reintentos = 0;
  let reintento: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(reintento));
  async function abrir() {
    const n = ++pedido;
    clearTimeout(reintento);
    setFallo(null);
    try {
      await abrirVista(props.project, props.session, props.arbol, props.ruta);
      reintentos = 0;
    } catch (e) {
      if (n !== pedido) return;
      setFallo(asFailure(e));
      if (reintentos < 5) {
        reintentos++;
        reintento = setTimeout(() => setIntento((i) => i + 1), 3000);
      }
    }
  }
  createEffect(
    on(
      [() => props.ruta, () => principalElegido(props.project), intento, () => reaperturaDe(props.session, props.arbol)],
      () => void abrir(),
    ),
  );

  // Activar o actualizar Typst en Ajustes con este archivo abierto lo pinta sin reabrirlo.
  const integraciones = listen("integrations-changed", () => void abrir());
  onCleanup(() => void integraciones.then((dejar) => dejar()));

  // La capa es del árbol y la comparten sus visores: abrir otro .typ no la vuelve a dibujar.
  const ocupante = ocuparCapa(tomada.session, tomada.arbol);
  let hueco: HTMLDivElement | undefined;
  let ultimo: Hueco = { x: 0, y: 0, width: 0, height: 0 };
  const avisarHueco = () => moverOcupante(props.session, props.arbol, ocupante, { visible: props.visible, hueco: ultimo });
  // Un visor escondido midió 0×0: al volver a verse o al ampliar se mide ya, sin esperar al observador.
  const medirYAvisar = () => {
    if (hueco) {
      const r = hueco.getBoundingClientRect();
      ultimo = { x: r.x, y: r.y, width: r.width, height: r.height };
    }
    avisarHueco();
  };

  createEffect(
    on(
      () => (viva()?.estado === "lista" ? viva()?.puerto : 0),
      async (puerto) => {
        if (!puerto) return;
        if (hueco) {
          const r = hueco.getBoundingClientRect();
          ultimo = { x: r.x, y: r.y, width: r.width, height: r.height };
        }
        try {
          await asegurarCapa(props.session, props.arbol, puerto, ultimo);
        } catch (e) {
          setFallo(asFailure(e));
        }
      },
    ),
  );
  createEffect(
    on(
      () => viva()?.estado,
      (estado) => {
        if (estado && estado !== "lista") cerrarCapaDe(props.session, props.arbol);
      },
    ),
  );

  onMount(() => {
    if (hueco) {
      seguirHueco(hueco, (h) => {
        ultimo = h;
        avisarHueco();
      });
    }
  });
  createEffect(on([() => props.visible, ampliada], medirYAvisar));
  onCleanup(() => desocuparCapa(tomada.session, tomada.arbol, ocupante));

  function arreglar() {
    const c = compilado();
    if (!c || errores().length === 0) return;
    pedirArreglo(props.project, props.session, c.main, errores());
    setEnviado(true);
  }
  createEffect(on(() => errores().length, () => setEnviado(false), { defer: true }));

  createEffect(
    on(saltoDeLaVista, (s) => {
      if (!s || !props.visible || s.key !== viva()?.key) return;
      ampliarVista(props.session, props.arbol, false);
      revelarEnElArbol(props.session, props.arbol, s.path);
      props.onIrA({ severity: "warning", path: s.path, line: s.line, column: s.column, message: "" });
    }),
  );

  async function exportar() {
    setExportando(true);
    setExportado(null);
    setFallo(null);
    try {
      setExportado(
        await invoke<ExportacionTypst>("tree_typst_export", {
          project: props.project,
          session: props.session,
          tree: props.arbol,
          path: props.ruta,
          main: principalElegido(props.project),
        }, machineOf(props.session)),
      );
    } catch (e) {
      setFallo(asFailure(e));
    } finally {
      setExportando(false);
    }
  }

  /** Un PDF exportado puede pesar más de lo que cruza el canal del servicio: se abre en el visor del sistema. */
  function abrirFuera(pdf: string) {
    setFallo(null);
    void invoke("tree_open_external", {
      project: props.project,
      session: props.session,
      tree: props.arbol,
      path: pdf,
    }).catch((e) => setFallo(asFailure(e)));
  }

  const abrirAjustes = () =>
    window.dispatchEvent(new CustomEvent("harness:open-settings", { detail: "plugins" }));

  return (
    <div ref={raiz} class="flex min-h-0 flex-1 flex-col">
      <Show when={viva()?.estado === "sin_typst"}>
        <div class="flex flex-col items-center gap-3 p-6 text-center">
          <p class="m-0 text-xs text-neutral-500">{t("code.typst.missing")}</p>
          <Button variant="primary" size="compact" onClick={abrirAjustes}>
            {t("code.typst.install")}
          </Button>
        </div>
      </Show>

      <Show when={viva()?.estado === "sin_tinymist"}>
        <div class="flex flex-col items-center gap-3 p-6 text-center">
          <p class="m-0 text-xs text-neutral-500">{t("code.typst.update")}</p>
          <Button variant="primary" size="compact" onClick={abrirAjustes}>
            {t("code.typst.update.button")}
          </Button>
        </div>
      </Show>

      <Show when={viva()?.estado !== "sin_typst" && viva()?.estado !== "sin_tinymist"}>
        <div class="flex shrink-0 items-center gap-1 border-b border-border px-2 py-1">
          <IconButton label={t("code.file.image.zoom_out")} onClick={() => fijarZoom(props.session, props.arbol, clampZoom(zoom() / ZOOM_STEP))}>
            <ZoomOut size={13} />
          </IconButton>
          <span class="min-w-11 text-center font-mono text-caption tabular-nums text-neutral-500">
            {Math.round(zoom() * 100)}%
          </span>
          <IconButton label={t("code.file.image.zoom_in")} onClick={() => fijarZoom(props.session, props.arbol, clampZoom(zoom() * ZOOM_STEP))}>
            <ZoomIn size={13} />
          </IconButton>
          <IconButton label={t("code.file.image.fit")} onClick={() => fijarZoom(props.session, props.arbol, 1)}>
            <RotateCcw size={13} />
          </IconButton>
          <IconButton
            label={ampliada() ? t("code.typst.collapse") : t("code.typst.expand")}
            onClick={() => ampliarVista(props.session, props.arbol, !ampliada())}
          >
            {ampliada() ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </IconButton>
          <Show
            when={!compilando() && compilado()?.status}
            fallback={
              <Show when={compilando()}>
                <span role="status" title={t("code.typst.compiling")} aria-label={t("code.typst.compiling")} class="grid size-6 place-items-center">
                  <Spinner size={13} class="text-primary" />
                </span>
              </Show>
            }
          >
            <Show
              when={compilado()?.status === "compileSuccess" && errores().length === 0}
              fallback={
                <span role="status" title={t("code.typst.stale")} aria-label={t("code.typst.stale")} class="grid size-6 place-items-center">
                  <CircleAlert size={13} class="text-error-strong" aria-hidden="true" />
                </span>
              }
            >
              <span role="status" title={t("code.typst.compiled")} aria-label={t("code.typst.compiled")} class="grid size-6 place-items-center">
                <Check size={13} class="text-success" aria-hidden="true" />
              </span>
            </Show>
          </Show>
          <span class="ml-auto flex min-w-0 items-center gap-1.5 overflow-hidden font-mono text-caption text-neutral-500">
            <Show when={compilado()?.pages}>
              {(n) => <span class="shrink-0">{t("code.file.pdf.pages", { count: n(), n: n() })}</span>}
            </Show>
            <Show when={compilado()?.main}>
              {(main) => (
                <span class="min-w-0 truncate" title={main()}>
                  <span aria-hidden="true" class="pr-1.5">·</span>
                  {main()}
                </span>
              )}
            </Show>
          </span>
          <Button
            variant="ghost"
            size="compact"
            class="shrink-0 gap-1.5"
            disabled={exportando() || viva()?.estado !== "lista"}
            title={t("code.typst.export.title")}
            onClick={() => void exportar()}
          >
            <FileDown size={13} aria-hidden="true" />
            {exportando() ? t("code.typst.exporting") : t("code.typst.export")}
          </Button>
        </div>

        <Show when={exportado()}>
          {(x) => (
            <div aria-live="polite" class="shrink-0 border-b border-border bg-surface-raised text-caption">
              <div class="flex items-center gap-2 px-3 py-1">
                <Show
                  when={x().pdf}
                  fallback={
                    <span class="text-error-strong">
                      {t("code.typst.export.failed", {
                        count: x().diagnostics.filter((d) => d.severity === "error").length,
                      })}
                    </span>
                  }
                >
                  {(pdf) => (
                    <>
                      <span class="text-neutral-500">{t("code.typst.exported")}</span>
                      <button
                        type="button"
                        class="font-mono text-primary underline-offset-2 outline-none hover:underline focus-visible:outline-2 focus-visible:outline-primary"
                        title={t("code.typst.exported.open")}
                        onClick={() => void abrirFuera(pdf())}
                      >
                        {pdf()}
                      </button>
                    </>
                  )}
                </Show>
                <button
                  type="button"
                  class="ml-auto text-neutral-500 outline-none hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-primary"
                  aria-label={t("code.typst.export.dismiss")}
                  title={t("code.typst.export.dismiss")}
                  onClick={() => setExportado(null)}
                >
                  ×
                </button>
              </div>
              {/* La exportación compila aparte de la vista: sus errores pueden no estar en la lista de abajo. */}
              <Show when={!x().pdf && x().diagnostics.length > 0}>
                <ul class="m-0 max-h-48 list-none overflow-y-auto border-t border-border p-0">
                  <For each={x().diagnostics}>{(d) => <FilaDiagnostico d={d} onIrA={props.onIrA} />}</For>
                </ul>
              </Show>
            </div>
          )}
        </Show>

        <Show when={fallo()}>
          {(f) => (
            <div class="flex shrink-0 items-start gap-2 border-b border-border p-3">
              <div class="min-w-0 flex-1">
                <FailureNote f={f()} />
              </div>
              <Button variant="secondary" size="compact" class="shrink-0" onClick={() => setIntento((n) => n + 1)}>
                {t("code.typst.retry")}
              </Button>
            </div>
          )}
        </Show>

        {/* El margen deja libre la mitad del tirador del divisor que cae de este lado: la capa la taparía. */}
        <div ref={hueco} class="relative ml-1 min-h-0 flex-1 bg-surface-muted">
          <Show when={!capaLista(props.session, props.arbol) && !fallo()}>
            <p class="m-0 p-6 text-center text-xs text-neutral-500">{t("code.typst.starting")}</p>
          </Show>
        </div>

        <Show when={errores().length + avisos().length > 0}>
          <div class="shrink-0 border-t border-border bg-surface-raised text-caption">
            <div class="flex items-center gap-2 py-1 pr-1.5 pl-3">
              <button
                type="button"
                class="flex min-w-0 flex-1 items-center gap-1.5 py-0.5 text-left outline-none focus-visible:outline-2 focus-visible:outline-primary"
                aria-expanded={desplegada()}
                onClick={() => setDesplegada(!desplegada())}
              >
                <Show when={errores().length > 0}>
                  <CircleAlert size={13} class="shrink-0 text-error-strong" aria-hidden="true" />
                  <span class="shrink-0 font-medium text-error-strong">
                    {t("code.typst.errors", { count: errores().length })}
                  </span>
                </Show>
                <Show when={avisos().length > 0}>
                  <TriangleAlert size={13} class="shrink-0 text-warning-strong" aria-hidden="true" />
                  <span class="shrink-0 font-medium text-warning-strong">
                    {t("code.typst.warnings", { count: avisos().length })}
                  </span>
                </Show>
                <span class="min-w-0 truncate text-neutral-500">{(errores()[0] ?? avisos()[0])?.message}</span>
                {desplegada() ? (
                  <ChevronDown size={13} class="ml-auto shrink-0 text-neutral-500" aria-hidden="true" />
                ) : (
                  <ChevronUp size={13} class="ml-auto shrink-0 text-neutral-500" aria-hidden="true" />
                )}
              </button>
              <Show when={errores().length > 0}>
                <Button variant="secondary" size="compact" class="shrink-0" disabled={enviado()} onClick={arreglar}>
                  {enviado()
                    ? t("code.typst.fix.sent")
                    : errores().length === 1
                      ? t("code.typst.fix.one")
                      : t("code.typst.fix.all")}
                </Button>
              </Show>
            </div>
            <Show when={desplegada()}>
              <ul class="m-0 max-h-48 list-none overflow-y-auto border-t border-border p-0">
                <For each={[...errores(), ...avisos()]}>{(d) => <FilaDiagnostico d={d} onIrA={props.onIrA} />}</For>
              </ul>
            </Show>
          </div>
        </Show>
      </Show>
    </div>
  );
}

function FilaDiagnostico(props: { d: DiagnosticoTypst; onIrA: (d: DiagnosticoTypst) => void }) {
  return (
    <li>
      <button
        type="button"
        class="flex w-full items-start gap-2 px-3 py-1 text-left hover:bg-surface-muted disabled:cursor-default"
        disabled={props.d.line === null}
        onClick={() => props.onIrA(props.d)}
      >
        {props.d.severity === "error" ? (
          <CircleAlert size={12} class="mt-0.5 shrink-0 text-error-strong" aria-hidden="true" />
        ) : (
          <TriangleAlert size={12} class="mt-0.5 shrink-0 text-warning-strong" aria-hidden="true" />
        )}
        <Show when={lugarDe(props.d)}>
          <span class="shrink-0 font-mono text-neutral-500">{lugarDe(props.d)}</span>
        </Show>
        <span class="min-w-0 break-words text-neutral-950">{props.d.message}</span>
      </button>
    </li>
  );
}
