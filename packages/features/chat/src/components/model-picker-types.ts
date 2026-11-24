import { danilServiceOf } from "../../../../ui/src/lib/tasks/index.ts";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { agruparModelos, type OpcionDeModelo } from "../../../../../apps/desktop/src/lib/models";
import type { CreateFreeRouterConsent } from "../../../../ui/src/lib/freeRouterConsent.ts";

/** Solo los dos ids de `danilServiceOf` se presentan como servicios de Danil; otros gratuitos siguen en la lista. */
const esServicio = (opcion: OpcionDeModelo | undefined) => !!opcion && danilServiceOf(opcion.model.id) !== null;
function nombreDeServicio(id: string | undefined) {
  const servicio = danilServiceOf(id);
  if (servicio === "credits") return t("chat.services.label");
  if (servicio === "router") return t("surfaces.label.free");
  return null;
}
const gruposDeModelos = (models: OpcionDeModelo[], query: string) =>
  agruparModelos(models.filter((opcion) => !esServicio(opcion)), query);

type SelectorDeModeloProps = {
  createFreeRouterConsent: CreateFreeRouterConsent;
  invokeOptions?: { headers: Record<string, string> };
  models: OpcionDeModelo[];
  superficie: string;
  model: string;
  missingModelLabel?: string;
  disabled?: boolean;
  disabledReason?: string;
  onChange: (model: OpcionDeModelo) => void;
  /** El agente de la tarea: los demás se ven, pero el candado dice por qué no se eligen. */
  lockedAgent?: string;
  lockedReason?: string | null;
  /** La píldora de la caja del chat; sin ella, el disparador fantasma. */
  pildora?: boolean;
  /** El agente que responde, para pintar su marca en el disparador. */
  marca?: string;
  /** Los niveles del modelo elegido. Sin `onEffort` no se ofrecen. */
  efforts?: readonly string[];
  defaultEffort?: string | null;
  effort?: string;
  onEffort?: (id: string) => void;
};

/** Los niveles que el catálogo sabe nombrar; otro sale como lo llama el agente. */
const NIVELES_CON_NOMBRE = ["minimal", "low", "medium", "high", "xhigh", "max"];

function nombreDeNivel(id: string | null | undefined): string {
  if (!id) return t("chat.effort.agent_decides");
  return NIVELES_CON_NOMBRE.includes(id) ? t(`chat.effort.level.${id}`) : id;
}

const DISPARADOR =
  "flex min-w-0 items-center text-xs text-neutral-500 outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60";

export { esServicio, nombreDeServicio, gruposDeModelos, nombreDeNivel, DISPARADOR };
export type { SelectorDeModeloProps };
