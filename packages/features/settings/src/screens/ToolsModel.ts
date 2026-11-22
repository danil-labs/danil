import { lazy } from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { type Frase } from "../../../../../apps/desktop/src/lib/prose";
import { maskServerSource } from "../../../../../apps/desktop/src/lib/secretScan";

// Fuera de la carga inicial: este archivo también da el vistazo del riel.
export const CredentialsInUse = lazy(() => import("../components/AccountCredentials").then((m) => ({ default: m.CredentialsInUse })));

export const LocalKeysBanner = lazy(() => import("../components/AccountCredentials").then((m) => ({ default: m.LocalKeysBanner })));

/**
 * Conectar una herramienta al agente: Figma, Jira, Confluence.
 *
 * Un botón, no un JSON: pedir copiar el bloque `mcpServers` de una página de
 * documentación es pedirle a quien opera el negocio que programe. Lo
 * conectable sale de `mcp::CONOCIDOS`, tabla del backend.
 *
 * Conectar no es autenticar: pulsar declara el servidor, y la sesión la pide
 * el propio agente la primera vez que usa la herramienta. La app no limita lo
 * que la herramienta puede hacer — motivo entero en `runtime/mcp.rs`.
 *
 * Reglas de la pantalla:
 *
 * - Un chip por fila es el estado entero (`estado`); lo que no puede decir va
 *   debajo, no en prosa que repita el chip.
 * - Tarjeta con la forma de `Fuente`: nombre, chip y acción a la derecha,
 *   detalle debajo en gris. Misma fila que Contexto principal.
 * - Conectar va `secondary`, no `primary`: no es una acción del agente.
 * - Un servicio por tarjeta, no un camino por tarjeta: `connect_known_mcp`
 *   borra a los hermanos del grupo. Con dos puestos el agente abre las dos
 *   conexiones en cada turno, y la que no escucha mata el turno entero.
 * - Lo apagado no es lo más llamativo: la advertencia del local que no
 *   responde va en ámbar solo cuando está conectado, cuando el daño ocurre.
 */

export type Conocido = {
  id: string;
  /** El servicio al que pertenece. Dos entradas del mismo grupo son dos formas
   *  de llegar a lo mismo, no dos servicios. */
  grupo: string;
  /** Con qué nombre queda declarado en `mcp.json`. Es la misma clave que trae
   *  `Puesto.name`, y es lo que separa «un conocido» de «pegado a mano» sin
   *  mantener esa lista dos veces — ver `aMano`. */
  clave: string;
  /** El servicio. Lo comparten las filas del mismo grupo: es el mismo Figma. */
  name: string;
  /**
   * Por qué camino se llega. `null` cuando el servicio tiene uno solo. Los
   * tres son claves, no frases: las elige `mcp::CONOCIDOS` y las traduce
   * quien pinta (`lib/prose.ts`).
   */
  via: Frase | null;
  requiere: Frase | null;
  despues: Frase;
  /** Si el servidor exige iniciar sesión. Sin ella no se ofrece ningún inicio. */
  pide_sesion: boolean;
  conectado: boolean;
  /** Solo los locales: si hay algo escuchando. Ausente = no aplica. */
  escuchando?: boolean;
  /** Qué agentes ya tienen sesión con este servidor. Ver `mcp::sesiones_con`. */
  sesiones?: string[];
};

/**
 * Un servidor ya declarado. `detalle` es dato de máquina —la URL o el comando
 * de donde sale— y no pasa por el catálogo. Vacío es que el bloque no lo
 * declara; el backend manda el dato, no la prosa.
 */
export type Puesto = { name: string; detalle: string; managed?: boolean };

/** Solo no pintarlo: el motor ya mandó la URL o el comando enteros, y el arreglo es que mande `origen()`. */
export const sinSecretos = (lista: Puesto[]): Puesto[] => lista.map((p) => ({ ...p, detalle: maskServerSource(p.detalle ?? "") }));

/** Un agente y si de verdad recibe lo que se conecta aquí. */
export type AgenteMcp = {
  id: string;
  label: string;
  recibe: boolean;
  /** Si su CLI está en esta computadora. Distinto de `recibe`. */
  instalado: boolean;
  falta?: string;
  /** Si este CLI necesita un inicio de sesión aparte por servidor. */
  login?: boolean;
  /** Cuando no lo tiene, qué clase de «no». Ver `agents::SesionMcp`. */
  sin_login?: Frase;
};

/**
 * Los remotos con cuenta los autoriza el motor, una vez para todos los agentes
 * (`mcp_oauth`): una sola sesión, sin filas por agente. Solo los locales traen
 * `escuchando`.
 */
export const autorizaElMotor = (c: Conocido) => c.pide_sesion && c.escuchando === undefined;

/** La clave de `enCurso` del inicio de sesión del motor, que no es de ningún agente. */
export const MOTOR = "motor";

/**
 * El estado de un servidor en una palabra y un color, para ver de un vistazo.
 * Las clases son las del sistema —`tag`, `tag puesto`, `tag pendiente`, `tag
 * repo`, `tag falta`—: verde significa lo mismo aquí que en Proveedores.
 *
 * `conectado` y `listo` son dos cosas, y el chip las separa: es la distinción
 * que `runtime/mcp.rs` defiende en su enum `Salud` — declararlo hace el botón, y
 * contestar el saludo de MCP dice «Probar conexión». Pintar de verde lo
 * declarado afirmaría algo que solo sabe la capa de abajo.
 *
 * Cinco estados y cinco aspectos, para no obligar a leer la palabra: sin
 * conectar es gris hueco, conectado es gris relleno (los dos son «no hay nada
 * que hacer», y se separan con el tono `active` de `Badge` — ámbar en
 * conectado le pondría cara de problema al camino feliz); pide sesión es
 * ámbar («te toca algo»); listo es verde (comprobado y funcionando); no
 * responde es rojo, el único que es un fallo real — un servidor local muerto
 * rompe todos los turnos, no solo los suyos.
 */
export function estado(
  c: Conocido,
  salud: string | undefined,
): { texto: string; tono: "neutral" | "active" | "success" | "warning" | "danger" } {
  if (!c.conectado)
    return { texto: t("settings.tools.state.disconnected"), tono: "neutral" };
  // Antes que el saludo: un local con la app cerrada no responde por un motivo
  // que la persona puede arreglar, y decirlo así lleva a la acción correcta.
  if (c.escuchando === false)
    return { texto: t("settings.tools.state.silent"), tono: "danger" };
  if (autorizaElMotor(c)) {
    if ((c.sesiones ?? []).length === 0)
      return { texto: t("settings.tools.state.needs_login"), tono: "warning" };
    if (salud && salud !== "listo" && salud !== "pide-sesion")
      return { texto: t("settings.tools.state.silent"), tono: "danger" };
    return { texto: t("settings.tools.state.connected"), tono: "success" };
  }
  if (salud === "listo")
    return { texto: t("settings.tools.state.ready"), tono: "success" };
  // «Pide sesión» lo pregunta la app, que no tiene credencial: un servidor de
  // OAuth contesta 401 siempre. Ese chip no podía ponerse verde ni después de
  // autorizar — decía la verdad del servidor y mentía sobre la persona.
  //
  // Con alguien ya autenticado, el chip dice que el servicio está listo para
  // trabajar, que es la pregunta que se hace quien lo mira. Quién falta por
  // autenticarse lo dice la fila de cada agente.
  if (salud === "pide-sesion")
    return (c.sesiones ?? []).length > 0
      ? { texto: t("settings.tools.state.ready"), tono: "success" }
      : { texto: t("settings.tools.state.needs_login"), tono: "warning" };
  if (salud) return { texto: t("settings.tools.state.silent"), tono: "danger" };
  return { texto: t("settings.tools.state.connected"), tono: "active" };
}
