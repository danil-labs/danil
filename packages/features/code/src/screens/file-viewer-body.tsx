import { Show, Suspense, createResource, createSignal } from "solid-js";
import { Button } from "../../../../ui/src/Button";
import { FailureNote, asFailure, type Failure } from "../../../../ui/src/Failure";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { peso } from "../../../../../apps/desktop/src/lib/format";
import type { FilePreview as Preview } from "../../../../engine-client/src/index.ts";
import { mediaKindOf } from "../model/media";
import type { LeerParte } from "../../../../host/src/tree-download";
import { comoDiff } from "../model/diff";
import { CuerpoDeArchivo } from "../components/Changes";
import { type Visores, type Contenido, extension, isImage } from "./file-viewer-model";

/**
 * Lo que hay dentro de un archivo que no se escribe aquí. El texto pasa por
 * `comoDiff` para que lo pinte el mismo componente que el diff: mismos números,
 * misma letra y mismo desplazamiento.
 */
/** Lo que `env::resolve_file_target` abre con su aplicación en vez de mostrar su carpeta. */
const CON_SU_APP = [
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp", "rtf", "txt", "md", "csv", "tsv",
  "png", "jpg", "jpeg", "gif", "webp", "bmp", "tif", "tiff", "heic", "html", "htm",
];

const OFFICE = ["doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp", "rtf"];

function Cuerpo(props: {
  contenido: Contenido;
  ruta: string;
  onOpenExternal: () => void;
  pedirOffice: () => Promise<Preview> | null;
  leerParte: LeerParte | null;
  conDescarga: boolean;
  visores: Visores;
}) {
  const esOffice = () => props.contenido.kind === "binary" && OFFICE.includes(extension(props.ruta));
  /** Un video o un audio se reproduce aquí aunque el motor lo cuente como binario. */
  const medio = () => (props.leerParte && props.contenido.kind !== "text" ? mediaKindOf(props.ruta) : null);
  /** Fuera de esta computadora «Abrir o ubicar» lo abriría en la otra máquina: se baja aquí. */
  const conDescarga = () => props.conDescarga;
  const [bajando, setBajando] = createSignal(false);
  const [falloDescarga, setFalloDescarga] = createSignal<Failure | null>(null);
  async function bajar() {
    if (!props.leerParte) return;
    setBajando(true);
    setFalloDescarga(null);
    try {
      const { descargar } = await import("../../../../host/src/tree-download");
      await descargar(props.ruta, props.leerParte);
    } catch (e) {
      setFalloDescarga(asFailure(e));
    } finally {
      setBajando(false);
    }
  }
  // `office_preview` y `tree_office_preview` rechazan con la cadena sola.
  const [office] = createResource(
    () => (esOffice() ? props.ruta : null),
    async () => {
      const pedido = props.pedirOffice();
      if (!pedido) return { pdf: null, falta: false };
      try {
        return { pdf: (await pedido).pdf, falta: false };
      } catch (e) {
        return { pdf: null, falta: e === "libreoffice_missing" };
      }
    },
  );
  const truncatedNotice = () => {
    if (props.contenido.kind === "text") return t("code.file.too_big");
    return isImage(props.ruta)
      ? t("code.file.image_too_big", { size: peso(props.contenido.bytes) })
      : t("code.file.opaque_big", { size: peso(props.contenido.bytes) });
  };
  return (
    <>
      <Show when={props.contenido.truncated && !medio()}>
        <p class="m-0 border-b border-border bg-surface-raised px-3 py-2 text-caption text-neutral-500">
          {truncatedNotice()}
        </p>
      </Show>

      <Suspense fallback={<p class="m-0 p-3 text-xs text-neutral-500">{t("code.file.opening")}</p>}>
        <Show when={props.contenido.kind === "image" && props.contenido.data_url}>
          {(source) => props.visores.imagen({ src: source(), alt: props.ruta })}
        </Show>
        <Show when={props.contenido.kind === "pdf" && props.contenido.pdf}>
          {(data) => props.visores.pdf({ base64: data(), name: props.ruta })}
        </Show>
      </Suspense>

      <Show when={esOffice() && (office.loading || office()?.pdf)}>
        <Show
          when={office()?.pdf}
          fallback={<p class="m-0 p-6 text-center text-xs text-neutral-500">{t("code.file.office.converting")}</p>}
        >
          {(data) => (
            <Suspense fallback={<p class="m-0 p-3 text-xs text-neutral-500">{t("code.file.opening")}</p>}>
              {props.visores.pdf({ base64: data(), name: props.ruta })}
            </Suspense>
          )}
        </Show>
      </Show>

      <Show when={medio()}>
        {(tipo) => (
          <Suspense fallback={<p class="m-0 p-3 text-xs text-neutral-500">{t("code.file.opening")}</p>}>
            {props.visores.medio({ ruta: props.ruta, tipo: tipo(), leer: props.leerParte! })}
          </Suspense>
        )}
      </Show>

      {/* Un binario desconocido se muestra en su carpeta; nunca se ejecuta desde aquí. */}
      <Show when={props.contenido.kind === "binary" && !medio() && !(esOffice() && (office.loading || office()?.pdf))}>
        <div class="flex flex-col items-center gap-3 p-6">
          <Show when={!props.contenido.truncated}>
            <p class="m-0 text-xs text-neutral-500">
              {t("code.file.opaque", { size: peso(props.contenido.bytes) })}
            </p>
          </Show>
          <Show when={office()?.falta}>
            <p class="m-0 text-xs text-neutral-500">{t("code.file.office.missing")}</p>
          </Show>
          <Show
            when={conDescarga()}
            fallback={
              <Button variant="primary" size="compact" onClick={props.onOpenExternal}>
                {t("code.file.open_external")}
              </Button>
            }
          >
            <Button variant="primary" size="compact" disabled={bajando()} onClick={() => void bajar()}>
              {bajando() ? t("code.file.download.busy") : t("code.file.download")}
            </Button>
            <Show when={falloDescarga()}>{(f) => <FailureNote f={f()} />}</Show>
          </Show>
        </div>
      </Show>

      <Show when={props.contenido.kind === "text"}>
        <CuerpoDeArchivo archivo={comoDiff(props.ruta, props.contenido.text)} onDesplegar={() => {}} />
      </Show>
    </>
  );
}

export { CON_SU_APP, Cuerpo };
