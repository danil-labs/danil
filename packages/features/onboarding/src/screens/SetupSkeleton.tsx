import { Show } from "solid-js";
import { connected } from "../../../../session/src/engineConnection.ts";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { CabeceraDelAlta } from "../components/Phases";
import { Escenario, TituloCambiante } from "../components/Stage";
import type { ControlesDeVentanaDelShell } from "../model/shell-port";

/** El hueco de una tarjeta mientras llega su trozo: mismo borde, sin contenido. */
export function TarjetaVacia() {
  return <div class="min-h-0 flex-1 rounded-lg border border-border bg-surface-raised" aria-hidden="true" />;
}

/**
 * El primer frame, antes de saber si hace falta preparar. Con la foto del sidebar
 * de la vez anterior es neutro: a quien ya usa Terminus no le parpadea el alta.
 */
export function Esqueleto(props: { preparando: boolean; ControlesDeVentana: ControlesDeVentanaDelShell }) {
  return (
    <Show
      when={props.preparando}
      fallback={
        <div class="flex h-full items-center justify-center bg-bg" aria-busy="true" data-setup-skeleton="neutral">
          <Show when={!connected()}>
            <p role="status" class="m-0 text-sm text-neutral-500">{t("shell.engine.connecting")}</p>
          </Show>
        </div>
      }
    >
      <main class="flex h-full flex-col overflow-hidden bg-bg" aria-busy="true" data-setup-skeleton="preparing">
        <CabeceraDelAlta ControlesDeVentana={props.ControlesDeVentana} />
        <Escenario
          izquierda={<TituloCambiante titulo={t("setup.title")} />}
          derecha={<TarjetaVacia />}
        />
      </main>
    </Show>
  );
}
