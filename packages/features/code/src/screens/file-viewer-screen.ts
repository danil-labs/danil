import { type VisorProps } from "./file-viewer-model";
import { createEstadoDelVisor } from "./file-viewer-state";
import { createDisposicionDelVisor } from "./file-viewer-layout";
import { createMarcasDelVisor } from "./file-viewer-marks";
import { createLecturaDelVisor } from "./file-viewer-io";
import { createTypstDelVisor } from "./file-viewer-typst";
import { vistaDelVisor } from "./file-viewer-view";

/** Un archivo de un árbol de la tarea: junta el estado, la disposición, la lectura y Typst, y los pinta. */
export default function VisorDeArchivo(props: VisorProps) {
  const estado = createEstadoDelVisor(props);
  const disposicion = createDisposicionDelVisor(props, estado);
  const marcas = createMarcasDelVisor(props, { ...estado, ...disposicion });
  const lectura = createLecturaDelVisor(props, { ...estado, ...disposicion, ...marcas });
  const vivo = createTypstDelVisor(props, { ...estado, ...disposicion, ...lectura });
  return vistaDelVisor(props, { ...estado, ...disposicion, ...marcas, ...lectura, ...vivo });
}
