import { Show, type JSX } from "solid-js";
import { SESION_INICIADA, type Account, type AccountStatus } from "../queries/accounts-store";
import { Badge } from "../../../../ui/src/Badge";
import { type Query, type Read } from "../../../../../apps/desktop/src/lib/limits";
import { cn } from "../../../../../apps/desktop/src/lib/utils";

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

/**
 * `account_status` persiste la identidad que acaba de leer, pero el objeto que
 * ya devolvió `list_accounts` no cambia retroactivamente. Mientras llega la
 * siguiente lista, `detail` es la lectura fresca y tiene prioridad sobre la
 * etiqueta de relleno.
 */
export function accountPresentation(
  account: Account,
  status?: AccountStatus,
  limits?: Query,
  lastGood?: Read,
) {
  const detail = status?.detail.trim() ?? "";
  const [detailName = "", detailPlan = ""] = detail.split(" · ", 2);
  const statusIdentity =
    status?.authenticated && detailName && detailName !== SESION_INICIADA
      ? detailName
      : "";
  const name = statusIdentity || account.identity?.trim() || account.label;
  const read = limits?.mode === "read" ? limits : lastGood;
  const plan = read?.plan?.trim() || (statusIdentity ? detailPlan.trim() : "") || null;
  const visibleDetail =
    detail && detail !== name && detail !== `${name} · ${plan}` ? detail : null;
  return { name, plan, detail: visibleDetail };
}
