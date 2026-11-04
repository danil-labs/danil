import Check from "lucide-solid/icons/check";
import ChevronDown from "lucide-solid/icons/chevron-down";
import ChevronUp from "lucide-solid/icons/chevron-up";
import CircleAlert from "lucide-solid/icons/circle-alert";
import TriangleAlert from "lucide-solid/icons/triangle-alert";
import { For, Show, Suspense, createEffect, createSignal, lazy, on, onCleanup } from "solid-js";
import { t } from "../../lib/i18n";
import { invoke } from "../../lib/invoke.ts";
import { machineOf } from "../machines/store";
import { Button } from "../../ui/Button";
import { FailureNote, asFailure, type Failure } from "../../ui/Failure";
import { Spinner } from "../../ui/Spinner";
import { type DiagnosticoTypst, type ExportacionTypst, lugarDe, pedirArreglo, principalElegido } from "./typst";

const PdfDocument = lazy(() => import("../viewers/Pdf"));

/** Cuánto espera, desde el último cambio guardado, a volver a compilar: cada vez escribe el PDF entero. */
const PAUSA_DE_LA_EXPORTACION = 800;

/**
 * La vista de un `.typ` donde la ventana no corre Tinymist (la web): la máquina
 * de la tarea compila el principal a `dist/<principal>.pdf` (`tree_typst_export`)
 * y ese PDF se pinta con el visor de PDF. Se vuelve a compilar cuando cambia el
 * texto en disco (`version`); el PDF anterior se queda a la vista mientras tanto.
 */
export default function VistaTypstExportada(props: {
  project: string;
  session: string;
  arbol: string;
  ruta: string;
  /** Cambia con cada guardado y con cada relectura del archivo. */
  version: string;
  onIrA: (d: DiagnosticoTypst) => void;
}) {
  const [pdf, setPdf] = createSignal<string | null>(null);
  const [demasiado, setDemasiado] = createSignal(false);
  const [diagnosticos, setDiagnosticos] = createSignal<DiagnosticoTypst[]>([]);
  const [compilando, setCompilando] = createSignal(false);
  const [fallo, setFallo] = createSignal<Failure | null>(null);
  const [sinPlugin, setSinPlugin] = createSignal(false);
  const [desplegada, setDesplegada] = createSignal(false);
  const [enviado, setEnviado] = createSignal(false);
  const errores = () => diagnosticos().filter((d) => d.severity === "error");
  const avisos = () => diagnosticos().filter((d) => d.severity === "warning");

  let pedido = 0;
  async function compilar() {
    const n = ++pedido;
    setCompilando(true);
    setFallo(null);
    try {
      const x = await invoke<ExportacionTypst>("tree_typst_export", {
        project: props.project,
        session: props.session,
        tree: props.arbol,
        path: props.ruta,
        main: principalElegido(props.project),
      }, machineOf(props.session));
      if (n !== pedido) return;
      setDiagnosticos(x.diagnostics);
      setSinPlugin(false);
      // Con errores no hay PDF nuevo: se queda el último que sí compiló.
      if (!x.pdf) return;
      const c = await invoke<{ kind: string; pdf: string | null; truncated: boolean }>("tree_show", {
        project: props.project,
        session: props.session,
        tree: props.arbol,
        path: x.pdf,
      }, machineOf(props.session));
      if (n !== pedido) return;
      setDemasiado(c.kind !== "pdf" || !c.pdf);
      if (c.pdf) setPdf(c.pdf);
    } catch (e) {
      if (n !== pedido) return;
      const f = asFailure(e);
      if (f.detail === "plugin_not_enabled") setSinPlugin(true);
      else setFallo(f);
    } finally {
      if (n === pedido) setCompilando(false);
    }
  }

  let espera: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(espera));
  createEffect(
    on([() => props.ruta, () => props.version, () => principalElegido(props.project)], () => {
      clearTimeout(espera);
      // El primero sale ya; los que siguen a un guardado esperan a que se deje de escribir.
      espera = setTimeout(() => void compilar(), pdf() ? PAUSA_DE_LA_EXPORTACION : 0);
    }),
  );
  createEffect(on(() => errores().length, () => setEnviado(false), { defer: true }));

  function arreglar() {
    if (errores().length === 0) return;
    pedirArreglo(props.project, props.session, principalElegido(props.project) ?? props.ruta, errores());
    setEnviado(true);
  }

  const abrirAjustes = () => window.dispatchEvent(new CustomEvent("harness:open-settings", { detail: "plugins" }));

  return (
    <div class="flex min-h-0 flex-1 flex-col">
      <Show
        when={!sinPlugin()}
        fallback={
          <div class="flex flex-col items-center gap-3 p-6 text-center">
            <p class="m-0 text-xs text-neutral-500">{t("code.typst.missing")}</p>
            <Button variant="primary" size="compact" onClick={abrirAjustes}>
              {t("code.typst.install")}
            </Button>
          </div>
        }
      >
        <div class="flex shrink-0 items-center gap-1.5 border-b border-border px-2 py-1 text-caption text-neutral-500">
          <Show
            when={!compilando()}
            fallback={
              <span role="status" class="flex items-center gap-1.5">
                <Spinner size={13} class="text-primary" />
                {t("code.typst.compiling")}
              </span>
            }
          >
            <Show
              when={errores().length === 0}
              fallback={
                <span role="status" class="flex min-w-0 items-center gap-1.5">
                  <CircleAlert size={13} class="shrink-0 text-error-strong" aria-hidden="true" />
                  <span class="truncate">{t("code.typst.stale")}</span>
                </span>
              }
            >
              <Show when={pdf()}>
                <span role="status" class="flex min-w-0 items-center gap-1.5">
                  <Check size={13} class="shrink-0 text-success" aria-hidden="true" />
                  <span class="truncate">{t("code.typst.compiled")}</span>
                </span>
              </Show>
            </Show>
          </Show>
        </div>

        <Show when={fallo()}>
          {(f) => (
            <div class="flex shrink-0 items-start gap-2 border-b border-border p-3">
              <div class="min-w-0 flex-1">
                <FailureNote f={f()} />
              </div>
              <Button variant="secondary" size="compact" class="shrink-0" onClick={() => void compilar()}>
                {t("code.typst.retry")}
              </Button>
            </div>
          )}
        </Show>

        <div class="relative flex min-h-0 flex-1 flex-col bg-surface-muted">
          <Show
            when={pdf()}
            fallback={
              <p class="m-0 p-6 text-center text-xs text-neutral-500">
                {demasiado() ? t("code.typst.export.too_big") : compilando() ? t("code.typst.compiling") : ""}
              </p>
            }
          >
            {(data) => (
              <Suspense fallback={<p class="m-0 p-3 text-xs text-neutral-500">{t("code.file.opening")}</p>}>
                <PdfDocument base64={data()} name={props.ruta} />
              </Suspense>
            )}
          </Show>
        </div>

        <Show when={diagnosticos().length > 0}>
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
                  <span class="shrink-0 font-medium text-error-strong">{t("code.typst.errors", { count: errores().length })}</span>
                </Show>
                <Show when={avisos().length > 0}>
                  <TriangleAlert size={13} class="shrink-0 text-warning-strong" aria-hidden="true" />
                  <span class="shrink-0 font-medium text-warning-strong">{t("code.typst.warnings", { count: avisos().length })}</span>
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
                  {enviado() ? t("code.typst.fix.sent") : errores().length === 1 ? t("code.typst.fix.one") : t("code.typst.fix.all")}
                </Button>
              </Show>
            </div>
            <Show when={desplegada()}>
              <ul class="m-0 max-h-48 list-none overflow-y-auto border-t border-border p-0">
                <For each={[...errores(), ...avisos()]}>
                  {(d) => (
                    <li>
                      <button
                        type="button"
                        class="flex w-full items-start gap-2 px-3 py-1 text-left hover:bg-surface-muted disabled:cursor-default"
                        disabled={d.line === null}
                        onClick={() => props.onIrA(d)}
                      >
                        {d.severity === "error" ? (
                          <CircleAlert size={12} class="mt-0.5 shrink-0 text-error-strong" aria-hidden="true" />
                        ) : (
                          <TriangleAlert size={12} class="mt-0.5 shrink-0 text-warning-strong" aria-hidden="true" />
                        )}
                        <Show when={lugarDe(d)}>
                          <span class="shrink-0 font-mono text-neutral-500">{lugarDe(d)}</span>
                        </Show>
                        <span class="min-w-0 break-words text-neutral-950">{d.message}</span>
                      </button>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </div>
        </Show>
      </Show>
    </div>
  );
}
