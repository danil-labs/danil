import Rocket from "lucide-solid/icons/rocket";
import { For, Show } from "solid-js";
import { render } from "solid-js/web";
import { cn } from "../../../apps/desktop/src/lib/utils";
import { Button } from "./Button";

export function celebrateFinishedTask(rect: DOMRect) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  // El evento de archivado desmonta la fila antes de que termine el despegue.
  const host = document.createElement("div");
  host.dataset.finishCelebration = "true";
  host.setAttribute("aria-hidden", "true");
  host.className = "pointer-events-none fixed z-[100] size-6 text-brand-purple";
  host.style.left = `${rect.left + rect.width / 2 - 12}px`;
  host.style.top = `${rect.top + rect.height / 2 - 12}px`;
  document.body.append(host);
  const colors = ["bg-brand-purple", "bg-accent", "bg-warning", "bg-info"];
  const dispose = render(() => <>
    <Rocket size={18} class="absolute top-[3px] left-[3px]" />
    <For each={Array.from({ length: 12 }, (_, i) => i)}>{i =>
      <span class={`absolute top-3 left-3 h-1.5 w-1 rounded-[1px] ${colors[i % colors.length]}`} />
    }</For>
  </>, host);
  host.querySelector("svg")?.animate?.([
    { transform: "translate(0, 0) scale(1)", opacity: 1 },
    { transform: "translate(3px, -4px) scale(0.9)", opacity: 1, offset: 0.18 },
    { transform: "translate(22px, -30px) scale(0.6)", opacity: 0 },
  ], { duration: 720, easing: "ease-out", fill: "forwards" });
  host.querySelectorAll("span").forEach((particle, index) => {
    const angle = (index / 12) * Math.PI * 2;
    const x = Math.cos(angle) * (24 + (index % 3) * 7);
    const y = Math.sin(angle) * 24 - 12;
    particle.animate?.([
      { transform: "translate(0, 0) rotate(0deg)", opacity: 0 },
      { transform: `translate(${x * 0.8}px, ${y - 6}px) rotate(${index * 35}deg)`, opacity: 1, offset: 0.4 },
      { transform: `translate(${x}px, ${y + 16}px) rotate(${index * 65}deg)`, opacity: 0 },
    ], { duration: 720, easing: "ease-out", fill: "forwards" });
  });
  window.setTimeout(() => { dispose(); host.remove(); }, 720);
}

export function FinishTaskButton(props: {
  label: string;
  description: string;
  busy: boolean;
  onFinish: (rect: DOMRect) => void;
  /** La tarjeta del riel lo pone en línea con la hora, en una línea de 16 px. */
  compact?: boolean;
}) {
  return <Button
    type="button"
    variant="ghost"
    size="iconCompact"
    class={cn(
      "shrink-0 bg-brand-purple/10 text-brand-purple hover:bg-brand-purple/20 hover:text-brand-purple disabled:opacity-100",
      props.compact ? "size-[18px] min-h-0 min-w-0 bg-transparent p-0 hover:bg-transparent" : "size-6",
    )}
    data-session-finish
    aria-label={props.label}
    title={props.description}
    aria-busy={props.busy}
    disabled={props.busy}
    onClick={event => props.onFinish(event.currentTarget.getBoundingClientRect())}
  >
    <span class={cn("relative flex items-center justify-center", props.compact ? "size-4" : "size-5")} aria-hidden="true">
      <Show when={props.busy}>
        <span class="finish-task-flame absolute h-2 w-1 rounded-full bg-warning" />
      </Show>
      <Rocket size={props.compact ? 13 : 15} class="finish-task-rocket relative" />
    </span>
  </Button>;
}
