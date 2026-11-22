import { save } from "@tauri-apps/plugin-dialog";
import { join, tempDir } from "@tauri-apps/api/path";
import { envolver, formaDe } from "../model/sandbox";
import { descargarArtefacto, historiaDe, leerVersion, openExternal, preparePrint, publicacionesDe, readArtifactPart, registrarSalida, restaurarVersion, type Preview, type Via, type VersionRef } from "../queries";
import { asFailure, detalleDe } from "../../../../ui/src/Failure";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { ArtifactDownloadError, readArtifactDownload } from "../model/download.ts";
import { extensionDe } from "../../../../../apps/desktop/src/lib/steps";
import type PreviewPane from "./Preview";
import type { createPreviewState } from "./PreviewState";

/**
 * La extensión con la que se baja el artefacto, para nombrarla en el menú.
 * Vacío cuando no tiene: un nombre sin punto no es una extensión, y `split(".")`
 * devolvería el nombre entero.
 */
const extDescarga = (rel: string) => {
  const e = extensionDe(rel);
  return e ? `.${e.toLowerCase()}` : "";
};

export function createPreviewActions(props: Parameters<typeof PreviewPane>[0], estado: ReturnType<typeof createPreviewState>) {
  const { mostrado, setFallo, remota, historia, viendo, enSuMaquina, setPublicaciones, setSalida, setOcupado, setHistoria, setMostrado, actual, setViendo, setGen, setActual } = estado;
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
      const destino = await preparePrint(
        path,
        envolver(html, { impresion: true }),
      );
      await openExternal(destino);
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
      await openExternal(ruta);
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
        part: (referencia, offset, size) => readArtifactPart(referencia, offset, size, machine),
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
  return {
    esWeb, forma, ver, esMarkdown, enUnaAnterior, restaurar, descargar, esHtml, imprimir, esOpaco,
    abrirAfuera,
  };
}
