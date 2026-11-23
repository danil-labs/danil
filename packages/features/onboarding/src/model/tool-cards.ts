import { t } from "../../../../../apps/desktop/src/lib/i18n";

export const nombreDeArchivo = (ruta: string) => ruta.split(/[\\/]/).pop() || ruta;
export const falloDeInstalacion = (clave: string | null | undefined, porOmision = "onboarding.tools.drive_app.install_failed") => {
  const texto = clave ? t(clave) : "";
  return texto && texto !== clave ? texto : t(porOmision);
};
export const SIN_USAR_DRIVE = "onboarding.drive-desktop-unused";
export const CADA_CUANTO_SESION = 2500;

/** Cómo se conecta cada integración: servicios de código, un servicio MCP conocido o Drive con su CLI. */
export type Integracion = {
  id: string;
  nombre: string;
  comun: boolean;
  via: "proveedor" | "mcp" | "incluido" | "drive" | "referencias";
};
export type EstadoDeIntegracion =
  | { k: "libre" }
  | { k: "formulario" }
  | { k: "descargando"; hecho: number; total: number | null }
  | { k: "instalando" }
  | { k: "sesion" }
  | { k: "conectando"; codigo?: string }
  | { k: "conectada"; detalle: string }
  | { k: "detectada"; detalle: string }
  | { k: "abriendo" }
  | { k: "permiso" }
  | { k: "saliendo" };
export type Borrador = { data: Record<string, string>; token: string };

export const INTEGRACIONES = (): Integracion[] => [
  { id: "github", nombre: "GitHub", comun: true, via: "proveedor" },
  { id: "drive", nombre: t("onboarding.tools.drive"), comun: true, via: "drive" },
  { id: "figma", nombre: "Figma", comun: true, via: "mcp" },
  { id: "atlassian", nombre: t("onboarding.tools.atlassian"), comun: true, via: "mcp" },
  { id: "bitbucket", nombre: "Bitbucket", comun: false, via: "proveedor" },
  { id: "excalidraw", nombre: "Excalidraw", comun: false, via: "incluido" },
  { id: "notion", nombre: "Notion", comun: false, via: "mcp" },
  { id: "zotero", nombre: "Zotero", comun: false, via: "referencias" },
];
export const RECOMENDADOS = ["drawio", "typst", "libreoffice"];
export const ORDEN_PLUGINS = ["drawio", "typst", "libreoffice", "computer-use"];
export const CON_PESO = new Set(["drawio", "typst", "libreoffice", "computer-use"]);
export const descripcion = (id: string) => t(`onboarding.tools.about.${id}`);
export const SIN_BORRADOR: Borrador = { data: {}, token: "" };

export type IntegracionesProps = { onCambio: (conectadas: number) => void; solo?: string[] };
