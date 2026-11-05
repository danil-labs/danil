import { For, Show } from "solid-js";
import ChevronRight from "lucide-solid/icons/chevron-right";
import MessageCircle from "lucide-solid/icons/message-circle";
import { t } from "../../lib/i18n";
import { cn } from "../../lib/utils";
import type { Pregunta, Respuesta } from "./Questions";

/**
 * Lo que el agente preguntó y lo que se le contestó, como bloque propio del
 * hilo. Una decisión de la persona no es una herramienta que corrió el agente,
 * así que no va dentro del pliegue de «Trabajó durante N»: tiene el mismo
 * rango que `Entrega` — tarjeta sobre `surface-raised`, en
 * el sitio donde ocurrió.
 *
 * Nace abierto, y por eso el estado que se guarda es el pliegue: `Chat.tsx` lo
 * guarda al revés que `trabajos` — ahí el `Record` marca lo desplegado y aquí
 * lo plegado, que es lo que un `Record` vacío significa en cada caso.
 *
 * La respuesta pesa más que la pregunta: al volver aquí se busca qué se
 * decidió. La pregunta va en gris pequeño y la respuesta en el cuerpo.
 *
 * Una pregunta sin contestar se lista como pendiente. Mientras lo está se ve
 * dos veces —aquí y viva en la caja de escribir—, a propósito: el hueco dice
 * desde el principio dónde va a quedar la respuesta.
 */
export default function RegistroPreguntas(props: {
  items: Pregunta[];
  respuestas: Respuesta[] | null;
  abierta: boolean;
  onAlternar: () => void;
}) {
  const respuestaDe = (pregunta: Pregunta) =>
    props.respuestas?.find((respuesta) => respuesta.question === pregunta.id);
  const contestadas = () =>
    props.items.filter((pregunta) => Boolean(respuestaDe(pregunta))).length;
  const completo = () => contestadas() === props.items.length;

  return (
    <section
      class="my-2 grid gap-0.5 rounded-md border border-border bg-surface-raised p-1.5 shadow-sm"
      aria-label={t("chat.questions.log.title")}
    >
      <button
        type="button"
        aria-expanded={props.abierta}
        onClick={props.onAlternar}
        class="flex w-full min-w-0 items-center gap-2 rounded-sm px-1.5 py-1 text-left transition-colors hover:bg-surface-muted"
      >
        <ChevronRight
          size={13}
          class={cn(
            "shrink-0 text-neutral-500 transition-transform",
            props.abierta && "rotate-90",
          )}
          aria-hidden="true"
        />
        {/* En el color del agente, como `Entrega`: el morado del sistema es de
            sus actos, y preguntar lo es. Un paso de la línea de tiempo va en
            gris porque es fontanería; esto es una decisión. */}
        <MessageCircle size={13} class="shrink-0 text-primary" aria-hidden="true" />
        <span class="shrink-0 text-xs font-medium text-neutral-700">
          {t("chat.questions.log.title")}
        </span>
        <span class="min-w-0 truncate text-xs text-neutral-500">
          {completo()
            ? t("chat.questions.log.answered", { count: contestadas() })
            : t("chat.questions.log.answered_of", {
                done: contestadas(),
                total: props.items.length,
              })}
        </span>
      </button>

      <Show when={props.abierta}>
        <ul class="m-0 grid list-none gap-2 p-0">
          <For each={props.items}>
            {(pregunta) => {
              const respuesta = () => respuestaDe(pregunta);
              return (
                <li class="grid min-w-0 gap-0.5 px-1.5 pb-0.5">
                  <p class="m-0 text-xs [overflow-wrap:anywhere] text-neutral-500">
                    {pregunta.question}
                  </p>
                  <Show
                    when={respuesta()}
                    fallback={
                      <p class="m-0 text-xs text-neutral-500 italic">
                        {t("chat.questions.log.pending")}
                      </p>
                    }
                  >
                    {(r) => (
                      <p
                        class={cn(
                          "m-0 text-sm [overflow-wrap:anywhere]",
                          r().text ? "text-neutral-950" : "text-neutral-500 italic",
                        )}
                      >
                        {r().text || t("chat.questions.skipped")}
                      </p>
                    )}
                  </Show>
                </li>
              );
            }}
          </For>
        </ul>
      </Show>
    </section>
  );
}
