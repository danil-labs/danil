import { createSignal, type Setter } from "solid-js";
import { treeTypstExport, openTreeExternal } from "../queries";
import { machineOf } from "../../../../host/src/machine";
import { asFailure, type Failure } from "../../../../ui/src/Failure";
import { type ExportacionTypst, principalElegido } from "../queries/typst";

/** Exportar el PDF del principal y abrirlo fuera: lo que pinta la barra de `VistaPreviaTypst`. */
export type ExportacionTypstDeps = {
  props: { project: string; session: string; arbol: string; ruta: string };
  setFallo: Setter<Failure | null>;
};

export function createExportacionTypst(deps: ExportacionTypstDeps) {
  const { props, setFallo } = deps;
  const [exportando, setExportando] = createSignal(false);
  const [exportado, setExportado] = createSignal<ExportacionTypst | null>(null);

  async function exportar() {
    setExportando(true);
    setExportado(null);
    setFallo(null);
    try {
      setExportado(
        await treeTypstExport({
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
    void openTreeExternal({
      project: props.project,
      session: props.session,
      tree: props.arbol,
      path: pdf,
    }).catch((e) => setFallo(asFailure(e)));
  }

  return { exportando, exportado, setExportado, exportar, abrirFuera };
}
