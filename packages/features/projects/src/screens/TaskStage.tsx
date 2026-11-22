import { Show } from "solid-js";
import { cn } from "../../../../../apps/desktop/src/lib/utils";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import type { Etapa } from "../../../../ui/src/lib/session-row.ts"; export type { Etapa };

/**
 * Las tres etapas, en el orden en que avanza el trabajo — que es el orden en
 * que se ofrecen en el menú.
 *
 * El rótulo es una función y su `t()` lleva la clave **escrita entera**: una
 * clave compuesta —`` t(`projects.stage.${id}`) `` — sale de la comprobación de
 * `scripts/guards/locales.mjs` sin que nada avise, y lo que se pinta entonces es la
 * clave en medio de la fila.
 */
export const ETAPAS: { id: Etapa; rotulo: () => string; clase: string }[] = [
  {
    id: "in_progress",
    rotulo: () => t("projects.stage.in_progress"),
    clase: "text-info-strong",
  },
  {
    id: "review",
    rotulo: () => t("projects.stage.review"),
    clase: "text-warning-strong",
  },
  {
    id: "done",
    rotulo: () => t("projects.stage.done"),
    clase: "text-success-strong",
  },
];

/**
 * La marca de la fila: la palabra y nada más.
 *
 * `shrink-0` y su sitio en la fila son lo que hace que no compita con el
 * título: el título se recorta con puntos suspensivos y la etapa se queda
 * entera, porque de las dos la que se lee de un vistazo es esta.
 */
export default function EtapaDeTarea(props: {
  etapa: Etapa | null | undefined;
  class?: string;
}) {
  const cual = () => ETAPAS.find((e) => e.id === props.etapa);
  return (
    <Show when={cual()}>
      {(e) => (
        <span
          class={cn(
            "shrink-0 text-caption leading-none font-medium",
            e().clase,
            props.class,
          )}
        >
          {e().rotulo()}
        </span>
      )}
    </Show>
  );
}
