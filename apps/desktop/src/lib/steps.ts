/**
 * Lo que el agente hizo, como filas legibles.
 *
 * **La transcripción es el objeto que el gate aprueba.** Una conversación que no
 * deja ver qué leyó y qué cambió el agente no se puede revisar, así que cada
 * herramienta que usó es una fila con nombre propio: qué hizo y sobre qué.
 *
 * Este archivo es el modelo —clasificar, nombrar, agrupar— y no pinta nada.
 * Separarlo del componente es lo que permite que el mismo dato entre por dos
 * puertas: en vivo desde los eventos del turno, y al reabrir una sesión desde el
 * rastro que se guardó (#58). Las dos llaman a `pasoDe`.
 *
 * **Los verbos salen del catálogo; los nombres de herramienta no.** `Read`,
 * `command_execution` y `file_change` son como los llama el agente —dato de
 * máquina, y por eso van en mono al lado del verbo—: traducirlos rompería el
 * emparejamiento con lo que manda `runtime/chat/`.
 */
import { bareCommand, classify, fileName, joinableKind, joinSteps, stepCounts, type CountedStep, type StepCount, type StepKind } from "@terminus/chat/steps";
import { commandSummary } from "@terminus/chat/command";
import { readableToolName, toolSource, type ToolSource } from "@terminus/chat/tools";
import { manifiesto, t } from "./i18n.ts";

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

const CLASE: Record<StepKind, Clase> = { read: "leer", search: "buscar", edit: "editar", run: "ejecutar", web: "web", plan: "plan", other: "otro" };

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

/**
 * Una fila de la línea de tiempo: uno o varios pasos que se leen como un acto.
 *
 * Doce lecturas seguidas son «Leyó 12 archivos», no doce renglones — es lo que
 * hace que un turno con diez herramientas ocupe menos que la respuesta. Un
 * comando **no** se junta con el de al lado: cada uno trae su propia salida, y
 * una fila con dos cuerpos no es una fila.
 */
export type Fila = { clase: Clase; pasos: Paso[] };

/** El nombre neutro de cada clase; las que no son actos del agente no se cuentan. */
const NEUTRA: Partial<Record<Clase, CountedStep["kind"]>> = { leer: "read", buscar: "search", editar: "edit", ejecutar: "run", web: "web", plan: "plan", otro: "other", permiso: "permission" };

export function agrupar(pasos: Paso[]): Fila[] {
  return joinSteps(
    pasos,
    (p) => p.clase,
    (clase, p, fila) => {
      const neutra = NEUTRA[clase];
      return neutra !== undefined && joinableKind(neutra) && p.detalle === null && !p.mcpApp && fila.every((q) => q.detalle === null);
    },
  ).map(({ kind, steps }) => ({ clase: kind, pasos: steps }));
}

/**
 * La cabecera de un tramo de trabajo: cuántos actos de cada clase, en prosa.
 * `null` si el tramo no tiene ninguno que contar — solo avisos, gasto o cierre.
 */
export function cuentaDelTramo(pasos: Paso[], vivo = false): string | null {
  const partes = partesDelTramo(pasos, vivo);
  return partes.length === 0 ? null : partes.map((p) => p.texto).join(t("common.steps.summary.separator"));
}

/**
 * La misma cabecera en trozos, con la clase de cada uno: el chat hace de
 * «Editó N archivos» un botón que abre los cambios en el panel de la tarea.
 * Ya va con mayúscula inicial; se une con `common.steps.summary.separator`.
 */
export function partesDelTramo(pasos: Paso[], vivo = false): { clase: Clase; texto: string }[] {
  const cuentas = stepCounts(
    pasos.flatMap((p) => {
      const kind = NEUTRA[p.clase];
      return kind ? [{ kind, target: p.objetivo, allowed: p.permitido }] : [];
    }),
  );
  const partes = cuentas.map(({ kind, count }) => ({ clase: claseDeCuenta(kind), texto: fraseDeCuenta(kind, count, vivo) }));
  if (partes[0]) partes[0].texto = partes[0].texto.charAt(0).toLocaleUpperCase(manifiesto().formato) + partes[0].texto.slice(1);
  return partes;
}

const claseDeCuenta = (kind: StepCount["kind"]): Clase => (kind === "allowed" || kind === "denied" ? "permiso" : CLASE[kind]);

function fraseDeCuenta(kind: StepCount["kind"], count: number, vivo: boolean) {
  switch (kind) {
    case "read":
      return vivo ? t("common.steps.summary_live.read", { count }) : t("common.steps.summary.read", { count });
    case "search":
      return vivo ? t("common.steps.summary_live.search", { count }) : t("common.steps.summary.search", { count });
    case "edit":
      return vivo ? t("common.steps.summary_live.edit", { count }) : t("common.steps.summary.edit", { count });
    case "run":
      return vivo ? t("common.steps.summary_live.run", { count }) : t("common.steps.summary.run", { count });
    case "web":
      return vivo ? t("common.steps.summary_live.web", { count }) : t("common.steps.summary.web", { count });
    case "plan":
      return vivo ? t("common.steps.summary_live.plan", { count }) : t("common.steps.summary.plan", { count });
    case "other":
      return vivo ? t("common.steps.summary_live.other", { count }) : t("common.steps.summary.other", { count });
    case "allowed":
      return t("common.steps.summary.allowed", { count });
    default:
      return t("common.steps.summary.denied", { count });
  }
}

/** Tres ediciones al mismo archivo son un archivo que revisar, no tres. */
function archivosDistintos(pasos: Paso[]) {
  return new Set(pasos.map((p, i) => p.objetivo ?? `#${i}`)).size;
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

/** Lo que dice una fila: verbo, sujeto y, cuando la herramienta es de un MCP, su dueño. */
export type Rotulo = { verbo: string; sujeto: string | null; origen?: Origen };

/**
 * La cabecera de una fila: el verbo en prosa y el sujeto como dato de máquina.
 *
 * Van separados porque son dos cosas distintas y el sistema visual las distingue: el
 * verbo se lee, el sujeto es una ruta o un comando y va en mono. «Leyó» +
 * `Chat.tsx`, no «tool_use».
 *
 * **Un MCP lleva además su dueño.** «Usó create issue» no dice quién lo prestó;
 * con el servicio delante —«GitHub · Usó create issue»— la fila deja de ser un
 * identificador. El nombre de la tool se lee tal como lo publicó el servidor,
 * sin guiones bajos y sin traducir: traducirlo inventaría un verbo.
 */
export function resumen(fila: Fila): Rotulo {
  const n = fila.pasos.length;
  const [uno] = fila.pasos;
  const objetivo = uno.objetivo;

  switch (fila.clase) {
    case "leer":
      return n === 1
        ? { verbo: t("common.steps.read.one"), sujeto: objetivo && nombreDe(objetivo) }
        : { verbo: t("common.steps.read.many", { count: n }), sujeto: null };
    case "buscar":
      return n === 1
        ? { verbo: t("common.steps.search.one"), sujeto: objetivo }
        : { verbo: t("common.steps.search.many", { count: n }), sujeto: null };
    case "editar":
      return n === 1
        ? { verbo: verboDeEdicion(uno.nombre), sujeto: objetivo && nombreDe(objetivo) }
        : { verbo: t("common.steps.edit.many", { count: archivosDistintos(fila.pasos) }), sujeto: null };
    case "ejecutar":
      return {
        verbo: t("common.steps.run"),
        sujeto: objetivo && commandSummary(objetivo),
      };
    case "web":
      return n === 1
        ? { verbo: t("common.steps.web.one"), sujeto: objetivo }
        : { verbo: t("common.steps.web.many", { count: n }), sujeto: null };
    case "plan":
      return {
        verbo:
          n === 1
            ? t("common.steps.plan.one")
            : t("common.steps.plan.many", { count: n }),
        sujeto: null,
      };
    case "otro": {
      const origen = n === 1 ? origenDe(uno) : null;
      if (origen)
        return { verbo: t("common.steps.other.one", { tool: readableToolName(origen.tool) }), sujeto: objetivo, origen };
      return n === 1
        ? { verbo: t("common.steps.other.one", { tool: uno.nombre }), sujeto: objetivo }
        : { verbo: t("common.steps.other.many", { count: n }), sujeto: null };
    }
    // Si decidió la persona el verbo va en segunda persona: es lo que distingue
    // una decisión tuya de un paso del agente sin más rótulo.
    case "permiso":
      return {
        verbo: uno.decidio
          ? uno.permitido
            ? t("common.steps.permission.allowed_by", { who: uno.decidio, tool: uno.nombre })
            : t("common.steps.permission.denied_by", { who: uno.decidio, tool: uno.nombre })
          : uno.permitido
            ? t("common.steps.permission.allowed", { tool: uno.nombre })
            : t("common.steps.permission.denied", { tool: uno.nombre }),
        sujeto: objetivo && commandSummary(objetivo),
      };
    // Estos tres traen su propio texto y no se agrupan.
    default:
      return { verbo: objetivo ?? "", sujeto: null };
  }
}

/** Una fila de un solo paso que sigue corriendo se nombra en presente, como su loader. */
export function rotuloDeFila(fila: Fila): Rotulo {
  const [uno] = fila.pasos;
  return fila.pasos.length === 1 && uno.corriendo ? enCurso(uno) : resumen(fila);
}

/**
 * Lo mismo que [`resumen`], **en presente**: lo que está pasando ahora mismo.
 *
 * Va aquí y pegado a su gemelo por un motivo concreto: son la misma tabla de
 * clases dicha dos veces, y separarlas es cómo una gana un caso que la otra no
 * tiene. Lo que las distingue no es el tiempo verbal por gusto — «Leyó
 * Chat.tsx» es el rastro de lo que ya ocurrió, y «Leyendo Chat.tsx» es la única
 * prueba que tiene delante quien está esperando de que la app no se colgó.
 *
 * No agrupa, y no puede: un paso en curso es exactamente uno.
 */
export function enCurso(paso: Paso): Rotulo {
  const objetivo = paso.objetivo;
  switch (paso.clase) {
    case "leer":
      return { verbo: t("common.steps.reading"), sujeto: objetivo && nombreDe(objetivo) };
    case "buscar":
      return { verbo: t("common.steps.searching"), sujeto: objetivo };
    case "editar":
      return {
        verbo: gerundioDeEdicion(paso.nombre),
        sujeto: objetivo && nombreDe(objetivo),
      };
    case "ejecutar":
      return {
        verbo: t("common.steps.running"),
        sujeto: objetivo && commandSummary(objetivo),
      };
    case "web":
      return { verbo: t("common.steps.web_searching"), sujeto: objetivo };
    case "plan":
      return { verbo: t("common.steps.planning"), sujeto: null };
    default: {
      const origen = origenDe(paso);
      return origen
        ? { verbo: t("common.steps.using", { tool: readableToolName(origen.tool) }), sujeto: objetivo, origen }
        : { verbo: t("common.steps.using", { tool: paso.nombre }), sujeto: objetivo };
    }
  }
}

/**
 * Cuánto lleva, en la misma forma con la que se cierra.
 *
 * **Es el dato que desmiente «se congeló».** Un rótulo que no cambia se lee como
 * una pantalla muerta por muy animado que esté su punto; un número que sube es lo
 * único que prueba que algo sigue ocurriendo. Y es el mismo formato con el que el
 * turno cierra —«Trabajó durante 1m 4s»— para que el número no salte al acabar.
 */
export function formatearDuracion(ms: number) {
  const segundos = Math.floor(ms / 1000);
  if (segundos < 1) return t("common.duration.under_second");
  const minutos = Math.floor(segundos / 60);
  const resto = segundos % 60;
  return minutos > 0
    ? t("common.duration.min_sec", { minutes: minutos, seconds: resto })
    : t("common.duration.sec", { seconds: resto });
}

function gerundioDeEdicion(nombre: string) {
  if (nombre === "Write") return t("common.steps.writing");
  if (nombre === "file_change") return t("common.steps.changing");
  return t("common.steps.editing");
}

/** Escribir un archivo entero y editar un trozo no son el mismo acto. */
function verboDeEdicion(nombre: string) {
  if (nombre === "Write") return t("common.steps.write.one");
  if (nombre === "file_change") return t("common.steps.change.one");
  return t("common.steps.edit.one");
}
