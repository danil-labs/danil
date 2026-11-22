import { commandSummary } from "../../../../packages/ui/src/lib/chat/command.ts";
import { readableToolName } from "../../../../packages/ui/src/lib/chat/tools.ts";
import { t } from "./i18n.ts";
import { nombreDe, origenDe, type Origen, type Paso } from "./steps-model.ts";
import type { Fila } from "./steps-group.ts";

/** Tres ediciones al mismo archivo son un archivo que revisar, no tres. */
function archivosDistintos(pasos: Paso[]) {
  return new Set(pasos.map((p, i) => p.objetivo ?? `#${i}`)).size;
}

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
