import { Show } from "solid-js";
import { ProgressRing } from "./ProgressRing";
import { formatTokens, type Ventana } from "../../../../ui/src/lib/usage";
import { nf, percent } from "../../../../ui/src/lib/format";
import { t } from "../../../../ui/src/lib/i18n";
import { RETARDO_TOOLTIP, TooltipContent, TooltipRoot, TooltipTrigger } from "../../../../ui/src/Tooltip";

export default function VentanaDeContexto(props: {
  ventana: Ventana;
  agente?: string;
}) {
  const medido = () => props.ventana?.modo === "medido" ? props.ventana : null;
  const detalle = () => {
    const v = props.ventana;
    if (!v) return "";
    const agent = props.agente ?? t("usage.context.this_agent");
    if (v.modo === "sin-limite") {
      return t("usage.context.unlimited_title", { used: nf().format(v.usado), agent });
    }
    return v.modo === "medido"
      ? t("usage.context.measured_title", {
          used: nf().format(v.usado),
          limit: nf().format(v.limite),
        })
      : t("usage.context.unmeasured_title", { limit: nf().format(v.limite), agent });
  };

  return (
    <Show when={props.ventana}>
      <TooltipRoot openDelay={RETARDO_TOOLTIP} placement="top">
        <TooltipTrigger
          as="span"
          tabIndex={0}
          aria-label={detalle()}
          class="flex min-h-8 shrink-0 items-center gap-1 rounded-sm px-1.5 text-xs text-neutral-500 focus-visible:outline-2 focus-visible:outline-primary"
        >
          <span class={medido() ? "sr-only" : undefined}>{t("usage.context.label")}</span>
          <Show when={medido()}>
            {(v) => (
              <>
              <ProgressRing
                value={v().usado}
                max={v().limite}
                label={t("usage.context.bar_label")}
                ringClass={v().usado / v().limite >= 0.9
                  ? "stroke-error"
                  : v().usado / v().limite >= 0.75
                    ? "stroke-warning"
                    : "stroke-neutral-500"}
              />
              <span class="text-caption tabular-nums" aria-hidden="true">
                {percent(v().limite > 0 ? Math.min(100, Math.round((v().usado / v().limite) * 100)) : 0)}
              </span>
              </>
            )}
          </Show>
          <Show when={props.ventana?.modo === "sin-limite" ? props.ventana : null}>
            {(v) => (
              <span class="text-caption tabular-nums" aria-hidden="true">
                {formatTokens(v().usado)}
              </span>
            )}
          </Show>
        </TooltipTrigger>
        <TooltipContent>{detalle()}</TooltipContent>
      </TooltipRoot>
    </Show>
  );
}
