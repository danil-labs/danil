import { joinableStep, joinSteps, stepCounts, type CountedStep, type StepCount } from "./chat/steps.ts";
import { isMcpTool } from "./chat/tools.ts";
import { manifiesto, t } from "../../../../apps/desktop/src/lib/i18n.ts";
import { CLASE, type Clase, type Paso } from "./steps-model.ts";

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
      return neutra !== undefined && joinableStep(neutra, p, fila, (q) => isMcpTool(q.nombre, q.mcpApp)) && p.detalle === null && fila.every((q) => q.detalle === null);
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
