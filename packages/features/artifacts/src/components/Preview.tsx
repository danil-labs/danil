import { For, Show, Suspense, type JSX } from "solid-js";
import Documento from "../../../../ui/src/Document";
import Versiones from "./Versions";
import { type Forma } from "../model/sandbox";
import { type Preview } from "../queries";
import { Button } from "../../../../ui/src/Button";
import { Print } from "../../../../ui/src/icons";
import { FailureNote, asFailure } from "../../../../ui/src/Failure";
import { Skeleton } from "../../../../ui/src/Skeleton";
import { Markdown } from "../../../../ui/src/Markdown";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { peso, nf } from "../../../../../apps/desktop/src/lib/format";
import { delimiterFor } from "../../../../ui/src/lib/csv";
import { createPreviewState } from "./PreviewState";
import { createPreviewActions } from "./PreviewActions";

export type { Preview };

/**
 * La frase del catálogo partida por sus `{marcas}`, para que el dato que va en
 * monoespaciada caiga donde el traductor lo ponga. Sin esto la frase se
 * rompería en dos claves, y una traducción que reordene dejaría los trozos al
 * revés. `t()` devuelve texto y no un nodo.
 */
function enPartes(frase: string): string[] {
  return frase.split(/(\{\w+\})/);
}

export default function PreviewPane(props: {
  preview: Preview | null;
  absPath: string | null;
  /** Lo produjo el agente. Un adjunto que entró no tiene cadena de versiones:
      no es trabajo de la sesión, es su insumo. */
  esArtefacto: boolean;
  error: string | null;
  renderPdf: (props: { base64: string; name: string }) => JSX.Element;
  renderImage: (props: { src: string; alt: string }) => JSX.Element;
  renderTable: (props: { text: string; delim: string }) => JSX.Element;
}) {
  const estado = createPreviewState(props);
  const { filas, historia, viendo, publicaciones, pintarMarkdown, setPintarMarkdown, ocupado, remota, salida, fallo, gen, mostrado, setFilas } = estado;
  const { esWeb, forma, ver, esMarkdown, enUnaAnterior, restaurar, descargar, esHtml, imprimir, esOpaco, abrirAfuera } = createPreviewActions(props, estado);
  return (
    <Show when={!props.error} fallback={<FailureNote f={asFailure(props.error)} />}>
      {/* Ya no hay árbol de archivos que mencionar: se llega aquí desde la lista
          de la propia columna, y este estado solo se ve mientras el archivo
          carga. */}
      <Show when={props.preview} fallback={<Skeleton filas={5} />}>
        {(p) => (
          <div
            class={
              esWeb()
                ? "flex h-full flex-col p-0"
                : "flex h-full flex-col px-4 py-3"
            }
          >
            <Show when={!esWeb()}>
            <div class="mb-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-b border-border pb-2">
              <span
                class="min-w-0 basis-full grow break-all font-mono text-xs font-semibold"
                /* `mount-frontend` confirma con este marcador que la pestaña abrió su
                   visor. La presentación sale solo de las utilities. */
                classList={{ "preview-path": true }}
              >
                {p().rel}
              </span>
              <span class="whitespace-nowrap font-mono text-xs text-neutral-500">
                {peso(p().bytes)} · {p().kind}
              </span>
              {/* Qué es va fuera del bloque `mono`: el peso y la extensión son
                  datos de máquina, «presentación» es una palabra.

                  El estrechamiento va en el `when` y no dentro del hijo: una
                  web no tiene nombre que enseñar aquí —no llega a pintar esta
                  franja— y el tipo lo dice. */}
              <Show
                when={
                  forma() && forma() !== "web"
                    ? (forma() as Exclude<Forma, "web">)
                    : null
                }
              >
                {(f) => (
                  <span class="text-xs text-neutral-500">
                    {f() === "documento"
                      ? t("artifacts.shape.document")
                      : f() === "presentacion"
                        ? t("artifacts.shape.presentation")
                        : t("artifacts.shape.table")}
                  </span>
                )}
              </Show>
              {/* Cuántas filas trae es dato de máquina, como el peso — y va como
                  metadato, nunca como badge: un total que no espera nada de
                  nadie no lleva contador. */}
              <Show when={forma() === "tabla" && filas() > 0}>
                <span class="whitespace-nowrap font-mono text-xs text-neutral-500">
                  {t("artifacts.preview.rows", {
                    count: filas(),
                    n: nf().format(filas()),
                  })}
                </span>
              </Show>

              <Show when={historia()}>
                {(h) => (
                  <Versiones
                    historia={h()}
                    viendo={viendo()}
                    publicaciones={publicaciones()}
                    onVer={ver}
                  />
                )}
              </Show>

              {/* El botón nombra a dónde lleva, que es lo que hace legible un
                  conmutador de dos estados sin un rótulo que lo explique. */}
              <Show when={esMarkdown()}>
                <Button
                  variant="outline"
                  size="compact"
                  aria-pressed={pintarMarkdown()}
                  onClick={() => setPintarMarkdown((v) => !v)}
                >
                  {pintarMarkdown()
                    ? t("artifacts.markdown.raw")
                    : t("artifacts.markdown.rendered")}
                </Button>
              </Show>

              <Show when={enUnaAnterior()}>
                <Button
                  variant="outline"
                  size="compact"
                  onClick={() => void ver(null)}
                >
                  {t("artifacts.version.back_to_current")}
                </Button>
                {/* El nombre dice el acto entero: restaurar no deshace, añade.
                    Nada se borra: el botón puede decir en qué versión va a
                    quedar sin tener que explicarlo debajo. */}
                <Button
                  variant="outline"
                  size="compact"
                  onClick={() => void restaurar()}
                  disabled={ocupado()}
                >
                  {t("artifacts.version.restore_as", {
                    n: (historia()?.versions.length ?? 0) + 1,
                  })}
                </Button>
              </Show>

              {/* Se muestra para todo lo que la tarea produjo, no solo para los
                  documentos: bajar una hoja o una imagen tal cual es la misma
                  salida y pasa por el mismo registro. Lo que adjuntó la persona
                  no lleva este control — ya está en su máquina, y sacarlo de
                  aquí no es sacar nada. */}
              <Show when={props.esArtefacto && props.absPath}>
                <Button variant="outline" size="compact" disabled={ocupado()} onClick={() => void descargar()}>
                  {ocupado() ? t("artifacts.download.busy") : t("artifacts.download")}
                </Button>
              </Show>

              <Show when={esHtml() && props.absPath}>
                <Button
                  variant="outline"
                  size="compact"
                  class="gap-1"
                  onClick={() => void imprimir()}
                >
                  <Print size={12} />
                  {t("artifacts.print")}
                </Button>
              </Show>
              {/* Para lo que la app sí enseña. Lo que no puede enseñar lo
                  ofrece abajo, en el hueco donde iría el documento: ahí abrirlo
                  es lo único que se puede hacer con el archivo, no una salida
                  más entre otras, y repetir el botón en los dos sitios sería
                  poner dos veces el mismo acto en la misma pantalla. */}
              <Show when={props.absPath && !esOpaco() && !remota()}>
                <Button
                  variant="outline"
                  size="compact"
                  onClick={() => void abrirAfuera()}
                  title={t("artifacts.open_external.title")}
                >
                  {t("artifacts.open_external")}
                </Button>
              </Show>
            </div>
            </Show>

            {/* Qué salió y a dónde. El diálogo del sistema se cierra sin decir
                nada y un archivo escrito en otra carpeta no se ve desde aquí:
                sin este renglón, exportar y no exportar se parecen demasiado. */}
            <Show when={salida()}>
              {(s) => (
                <p class="mb-2 text-xs text-neutral-500">
                  {/* Partida por sus marcas para que la ruta conserve la
                      monoespaciada sin trocear la frase en dos claves. Ver
                      `enPartes`. */}
                  <For each={enPartes(t("artifacts.output.went_to"))}>
                    {(parte) =>
                      parte === "{destino}" ? (
                        <span class="font-mono text-neutral-950">
                          {s().destino}
                        </span>
                      ) : parte === "{peso}" ? (
                        peso(s().bytes)
                      ) : (
                        parte
                      )
                    }
                  </For>
                </p>
              )}
            </Show>

            <Show when={fallo()}>{(f) => <FailureNote f={f()} />}</Show>

            <Show when={esHtml() ? gen() : null} keyed>
              <Documento
                html={mostrado()!}
                nombre={p().rel}
                onFilas={setFilas}
              />
            </Show>

            <Suspense fallback={null}>
              <Show when={p().kind === "image" && p().data_url}>
                {(source) => (
                  <div class="min-h-0 flex-1 rounded-md border border-border bg-surface-muted">
                    {props.renderImage({ src: source(), alt: p().rel })}
                  </div>
                )}
              </Show>
              <Show when={p().kind === "pdf" && p().pdf}>
                {(data) => (
                  <div class="min-h-0 flex-1 rounded-md border border-border bg-surface-muted">
                    {props.renderPdf({ base64: data(), name: p().rel })}
                  </div>
                )}
              </Show>
            </Suspense>

            {/* Lo que se está viendo, que con una versión anterior abierta no
                es lo que hay en disco. */}
            <Show when={p().kind === "text" && p().text !== null}>
              <Show
                when={delimiterFor(p().rel)}
                fallback={
                  <Show
                    when={esMarkdown() && pintarMarkdown()}
                    fallback={
                      <pre class="m-0 overflow-x-auto rounded-md border border-border bg-surface-muted px-3 py-2.5 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap">
                        {mostrado() ?? p().text}
                      </pre>
                    }
                  >
                    <div class="overflow-x-auto rounded-md border border-border bg-surface-muted px-3.5 py-2.5">
                      <Markdown>{mostrado() ?? p().text!}</Markdown>
                    </div>
                  </Show>
                }
              >
                {(d) => (
                  <div class="min-h-0 flex-1 overflow-hidden rounded-md border border-border bg-surface-muted">
                    {props.renderTable({ text: mostrado() ?? p().text!, delim: d() })}
                  </div>
                )}
              </Show>
            </Show>

            {/* Donde iría el documento va lo único que se puede hacer con él.
                Antes decía «Vista previa no disponible» y ahí se acababa el
                camino: la pantalla describía su propia limitación y dejaba a
                quien abrió un `.docx` sin ninguna forma de leerlo. Qué es y
                cuánto pesa ya lo dice la franja de arriba. */}
            <Show when={esOpaco() && props.absPath}>
              <div class="flex items-center justify-center rounded-md border border-border bg-surface-muted px-3 py-8">
                <Show when={!remota()} fallback={
                  <Show when={props.esArtefacto}>
                    <Button variant="primary" disabled={ocupado()} onClick={() => void descargar()}>
                      {ocupado() ? t("artifacts.download.busy") : t("artifacts.download")}
                    </Button>
                  </Show>
                }>
                  <Button variant="primary" onClick={() => void abrirAfuera()}>
                    {t("artifacts.open_with_system")}
                  </Button>
                </Show>
              </div>
            </Show>
          </div>
        )}
      </Show>
    </Show>
  );
}
