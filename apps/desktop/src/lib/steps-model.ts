import { bareCommand, classify, fileName, type StepKind } from "../../../../packages/ui/src/lib/chat/steps.ts";
import { toolSource, type ToolSource } from "../../../../packages/ui/src/lib/chat/tools.ts";

/** Qué clase de acto fue. Decide el verbo y el ícono de la fila. */
export type Clase =
  | "leer"
  | "buscar"
  | "editar"
  | "ejecutar"
  | "web"
  | "plan"
  | "otro"
  /* Los tres que no son herramientas: el turno hablando de sí mismo. */
  | "aviso"
  | "gasto"
  | "fin"
  /**
   * Lo que una persona autorizó o negó dentro del turno.
   *
   * **Es una fila y no una tarjeta, y eso arregla dos cosas a la vez.** Vivía
   * como un bloque aparte en la transcripción, así que además de pesar más que
   * el acto que describe **partía la tira de pasos en dos**: lo de antes de la
   * decisión se quedaba suelto y lo de después caía dentro de «Trabajó durante
   * …», sin que nada explicara la diferencia. Como paso, la decisión va donde
   * ocurrió y el turno se lee entero.
   */
  | "permiso";

/** El cuerpo de un paso, tal como lo manda `runtime/chat/`. */
export type Detalle =
  | {
      kind: "output";
      text: string;
      exit_code: number | null;
      truncated: boolean;
      /** La carpeta desde la que la persona lanzó este comando. */
      cwd?: string;
      /** Resultados visuales del comando; se entregan fuera del registro al cerrar. */
      images?: string[];
    }
  | { kind: "edit"; before: string | null; after: string };

export type Paso = {
  /** Con qué evento empareja el cierre. Lo pone el agente. */
  id?: string;
  clase: Clase;
  /** Cómo la nombró el agente: `Read`, `command_execution`. Dato de máquina. */
  nombre: string;
  /** Sobre qué actuó: la ruta, el comando, el patrón. */
  objetivo: string | null;
  detalle: Detalle | null;
  mcpApp?: {
    server: string;
    tool: string;
    arguments?: Record<string, unknown> | null;
    result?: Record<string, unknown> | null;
  };
  /** Todavía corriendo: la llamada salió y el resultado no ha vuelto. */
  corriendo: boolean;
  /** `false` si la herramienta falló. `null` mientras no se sepa. */
  ok: boolean | null;
  /**
   * Qué se decidió, **solo en `permiso`**. Va aparte de `ok` a propósito: negar
   * no es fallar. `ok === false` pinta la fila de rojo y le cuelga «falló», y
   * una denegación es una decisión que se tomó bien.
   */
  permitido?: boolean;
  /** Solo en `permiso`: la tarea que decidió, cuando no fue la persona. */
  decidio?: string;
};

/**
 * De qué servicio salió un paso: el servidor MCP ya separado, su marca y el
 * nombre que se lee. Un paso local —leer, correr, buscar— no tiene dueño y
 * devuelve `null`: nadie le presta la herramienta.
 */
export type Origen = ToolSource;

export const origenDe = (paso: Paso): Origen | null =>
  toolSource(paso.nombre, paso.mcpApp);

/**
 * El origen de una fila, si lo tiene. Una fila agrupada no lleva marca: `agrupar`
 * nunca junta pasos con `mcpApp`, y dos servidores distintos en un renglón
 * afirmarían un dueño que no es.
 */
export const origenDeFila = (fila: { pasos: Paso[] }): Origen | null =>
  fila.pasos.length === 1 ? origenDe(fila.pasos[0]) : null;

export const CLASE: Record<StepKind, Clase> = { read: "leer", search: "buscar", edit: "editar", run: "ejecutar", web: "web", plan: "plan", other: "otro" };

/** De qué clase es una herramienta; la tabla es la misma en todos los clientes. */
export const clasificar = (nombre: string): Clase => CLASE[classify(nombre)];

/** Un paso recién abierto. Es la puerta por la que entra todo. */
export function pasoDe(
  nombre: string,
  objetivo: string | null = null,
  extra: Partial<Paso> = {},
): Paso {
  return {
    clase: clasificar(nombre),
    nombre,
    objetivo,
    detalle: null,
    corriendo: false,
    ok: null,
    ...extra,
  };
}

/** Lo que la persona, o la tarea que lanzó a esta, autorizó o negó. */
export function pasoDePermiso(
  herramienta: string,
  objetivo: string | null,
  permitido: boolean,
  decidio?: string,
): Paso {
  return {
    clase: "permiso",
    nombre: herramienta,
    objetivo,
    detalle: null,
    corriendo: false,
    ok: null,
    permitido,
    decidio,
  };
}

/** Una línea del turno que no es una herramienta: un aviso, el gasto, el cierre. */
export function pasoDeSistema(clase: Clase, texto: string): Paso {
  return { clase, nombre: clase, objetivo: texto, detalle: null, corriendo: false, ok: null };
}

export const nombreDe = fileName;

/**
 * La extensión, sin punto y tal como viene, o vacía si el nombre no la trae.
 * Un nombre que empieza por punto no es una extensión. Cada pantalla decide su
 * caja y su respaldo («Archivo», «.md»…): eso es texto de interfaz, no dato.
 */
export function extensionDe(ruta: string) {
  const n = nombreDe(ruta);
  const i = n.lastIndexOf(".");
  return i > 0 ? n.slice(i + 1) : "";
}

/**
 * Se quita al pintar, no al guardar: el rastro es lo que el gate aprueba, y ahí
 * el comando tiene que ser el que se ejecutó de verdad.
 */
export const comando = bareCommand;
