import { lazy, type JSX } from "solid-js";
import type { Visores } from "../../features/code/src/screens/FileViewer";
import MaterialPicker from "../../features/settings/src/components/MaterialPicker";

const PdfDocument = lazy(() => import("../../features/viewers/src/screens/Pdf"));
const ZoomableImage = lazy(() => import("../../features/viewers/src/screens/ImageViewer"));
const DelimitedTable = lazy(() => import("../../features/viewers/src/screens/CsvTable"));
const Reproductor = lazy(() => import("../../features/viewers/src/screens/Media"));

/** Los visores que el árbol de código ya no importa: los monta el shell. */
export const visoresDeCodigo: Visores = {
  pdf: (props) => <PdfDocument base64={props.base64} name={props.name} />,
  imagen: (props) => <ZoomableImage src={props.src} alt={props.alt} />,
  tabla: (props) => <DelimitedTable text={props.text} delim={props.delim} />,
  medio: (props) => <Reproductor ruta={props.ruta} tipo={props.tipo} leer={props.leer} />,
};

/** El selector de fuente de un proyecto. Lo monta el shell, no la vista. */
export function materialDeProyecto(props: {
  onCancelar: () => void;
  onListo: (source: string) => Promise<void> | void;
}): JSX.Element {
  return <MaterialPicker onCancelar={props.onCancelar} onListo={props.onListo} />;
}
