import { createSignal } from "solid-js";
import { delimiterFor } from "../../../../ui/src/lib/csv";
import {
  ampliadaDe,
  ampliarVista,
  conVistaTypst,
  conVistaExportada,
  esTypst,
  seguirPluginTypst,
} from "../queries/typst";
import { llevaVistaTypst } from "../model/typstScope";
import { type VisorProps, type Disposicion, recordarDisposicion, disposicionRecordada, disposicionTypstRecordada, esMarkdown, esHtml } from "./file-viewer-model";
import { type EstadoDelVisor } from "./file-viewer-state";

export function createDisposicionDelVisor(props: VisorProps, deps: EstadoDelVisor) {
  const {
    previa, deCodigo, esTexto,
  } = deps;
  seguirPluginTypst();
  const typst = () => esTypst(props.ruta) && !previa();
  /**
   * Un `.typ` se ve junto al PDF de su documento: el principal del ojo o, sin él, el `main.typ`
   * más cercano. Otro archivo abierto en la misma pestaña usa su propia previa o se queda en código.
   */
  const vistaTypst = () => conVistaTypst() && !previa() && llevaVistaTypst(props.ruta);
  /** El tiempo real, las marcas y el guardado solo: un `.typ` con la vista encendida. */
  const typstVivo = () => typst() && vistaTypst();
  /** Sin Tinymist en la ventana: el PDF exportado en la máquina, que se pone al día con cada guardado. */
  const typstExportado = () => typst() && !vistaTypst() && conVistaExportada();
  /** Lo que se escribe se guarda solo: la vista de al lado lee el disco. */
  const guardaSolo = () => typstVivo() || typstExportado();
  const conPrevia = () =>
    vistaTypst() ||
    typstExportado() ||
    (esTexto() && !typst() && (esMarkdown(props.ruta) || esHtml(props.ruta) || delimiterFor(props.ruta) !== null));
  // The diff covers the code side, so a tab opened for its changes starts there whatever layout is remembered.
  const [elegida, setElegida] = createSignal<Disposicion | null>(props.enCambios ? "codigo" : null);
  const disposicion = (): Disposicion => {
    if (!conPrevia()) return "codigo";
    // Con Typst, «Vista previa» es el ampliar de la tarea: lo comparten sus archivos y Esc lo deshace.
    if (vistaTypst()) {
      if (ampliadaDe(props.session, props.arbol)) return "previa";
      const d = elegida() ?? disposicionTypstRecordada();
      return d === "previa" ? "lado" : d;
    }
    if (typstExportado()) return elegida() ?? disposicionTypstRecordada();
    return elegida() ?? (deCodigo() === false ? "previa" : disposicionRecordada());
  };
  const ladoCodigo = () => disposicion() !== "previa";
  const ladoPrevia = () => disposicion() !== "codigo";
  function fijar(d: Disposicion) {
    setElegida(d);
    if (vistaTypst()) ampliarVista(props.session, props.arbol, d === "previa");
  }
  function elegir(d: Disposicion) {
    fijar(d);
    // Lo que se elige en una carpeta documental no cambia cómo abren los archivos de código.
    if (deCodigo() !== false) recordarDisposicion(d);
  }

  return {
    typst, vistaTypst, typstVivo, typstExportado, guardaSolo, conPrevia, disposicion, ladoCodigo, ladoPrevia,
    fijar, elegir,
  };
}

export type DisposicionDelVisor = ReturnType<typeof createDisposicionDelVisor>;
