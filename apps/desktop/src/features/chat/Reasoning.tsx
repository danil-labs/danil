import ChevronRight from "lucide-solid/icons/chevron-right";
import Loader2 from "lucide-solid/icons/loader-circle";
import { createUniqueId, Show } from "solid-js";
import { t } from "../../lib/i18n";
import { formatearDuracion } from "../../lib/steps";
import { cn } from "../../lib/utils";
import type { Razonamiento } from "./Chat";

/**
 * Lo que el agente pensó antes de escribir, plegado por mensaje.
 *
 * Va sin avatar ni globo y con texto plano: no puede leerse como la respuesta.
 */
export default function Reasoning(props: {
  bloques: Razonamiento[];
  /** El turno sigue en marcha y esto es lo último que llegó. */
  vivo: boolean;
  abierto: boolean;
  onAlternar: () => void;
}) {
  const panel = createUniqueId();
  const texto = () => props.bloques.map((b) => b.text).join("\n\n");
  const duracion = () => {
    if (!props.bloques.some((b) => b.durationMs !== undefined)) return null;
    return formatearDuracion(props.bloques.reduce((total, b) => total + (b.durationMs ?? 0), 0));
  };
  const resumen = () => {
    if (props.vivo) return t("chat.reasoning.thinking");
    const tiempo = duracion();
    return tiempo
      ? t("chat.reasoning.summary", { duration: tiempo })
      : t("chat.reasoning.title");
  };
  return (
    <div class="mb-2">
      <button
        type="button"
        aria-expanded={props.abierto}
        aria-controls={panel}
        onClick={() => props.onAlternar()}
        class="flex w-full min-w-0 items-center gap-2 rounded-sm px-1 py-1.5 text-left text-sm hover:bg-surface-muted"
      >
        <ChevronRight
          size={14}
          class={cn(
            "shrink-0 text-neutral-500 transition-transform",
            props.abierto && "rotate-90",
          )}
          aria-hidden="true"
        />
        <Show when={props.vivo}>
          <Loader2 size={14} class="shrink-0 animate-spin text-primary" aria-hidden="true" />
        </Show>
        <span class="min-w-0 truncate text-neutral-500">{resumen()}</span>
      </button>
      <Show when={props.abierto}>
        <div
          id={panel}
          class="mb-2 border-l border-border px-3 py-1 text-sm whitespace-pre-wrap text-neutral-500 select-text"
        >
          {texto()}
        </div>
      </Show>
    </div>
  );
}
