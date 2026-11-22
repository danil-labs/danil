import { Match, Show, Suspense, Switch, createResource, createSignal, lazy, onCleanup, onMount } from "solid-js";
import { invoke } from "../../engine-client/src/client";
import FileIcon from "lucide-solid/icons/file";
import FileText from "lucide-solid/icons/file-text";
import FileSpreadsheet from "lucide-solid/icons/file-spreadsheet";
import Presentation from "lucide-solid/icons/presentation";
import FileCode from "lucide-solid/icons/file-code";
import { t } from "../../../apps/desktop/src/lib/i18n";
import { cn } from "../../../apps/desktop/src/lib/utils";
import X from "lucide-solid/icons/x";
import Navegador from "lucide-solid/icons/external-link";
import PanelRight from "lucide-solid/icons/panel-right";
import { Button } from "./Button";
import { Dialog, DialogContent, DialogTitle } from "./Dialog";
import { envolver, SANDBOX_ARTEFACTO } from "./lib/sandbox";
import { useFileMachine } from "./fileMachine";

// El visor entero baja solo al abrir la vista previa: `pdfjs-dist` no entra en el arranque.
const PdfDocument = lazy(() => import("../../features/viewers/src/screens/Pdf"));
const Documento = lazy(() => import("./Document"));

// La miniatura de un HTML: la página a ancho de escritorio, reducida al ancho de la tarjeta.
const HTML_ANCHO = 1280;
const HTML_ALTO = 800;

/** Lo que `office_preview` sabe convertir; la misma lista que `delivery/preview.rs`. */
const OFFICE = ["doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp", "rtf"];
const ANCHO = 240;

const extension = (ruta: string) => ruta.split(/[\\/]/).pop()?.split(".").pop()?.toLowerCase() ?? "";
const nombreDe = (ruta: string) => ruta.split(/[\\/]/).pop() ?? ruta;

function tamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function Icono(props: { ext: string }) {
  return (
    <Switch fallback={<FileIcon size={16} />}>
      <Match when={["xls", "xlsx", "ods", "csv"].includes(props.ext)}>
        <FileSpreadsheet size={16} />
      </Match>
      <Match when={["html", "htm"].includes(props.ext)}>
        <FileCode size={16} />
      </Match>
      <Match when={["ppt", "pptx", "odp"].includes(props.ext)}>
        <Presentation size={16} />
      </Match>
      <Match when={["pdf", "doc", "docx", "odt", "rtf", "txt", "md"].includes(props.ext)}>
        <FileText size={16} />
      </Match>
    </Switch>
  );
}

/**
 * Un archivo que la respuesta nombra con `![x](/ruta)`: tarjeta con nombre y
 * tamaño y, si es PDF u Office, su primera página. El clic abre la vista
 * previa flotante, como una imagen; lo que no tiene página va al visor.
 * La página se pide al entrar en pantalla; un HTML corre solo mientras se ve.
 */
export function FilePreview(props: { path: string; alt?: string }) {
  const ext = extension(props.path);
  const conPagina = ext === "pdf" || OFFICE.includes(ext);
  const esHtml = ext === "html" || ext === "htm";
  let caja: HTMLButtonElement | undefined;
  let lienzo: HTMLCanvasElement | undefined;
  const [visible, setVisible] = createSignal(false);
  const [pagina, setPagina] = createSignal<"cargando" | "lista" | "sin-office" | "falla">("cargando");
  const [pdf, setPdf] = createSignal<string | null>(null);
  const [abierta, setAbierta] = createSignal(false);
  const [enPantalla, setEnPantalla] = createSignal(false);
  // El archivo de una tarea de otra máquina está en el disco de esa máquina.
  const enSuMaquina = useFileMachine();

  const [bytes] = createResource(() =>
    invoke<number>("file_size", { path: props.path }, enSuMaquina()).catch(() => null),
  );

  onMount(() => {
    if ((!conPagina && !esHtml) || !caja) return;
    const vigia = new IntersectionObserver((entradas) => {
      const dentro = entradas.some((e) => e.isIntersecting);
      if (dentro) setVisible(true);
      // El PDF ya pintado es un mapa de bits; el HTML es una página viva y se sigue vigilando.
      if (esHtml) setEnPantalla(dentro);
      else if (dentro) vigia.disconnect();
    });
    vigia.observe(caja);
    onCleanup(() => vigia.disconnect());
  });

  const [html] = createResource(
    () => esHtml && visible(),
    async () => {
      const p = await invoke<{ kind: string; text: string | null; truncated: boolean }>(
        "preview_file",
        { path: props.path, rel: props.path },
        enSuMaquina(),
      ).catch(() => null);
      return p && p.kind === "html" && !p.truncated && p.text ? p.text : null;
    },
  );
  const marco = () => {
    const texto = html();
    return texto ? envolver(texto) : null;
  };

  createResource(() => conPagina && visible(), async () => {
    try {
      const preview =
        ext === "pdf"
          ? await invoke<{ pdf: string | null }>("preview_file", { path: props.path, rel: props.path }, enSuMaquina())
          : await invoke<{ pdf: string | null }>("office_preview", { path: props.path }, enSuMaquina());
      if (!preview.pdf || !lienzo) throw new Error("sin_pdf");
      setPdf(preview.pdf);
      const { renderFirstPage } = await import("../../features/viewers/src/model/pdfThumb");
      await renderFirstPage(preview.pdf, lienzo, ANCHO);
      setPagina("lista");
    } catch (e) {
      // `office_preview` rechaza con la cadena sola, sin `Failure`.
      setPagina(e === "libreoffice_missing" ? "sin-office" : "falla");
    }
  });

  const enPestana = () => {
    setAbierta(false);
    window.dispatchEvent(new CustomEvent("harness:open-file", { detail: props.path }));
  };
  const conSuApp = () => void invoke("open_file_external", { target: props.path }).catch(() => enPestana());
  const abrir = () => {
    if (esHtml) return html() ? setAbierta(true) : enPestana();
    if (!conPagina || pagina() === "sin-office" || pagina() === "falla") return enPestana();
    setVisible(true);
    setAbierta(true);
  };

  return (
    <>
    <button
      ref={caja}
      type="button"
      title={props.path}
      onClick={abrir}
      class="my-2 flex w-60 max-w-full cursor-pointer flex-col overflow-hidden rounded-md border border-border bg-surface-raised text-left hover:border-neutral-500 focus-visible:outline-2 focus-visible:outline-primary"
    >
      <Show when={esHtml}>
        <span
          class="relative block overflow-hidden border-b border-border bg-surface-muted"
          style={{ width: "240px", height: `${(HTML_ALTO * 240) / HTML_ANCHO}px` }}
        >
          <Show
            when={enPantalla() && marco()}
            fallback={
              <span class="absolute inset-0 grid place-items-center px-3 text-center text-xs text-neutral-500">
                {html.loading || !visible() ? t("chat.file.loading") : html() ? "" : t("chat.file.no_preview")}
              </span>
            }
          >
            {(doc) => (
              <iframe
                title={nombreDe(props.path)}
                aria-hidden="true"
                tabIndex={-1}
                sandbox={SANDBOX_ARTEFACTO}
                srcdoc={doc()}
                class="pointer-events-none absolute top-0 left-0 origin-top-left border-0"
                style={{
                  width: `${HTML_ANCHO}px`,
                  height: `${HTML_ALTO}px`,
                  transform: `scale(${240 / HTML_ANCHO})`,
                }}
              />
            )}
          </Show>
        </span>
      </Show>
      <Show when={conPagina}>
        <span
          class={cn(
            "relative block max-h-80 overflow-hidden border-b border-border bg-surface-raised",
            pagina() !== "lista" && "h-32 bg-surface-muted",
          )}
        >
          <canvas ref={lienzo} class={cn("block", pagina() !== "lista" && "hidden")} />
          <Show when={pagina() !== "lista"}>
            <span class="absolute inset-0 grid place-items-center px-3 text-center text-xs text-neutral-500">
              {pagina() === "cargando"
                ? t("chat.file.loading")
                : pagina() === "sin-office"
                  ? t("chat.file.office_missing")
                  : t("chat.file.no_preview")}
            </span>
          </Show>
        </span>
      </Show>
      <span class="flex items-center gap-2 px-2.5 py-2">
        <span class="shrink-0 text-neutral-500">
          <Icono ext={ext} />
        </span>
        <span class="min-w-0 flex-1">
          <span class="block truncate text-xs font-semibold text-neutral-950">
            {props.alt?.trim() || nombreDe(props.path)}
          </span>
          <span class="block truncate font-mono text-caption text-neutral-500">
            {ext.toUpperCase() || t("chat.file.kind")}
            <Show when={bytes()}>{(n) => ` · ${tamano(n())}`}</Show>
          </span>
        </span>
      </span>
    </button>
    <Dialog open={abierta()} onOpenChange={setAbierta}>
      <DialogContent class="flex h-[85vh] w-full max-w-[1100px] flex-col gap-2">
        <div class="flex items-center justify-between gap-3">
          <DialogTitle class="min-w-0 truncate text-sm">{props.alt?.trim() || nombreDe(props.path)}</DialogTitle>
          <div class="flex shrink-0 items-center gap-1">
            <Button variant="ghost" size="compact" class="gap-1.5 text-neutral-500" onClick={enPestana}>
              <PanelRight size={13} aria-hidden="true" />
              {t("chat.file.open_tab")}
            </Button>
            <Button variant="ghost" size="compact" class="gap-1.5 text-neutral-500" onClick={conSuApp}>
              <Navegador size={13} aria-hidden="true" />
              {t("chat.file.open_app")}
            </Button>
            <Dialog.CloseButton class="shrink-0 rounded p-1 hover:bg-surface-muted" aria-label={t("chat.attachments.close")}>
              <X size={18} />
            </Dialog.CloseButton>
          </div>
        </div>
        <div class="min-h-0 flex-1 overflow-hidden rounded-md border border-border">
          <Show when={esHtml && html()}>
            {(texto) => (
              <div class="flex h-full min-h-0 flex-col">
                <Suspense fallback={<p class="m-0 p-6 text-center text-xs text-neutral-500">{t("chat.file.loading")}</p>}>
                  <Documento html={texto()} nombre={props.path} onFilas={() => {}} aSangre />
                </Suspense>
              </div>
            )}
          </Show>
          <Show
            when={!esHtml && pdf()}
            fallback={
              <Show when={!esHtml}>
                <p class="m-0 p-6 text-center text-xs text-neutral-500">{t("chat.file.loading")}</p>
              </Show>
            }
          >
            {(data) => (
              <Suspense fallback={<p class="m-0 p-6 text-center text-xs text-neutral-500">{t("chat.file.loading")}</p>}>
                <PdfDocument base64={data()} name={props.path} />
              </Suspense>
            )}
          </Show>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
