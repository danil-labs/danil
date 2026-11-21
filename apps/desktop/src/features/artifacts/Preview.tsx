import { For, Show, Suspense, createEffect, createSignal, lazy, on, onCleanup } from "solid-js";
import { invoke } from "../../engine/client.ts";
import { save } from "@tauri-apps/plugin-dialog";
import { join, tempDir } from "@tauri-apps/api/path";
import { useFileMachine } from "../../ui/fileMachine";
import Documento from "./Document";
import Versiones from "./Versions";
import {
  envolver,
  formaDe,
  type Forma,
} from "./sandbox";
import {
  descargarArtefacto,
  historiaDe,
  leerVersion,
  publicacionesDe,
  registrarSalida,
  restaurarVersion,
  type History,
  type Publicacion,
  type Via,
  type VersionRef,
} from "./history";
import { Button } from "../../ui/Button";
import { Print } from "../../ui/icons";
import { FailureNote, asFailure, type Failure, detalleDe } from "../../ui/Failure";
import { Skeleton } from "../../ui/Skeleton";
import { Markdown } from "../../ui/Markdown";
import { t } from "../../lib/i18n";
import { extensionDe } from "../../lib/steps";
import { peso, nf } from "../../lib/format";
import { delimiterFor } from "../viewers/csv";
import { ArtifactDownloadError, readArtifactDownload } from "./download.ts";

/** Bajan al abrirse: `pdfjs-dist` no entra en el arranque de la ventana. */
const PdfDocument = lazy(() => import("../viewers/Pdf"));
const ZoomableImage = lazy(() => import("../viewers/ImageViewer"));
const DelimitedTable = lazy(() => import("../viewers/CsvTable"));

export type Preview = {
  rel: string;
  kind: "html" | "image" | "text" | "pdf" | "binary" | string;
  text: string | null;
  data_url: string | null;
  /** Bytes del PDF en base64, solo con `kind: "pdf"`. */
  pdf: string | null;
  bytes: number;
  truncated: boolean;
};

/**
 * La frase del catálogo partida por sus `{marcas}`, para que el dato que va en
 * monoespaciada caiga donde el traductor lo ponga. Sin esto la frase se
 * rompería en dos claves, y una traducción que reordene dejaría los trozos al
 * revés. `t()` devuelve texto y no un nodo.
 */
function enPartes(frase: string): string[] {
  return frase.split(/(\{\w+\})/);
}

/**
 * La extensión con la que se baja el artefacto, para nombrarla en el menú.
 * Vacío cuando no tiene: un nombre sin punto no es una extensión, y `split(".")`
 * devolvería el nombre entero.
 */
const extDescarga = (rel: string) => {
  const e = extensionDe(rel);
  return e ? `.${e.toLowerCase()}` : "";
};

export default function PreviewPane(props: {
  preview: Preview | null;
  absPath: string | null;
  /** Lo produjo el agente. Un adjunto que entró no tiene cadena de versiones:
      no es trabajo de la sesión, es su insumo. */
  esArtefacto: boolean;
  error: string | null;
}) {
  // Lo que falla al preparar una impresión o al abrir una versión no
  // puede quedarse en la consola: desde fuera se ve igual que un botón que no
  // hace nada.
  const [fallo, setFallo] = createSignal<Failure | null>(null);
  /** La máquina de la tarea si no es esta: el historial vive allá, y lo que sale se escribe aquí. */
  const enSuMaquina = useFileMachine();
  const remota = () => enSuMaquina() !== undefined;

  const [historia, setHistoria] = createSignal<History | null>(null);
  /** La versión que se está mirando, o `null` si es la que está en disco. */
  const [viendo, setViendo] = createSignal<VersionRef | null>(null);
  /** Lo que hay en disco. */
  const [actual, setActual] = createSignal<string | null>(null);
  /** Lo que se está pintando: `actual`, o una versión anterior. */
  const [mostrado, setMostrado] = createSignal<string | null>(null);

  const [gen, setGen] = createSignal(0);
  /**
   * Pintar el Markdown, o enseñar el texto tal como está en el archivo.
   * Pintado por omisión: un `.md` se escribe para leerse con formato.
   * Se pinta con el mismo componente que la respuesta del agente en el chat,
   * que filtra el esquema de enlaces e imágenes (`ui/Markdown.tsx`). Un
   * artefacto HTML sigue yendo al contenedor cerrado: HTML sí ejecuta.
   */
  const [pintarMarkdown, setPintarMarkdown] = createSignal(true);
  const [filas, setFilas] = createSignal(0);
  const [ocupado, setOcupado] = createSignal(false);
  /** Lo que ya salió de esta sesión. Es el rastro del gate, no un permiso. */
  const [publicaciones, setPublicaciones] = createSignal<Publicacion[]>([]);
  /** La última salida, para poder decir qué pasó: el diálogo del sistema se
      cierra y desde fuera un archivo escrito en otra carpeta no se ve. */
  const [salida, setSalida] = createSignal<{
    destino: string;
    bytes: number;
  } | null>(null);
  // Todo esto se va con el documento al que pertenece: un error, un historial o
  // una versión abierta de otro archivo, encima del que estás mirando, es
  // información inventada.
  //
  // Con `on(...)` y la lista escrita: el cuerpo lee y escribe casi todas las
  // señales de arriba; rastreando solo, se relanzaría a sí mismo.
  createEffect(
    on(
      () =>
        [
          props.preview?.rel,
          props.preview?.text,
          props.preview?.kind,
          props.absPath,
          props.esArtefacto,
        ] as const,
      ([, , kind, absPath, esArtefacto]) => {

        const texto =
          kind === "html" || kind === "text" ? (props.preview?.text ?? null) : null;
        setActual(texto);
        setMostrado(texto);
        setViendo(null);
        setHistoria(null);
        setFilas(0);
        setFallo(null);
        setSalida(null);
        setPublicaciones([]);
        setGen((g) => g + 1);

        if (!esArtefacto || (kind !== "html" && kind !== "text") || !absPath) return;
        /* Un artefacto web no abre cadena, y no es un olvido: sellar una
           versión le da nombre a lo que sale de la máquina (`workspace/versions.rs`), y
           de un sitio no sale nada — su pestaña no tiene descargar, exportar,
           imprimir ni abrir afuera. Una cadena sin nombre sería una copia por
           cada apertura, para un registro que nadie lee. */
        if (formaDe(texto ?? "") === "web") return;
        let vivo = true;
        historiaDe(absPath, enSuMaquina())
          .then((h) => {
            if (!vivo) return;
            setHistoria(h);
            // Y lo que ya salió de aquí: sin esto la cadena diría qué versiones
            // hay pero no cuál cruzó el límite, que es la mitad que importa.
            if (h.current) {
              publicacionesDe(h.current.project, h.current.session)
                .then(
                  (ps) =>
                    vivo &&
                    setPublicaciones(
                      ps.filter((x) => x.version?.artifact === h.current!.artifact),
                    ),
                )
                .catch(() => {});
            }
          })
          .catch(
            (e) =>
              vivo &&
              setFallo({
                what: t("artifacts.history.failed"),
                detail: detalleDe(e),
              }),
          );

        onCleanup(() => { vivo = false; });
      },
    ),
  );

  /* Exportar es imprimir, y ocurre fuera de la app: el webview de macOS
     ignora `window.print()` (verificado). La app escribe una copia paginada
     y la entrega al navegador del sistema, que sí imprime a PDF.

     La copia lleva la misma política de red embebida: ahí afuera ya no hay
     marco que contenga nada, y esa política es lo único que viaja con el
     documento suelto. Es mitigación, no el candado — el candado es el
     contenedor.

     Se imprime lo que se está viendo: con una versión anterior abierta, el
     PDF es de esa. */
  async function imprimir() {
    const html = mostrado();
    if (!props.absPath || !html) return;
    setFallo(null);
    try {
      // El navegador que imprime es el de esta computadora: la copia de una tarea de otra máquina va a su carpeta temporal.
      const path = remota()
        ? await join(await tempDir(), "terminus-print", props.absPath.split(/[/\\]/).pop() || "artefacto.html")
        : props.absPath;
      const destino = await invoke<string>("prepare_print", {
        path,
        html: envolver(html, { impresion: true }),
      });
      await invoke("open_external", { target: destino });
      // A partir de aquí el documento corre sin contenedor: es una salida, y se
      // anota como tal aunque el PDF lo escriba el navegador y no la app.
      await anotar("pdf", destino);
    } catch (e) {
      setFallo({
        what: t("artifacts.print.failed"),
        detail: detalleDe(e),
      });
    }
  }

  /** Qué versión es la que está saliendo, y cuánto pesa.
   *
   * Un documento HTML llega con su cadena ya cargada. Un `.docx` no: no se
   * pinta aquí dentro, no pasa por el historial, y `anotar` se iba sin base —
   * el archivo salía de la máquina y el registro decía que no había salido
   * nada. Sellar aquí le da nombre a lo que sale (`delivery/publications.rs`).
   *
   * Solo para lo que la tarea produjo. Un adjunto ya está en la máquina de
   * quien lo adjuntó; sellarlo abriría una cadena de versiones de un insumo. */
  async function versionQueSale(): Promise<{ base: VersionRef; bytes: number } | null> {
    const cargada = historia();
    const base = viendo() ?? cargada?.current;
    if (base) {
      return {
        base,
        bytes: cargada?.versions.find((v) => v.referencia.n === base.n)?.bytes ?? 0,
      };
    }
    if (!props.esArtefacto || !props.absPath) return null;
    const h = await historiaDe(props.absPath, enSuMaquina());
    if (!h.current) return null;
    const n = h.current.n;
    return {
      base: h.current,
      bytes: h.versions.find((v) => v.referencia.n === n)?.bytes ?? 0,
    };
  }

  /* Las cuatro vías se anotan igual. PDF y abrir afuera no las materializa la
     app, pero el instante en que entrega el material es el instante en que
     deja de haber contenedor. Anotarlas solo desde el exportador diría que el
     material sale por dos puertas cuando sale por cuatro. */
  async function anotar(via: Via, destino: string) {
    try {
      const sale = await versionQueSale();
      if (!sale) return;
      const { base, bytes } = sale;
      await registrarSalida(base, via, destino, bytes, enSuMaquina());
      setPublicaciones(
        (await publicacionesDe(base.project, base.session)).filter(
          (x) => x.version?.artifact === base.artifact,
        ),
      );
    } catch {
      // Un registro que falla no puede impedir el trabajo, pero tampoco puede
      // pasar en silencio: lo que no se anotó no se puede auditar después.
      setFallo({
        what: t("artifacts.record.failed"),
        detail: `${via} · ${destino}`,
      });
    }
  }

  /* Entregarlo a la app del sistema es una salida, no un atajo de
     visualización: el archivo lo tiene Word, Excel o el visor de turno, con
     los permisos de quien opera y sin contenedor alrededor. Pasa por el mismo
     registro que el `.docx` y la descarga.

     Si no se pudo abrir, se dice: el botón lanza un proceso fuera de la
     ventana, y fallar en silencio se vería idéntico a que el sistema tarde en
     levantar la otra app. */
  async function abrirAfuera() {
    const ruta = props.absPath;
    if (!ruta) return;
    setFallo(null);
    try {
      await invoke("open_external", { target: ruta });
    } catch (e) {
      setFallo({
        what: t("artifacts.open_external.failed"),
        detail: detalleDe(e),
      });
      return;
    }
    await anotar("abrir-afuera", ruta);
  }

  /** Dónde quiere guardarlo, o `null` si se arrepintió. */
  async function aDonde(
    sugerido: string,
    filtro?: { name: string; extensions: string[] },
  ): Promise<string | null> {
    try {
      return await save({
        defaultPath: sugerido,
        filters: filtro ? [filtro] : undefined,
      });
    } catch (e) {
      setFallo({
        what: t("artifacts.save_dialog.failed"),
        detail: detalleDe(e),
      });
      return null;
    }
  }

  /* Bajar el archivo tal cual. No pasa por el marco —no hay nada que
     convertir— pero sí pasa por el gate: sale de la máquina, y el backend lo
     sella y lo anota como publicación (`workspace/versions.rs`).

     Se baja lo que se está viendo, igual que se imprime lo que se está
     viendo: con una versión anterior abierta, el documento de ahora daría
     bytes distintos de los que la persona tiene delante. */
  async function descargar() {
    const p = props.preview;
    if (!props.absPath || !p) return;
    setFallo(null);
    setSalida(null);
    if (remota()) return descargarDeOtraMaquina(p);

    const v = viendo();
    const nombre = p.rel.split(/[/\\]/).pop() || "artefacto";
    const punto = nombre.lastIndexOf(".");
    const sugerido =
      !v || punto <= 0
        ? nombre
        : `${nombre.slice(0, punto)}-v${v.n}${nombre.slice(punto)}`;

    const destino = await aDonde(sugerido);
    if (!destino) return;

    setOcupado(true);
    try {
      const r = await descargarArtefacto(props.absPath, v?.n ?? null, destino);
      setSalida({ destino, bytes: r.bytes });
      // Descargar sella: la cadena puede haber crecido. Se refresca solo si
      // ya se estaba enseñando — un artefacto que no es documento no muestra
      // su historial, y estrenárselo aquí sería una pantalla nueva aparecida
      // por descargar.
      if (historia()) {
        setHistoria(r.historia);
        if (r.historia.current) {
          setPublicaciones(
            (
              await publicacionesDe(
                r.historia.current.project,
                r.historia.current.session,
              )
            ).filter((x) => x.version?.artifact === r.historia.current!.artifact),
          );
        }
      }
    } catch (e) {
      setFallo(asFailure(e));
    } finally {
      setOcupado(false);
    }
  }

  /* De una tarea de otra máquina `download_artifact` escribiría en el disco de
     allá. La versión se sella allá (`artifact_history`), sus bytes viajan por
     partes (`artifact_read_part`), se guardan aquí como descarga del navegador
     y la salida se anota allá, que es donde vive la cadena. Un motor anterior
     no tiene las partes: entonces solo sale el texto de la versión sellada. */
  async function descargarDeOtraMaquina(p: Preview) {
    const ruta = props.absPath!;
    const nombre = p.rel.split(/[/\\]/).pop() || "artefacto";
    setOcupado(true);
    try {
      const h = await historiaDe(ruta, enSuMaquina());
      const v = viendo();
      const base = v ?? h.current;
      if (!base) return;
      const punto = nombre.lastIndexOf(".");
      const sugerido = !v || punto <= 0 ? nombre : `${nombre.slice(0, punto)}-v${v.n}${nombre.slice(punto)}`;
      const version = h.versions.find(entry => entry.referencia.n === base.n && entry.referencia.artifact === base.artifact && entry.referencia.project === base.project && entry.referencia.session === base.session);
      const machine = enSuMaquina();
      const blob = await readArtifactDownload(base, version?.bytes ?? NaN, p.kind === "text" || p.kind === "html", {
        part: (referencia, offset, size) => invoke("artifact_read_part", { referencia, offset, size }, machine),
        text: referencia => leerVersion(referencia, machine),
      });
      const enlace = document.createElement("a");
      enlace.href = URL.createObjectURL(blob);
      enlace.download = sugerido;
      enlace.click();
      setTimeout(() => URL.revokeObjectURL(enlace.href), 1000);
      setSalida({ destino: sugerido, bytes: blob.size });
      await registrarSalida(base, "descarga", sugerido, blob.size, enSuMaquina()).catch(() =>
        setFallo({ what: t("artifacts.record.failed"), detail: `descarga · ${sugerido}` }));
      if (historia()) {
        setHistoria(h);
        setPublicaciones((await publicacionesDe(base.project, base.session)).filter((x) => x.version?.artifact === base.artifact));
      }
    } catch (e) {
      setFallo(e instanceof ArtifactDownloadError ? { what: t(`artifacts.download.${e.reason}`), detail: nombre } : asFailure(e));
    } finally {
      setOcupado(false);
    }
  }

  async function ver(v: VersionRef | null) {
    setFallo(null);
    if (!v) {
      setMostrado(actual());
      setViendo(null);
      setGen((g) => g + 1);
      return;
    }
    try {
      const txt = await leerVersion(v, enSuMaquina());
      setMostrado(txt);
      setViendo(v);
      setGen((g) => g + 1);
    } catch (e) {
      setFallo({ what: t("artifacts.version.open_failed"), detail: detalleDe(e) });
    }
  }

  async function restaurar() {
    const v = viendo();
    if (!v) return;
    setOcupado(true);
    try {
      const h = await restaurarVersion(v, enSuMaquina());
      setHistoria(h);
      setActual(mostrado());
      setViendo(null);
      setGen((g) => g + 1);
      setFallo(null);
    } catch (e) {
      setFallo({
        what: t("artifacts.version.restore_failed"),
        detail: detalleDe(e),
      });
    } finally {
      setOcupado(false);
    }
  }

  const esHtml = () => props.preview?.kind === "html" && mostrado() !== null;
  /** Solo `.md`: pintar un `.json` o un `.log` como Markdown lo deforma. */
  const esMarkdown = () =>
    props.preview?.kind === "text" && extDescarga(props.preview.rel) === ".md";
  /** No se puede pintar aquí dentro: un `.docx`, un `.xlsx`, un PDF, o un
      texto que no cabía. La app no lo enseña: lo entrega. */
  const esOpaco = () => props.preview?.kind === "binary";
  const forma = () => (esHtml() ? formaDe(mostrado()!) : null);

  const esWeb = () => forma() === "web";
  const enUnaAnterior = () => viendo() !== null;

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
                    <ZoomableImage src={source()} alt={p().rel} />
                  </div>
                )}
              </Show>
              <Show when={p().kind === "pdf" && p().pdf}>
                {(data) => (
                  <div class="min-h-0 flex-1 rounded-md border border-border bg-surface-muted">
                    <PdfDocument base64={data()} name={p().rel} />
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
                    <DelimitedTable text={mostrado() ?? p().text!} delim={d()} />
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
