import { Show, type JSX } from "solid-js";
import { Badge } from "../../../../ui/src/Badge";
import { type Query } from "../../../../ui/src/lib/limits";
import { cn } from "../../../../ui/src/lib/utils";
import { accountPresentation } from "../../../../ui/src/lib/accounts.ts";

export { accountPresentation };

const TONO_DE_FILA = {
  neutral: "neutral",
  active: "active",
  connected: "success",
  disconnected: "warning",
} as const;

export function StatusTag(props: {
  children: JSX.Element;
  tone?: "neutral" | "active" | "connected" | "disconnected";
  row?: boolean;
}) {
  const tono = () => props.tone ?? "neutral";

  return (
    <Show
      when={!props.row}
      fallback={
        <Badge class="shrink-0" tone={TONO_DE_FILA[tono()]}>
          {props.children}
        </Badge>
      }
    >
      <span
        class={cn("shrink-0 rounded-sm px-1.5 py-px text-[0.68rem] font-semibold",
          tono() === "neutral" && ["bg-surface", "text-neutral-500"],
          // Compartir el verde de «conectada» con «activa» vuelve la insignia
          // de la que está en uso ilegible: dos iguales pegadas.
          tono() === "active" && ["bg-primary/15", "text-primary"],
          tono() === "connected" && ["bg-success/15", "text-success-strong"],
          tono() === "disconnected" && ["bg-warning/15", "text-warning-strong"],
        )}
      >
        {props.children}
      </span>
    </Show>
  );
}

export function inferAuthenticated(limits?: Query): boolean | undefined {
  if (limits?.mode === "read") return true;
  if (limits?.mode === "no_account") return false;
  return undefined;
}
