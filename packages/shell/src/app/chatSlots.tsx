import { lazy } from "solid-js";
import type { HandlerStatus } from "../../../../apps/desktop/src/lib/model";
import WorkdirIcon from "../../../ui/src/WorkdirIcon";
import { AstroAvatar } from "../../../features/projects/src/screens/AstroAvatar";
import { createFreeRouterConsent } from "../../../features/settings/src/components/free-router-consent";

/** Baja al abrirse: `pdfjs-dist` no entra en el arranque de la ventana. */
const PdfDocument = lazy(() => import("../../../features/viewers/src/screens/Pdf"));
const ZoomableImage = lazy(() => import("../../../features/viewers/src/screens/ImageViewer"));
const DelimitedTable = lazy(() => import("../../../features/viewers/src/screens/CsvTable"));

export { createFreeRouterConsent };

export function renderAvatar(props: {
  name: string;
  status: HandlerStatus;
  body?: string | null;
  avatar?: string | null;
  size?: number;
  class?: string;
}) {
  return <AstroAvatar name={props.name} status={props.status} body={props.body} avatar={props.avatar} size={props.size} class={props.class} />;
}

export function renderPdf(props: { base64: string; name: string }) {
  return <PdfDocument base64={props.base64} name={props.name} />;
}

export function renderImage(props: { src: string; alt: string }) {
  return <ZoomableImage src={props.src} alt={props.alt} />;
}

export function renderTable(props: { text: string; delim: string }) {
  return <DelimitedTable text={props.text} delim={props.delim} />;
}

export function folderIcon(project: { kind: string; cloud?: string | null }) {
  return <WorkdirIcon kind={project.kind} cloud={project.cloud} size={14} />;
}
