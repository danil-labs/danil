import ArrowRight from "lucide-solid/icons/arrow-right";
import Check from "lucide-solid/icons/check";
import { Index } from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import type { NextStepOption } from "../../../../ui/src/lib/chat/nextSteps";
import { cn } from "../../../../../apps/desktop/src/lib/utils";
import { Pressable } from "../../../../ui/src/Pressable";

/**
 * Las respuestas rápidas al pie de un mensaje del agente. Cada una se manda
 * tal cual, por el mismo camino que la caja. La que ya se mandó se atenúa y no
 * se vuelve a mandar; las demás siguen vivas en turnos posteriores. `Index`:
 * mientras llegan, cada token trae opciones nuevas y `For` remontaría los botones.
 */
export default function NextSteps(props: {
  options: NextStepOption[];
  usada: (texto: string) => boolean;
  /** Falso mientras el bloque llega o si esta conversación no puede escribir. */
  habilitado: boolean;
  onElegir: (texto: string) => void;
}) {
  return (
    <div role="group" aria-label={t("chat.next_steps.aria")} class="mt-2 grid gap-1.5" data-next-steps="">
      <Index each={props.options}>
        {(opcion) => {
          const usada = () => props.usada(opcion().prompt);
          return (
            <Pressable
              class={cn(
                "flex w-full min-w-0 items-start gap-2 rounded-md border border-border bg-transparent px-2.5 py-1.5 text-left text-ui leading-[1.45] text-neutral-700 transition-colors duration-150 outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                "enabled:hover:border-border-strong enabled:hover:bg-surface-muted enabled:hover:text-neutral-950",
                "disabled:cursor-default disabled:text-neutral-500",
                usada() && "opacity-60",
              )}
              disabled={!props.habilitado || usada()}
              aria-label={usada() ? t("chat.next_steps.sent", { text: opcion().prompt }) : undefined}
              onClick={() => props.onElegir(opcion().prompt)}
            >
              <span class="mt-[3px] shrink-0 text-neutral-500" aria-hidden="true">
                {usada() ? <Check size={14} /> : <ArrowRight size={14} />}
              </span>
              <span class="min-w-0 flex-1 break-words">{opcion().prompt}</span>
            </Pressable>
          );
        }}
      </Index>
    </div>
  );
}
