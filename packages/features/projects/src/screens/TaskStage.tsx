import { Show } from "solid-js";
import { cn } from "../../../../../apps/desktop/src/lib/utils";
import { t } from "../../../../../apps/desktop/src/lib/i18n";

/**
 * En qué etapa del trabajo puso una persona una tarea. Ver `sessions::Etapa`
 * para el motivo entero; aquí va lo que eso obliga en pantalla.
 *
 * **No es `EstadoDeTarea` y no puede parecerlo.** Aquel punto lo pone la
 * máquina y dura lo que dura el turno —está trabajando, preguntó, espera que
 * apruebes—; esto lo pone una persona y dura hasta que otra lo cambie. Son dos
 * respuestas a dos preguntas distintas de la misma fila, así que se pintan con
 * dos formas distintas: aquel es un punto de color sin texto, esto es una
 * palabra. Con la misma forma, una tarea marcada «Hecho» que además está
 * contestando tendría dos puntos discutiendo cuál es el estado.
 *
 * **El color no lleva el dato solo**: la palabra está escrita. Tres tonos que
 * solo se distinguen por matiz no llegan a los 3:1 de WCAG 2.2 § 1.4.11 y
 * dejarían la fila sin decir nada a quien no los separa.
 *
 * **La tarea sin etapa no pinta nada.** Una insignia «Sin empezar» en cada fila
 * del historial afirmaría de todas ellas algo que nadie declaró, y convertiría
 * una lista de veinte tareas en veinte insignias iguales — el ruido que hace
 * que la marcada deje de verse.
 *
 * **Y no viaja a la pestaña**, aunque el punto de estado sí lo haga. La pestaña
 * es la tarea que tienes delante: en qué etapa está se ve mirándola. Esto
 * contesta «cuál me queda por mirar», que es una pregunta de la lista.
 */
export type Etapa = "in_progress" | "review" | "done";

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
