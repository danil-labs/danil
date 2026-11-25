import { t } from "../../../../ui/src/lib/i18n";
import { callEngine } from "../../../../engine-client/src/client.ts";
import { detalleDe, prosaDe } from "../../../../ui/src/Failure";
import { canonicalAgentId, OPENCODE } from "../../../../ui/src/lib/tasks/agents.ts";

/** Los que se conectan con una clave pegada en su panel, como en el diseño: dónde se crea y cómo se ve. */
export const CLAVES: Record<string, { url: string; placeholder: string }> = {
  grok: { url: "https://console.x.ai", placeholder: "xai-…" },
};
const CANCELADA = "install.cancelled";
export const fueCancelada = (e: unknown) => `${prosaDe(e)} ${detalleDe(e)} ${String((e as { code?: string })?.code ?? "")}`.includes(CANCELADA);

/** Cómo se conecta: iniciando sesión con su CLI, pegando una clave o aceptando el aviso del Free Router. */
export type Modo = "sesion" | "clave" | "consentimiento";

export type Fila = {
  id: string;
  agente: string;
  label: string;
  modo: Modo;
  /** El binario ya estaba en el sistema al abrir la pantalla; no cambia al conectarse. */
  detectada: boolean;
  /** Lo que baja si falta; `null` cuando ya está o no se sabe. */
  bytes: number | null;
  /** Dónde se consigue la clave, para el modo `clave`. */
  urlDeClave: string | null;
  /** El ejemplo del campo de la clave. */
  placeholder: string;
};

export type Paso =
  | { k: "falta" }
  | { k: "externa" }
  | { k: "sesion"; identidad: string }
  | { k: "instalada" }
  | { k: "descargando"; hecho: number; total: number }
  | { k: "entrando"; cuenta: string; url?: string; aviso?: string | null; codigo?: string; pideCodigo?: boolean; enviandoCodigo?: boolean; codigoEnviado?: boolean; errorCodigo?: string | null }
  | { k: "clave" }
  | { k: "comprobando" }
  | { k: "conectada"; cuenta: string; id: string | null }
  | { k: "saliendo" }
  /** La sesión se guardó y falta el alta del proveedor; `url` es la página que la completa. */
  | { k: "alta"; cuenta: string; url: string | null; revisando?: boolean };

export const EN_CURSO = new Set<Paso["k"]>(["descargando", "entrando", "clave", "comprobando", "saliendo", "alta"]);
const ORDEN = ["claude", "codex", "antigravity", "grok", OPENCODE];
/** ZCode va siempre al final, aunque esté en la computadora o el motor traiga proveedores nuevos. */
export const AL_FINAL = "zcode";

export const openExternal = (target: string) =>
  callEngine("open_external", { target });
export const posicion = (id: string) => {
  if (id === AL_FINAL) return ORDEN.length + 1;
  const i = ORDEN.indexOf(id);
  return i < 0 ? ORDEN.length : i;
};

/** El mapa pone los gratuitos entre Grok y OpenCode; el panel los deja debajo de OpenCode. */
export const ordenDelMapa = (filas: Fila[]) =>
  [...filas].sort((a, b) => rangoEnMapa(a) - rangoEnMapa(b));
const rangoEnMapa = (f: Fila) => (f.modo === "consentimiento" ? posicion(OPENCODE) - 0.5 : posicion(canonicalAgentId(f.agente)));

const SIN_LLAVERO = /secret service|org\.freedesktop\.secrets|secret-service|no keyring|keyring/i;

/** El error en palabras de quien usa la app: la falta de llavero se explica en vez de copiarse en crudo. */
export function explicar(e: unknown) {
  const texto = prosaDe(e);
  return SIN_LLAVERO.test(`${texto} ${detalleDe(e)}`) ? t("onboarding.ai.error.keyring") : texto;
}

/** El nombre de la fila; la de OpenCode con clave incluye Go. */
export function nombreDeFila(f: Fila) {
  if (f.modo === "consentimiento") return t("surfaces.label.free");
  if (f.agente === "antigravity" && f.modo === "sesion") return t("onboarding.ai.antigravity");
  if (f.agente.startsWith("opencode") && (f.modo === "clave" || f.modo === "sesion")) return "OpenCode";
  return f.label;
}
