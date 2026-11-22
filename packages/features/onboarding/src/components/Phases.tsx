import { For, Show } from "solid-js";
import Check from "lucide-solid/icons/check";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { cn } from "../../../../../apps/desktop/src/lib/utils";
import {
  createFullscreen,
  HEADER_HEIGHT,
  isWindows,
  needsTrafficLightPadding,
  TRAFFIC_LIGHT_PADDING,
  toggleMaximizeFromHeader,
} from "../../../../host/src/window";
import type { ControlesDeVentanaDelShell } from "../model/shell-port";

/** Las dos fases del alta: preparar incluye conectar la IA; personalizar es la última pantalla. */
export function Fases(props: { actual: number }) {
  const fases = () => [t("onboarding.phases.prepare"), t("onboarding.phases.personalize")];
  return (
    <nav class="flex gap-5" aria-label={t("onboarding.phases.label")}>
      <For each={fases()}>
        {(fase, i) => (
          <span
            class={cn(
              "flex items-center gap-1",
              i() === props.actual ? "font-semibold text-primary" : "text-neutral-500",
            )}
            aria-current={i() === props.actual ? "step" : undefined}
          >
            <Show when={i() < props.actual} fallback={<strong class="font-semibold">{i() + 1}</strong>}>
              <Check size={12} aria-hidden="true" />
            </Show>{" "}
            {fase}
          </span>
        )}
      </For>
    </nav>
  );
}

/** La cabecera de las pantallas del alta: ocupan la ventana entera y siempre apartan el semáforo. */
export function CabeceraDelAlta(props: { fase?: number; ControlesDeVentana: ControlesDeVentanaDelShell }) {
  const { ControlesDeVentana } = props;
  const apartarSemaforo = needsTrafficLightPadding(() => true, createFullscreen());
  return (
    <header
      class={cn(
        "flex shrink-0 items-center gap-5 border-b border-border px-7 text-xs",
        HEADER_HEIGHT,
        apartarSemaforo() && TRAFFIC_LIGHT_PADDING,
      )}
      data-tauri-drag-region=""
      onDblClick={toggleMaximizeFromHeader}
    >
      <Show when={props.fase !== undefined}>
        <Fases actual={props.fase ?? 0} />
      </Show>
      <span class="flex-1 self-stretch" data-tauri-drag-region="" />
      <Show when={isWindows()}>
        <ControlesDeVentana />
      </Show>
    </header>
  );
}
