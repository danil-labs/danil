import CornerDownRight from "lucide-solid/icons/corner-down-right";
import Square from "lucide-solid/icons/square";
import SquareTerminal from "lucide-solid/icons/square-terminal";
import { createEffect, createSignal, on, onCleanup, Show } from "solid-js";
import { t } from "../../../../ui/src/lib/i18n";
import { formatearDuracion } from "../../../../ui/src/lib/steps";
import { cn } from "../../../../ui/src/lib/utils";
import { AnsiText } from "../../../../ui/src/AnsiText";
import { Pressable } from "../../../../ui/src/Pressable";

/** Un `!` mientras corre, armado con los eventos `shell_*` de su ejecución. */
export type ComandoEnVivo = {
  id: string;
  command: string;
  cwd: string | null;
  output: string;
  truncated: boolean;
  desde: number;
};

export type TarjetaDeTerminalProps = {
  command: string;
  cwd?: string | null;
  output: string;
  truncated: boolean;
  exitCode?: number | null;
  durationMs?: number | null;
  /** Mientras corre: desde cuándo, y cómo se detiene. */
  vivo?: { desde: number; deteniendo: boolean; onDetener: () => void };
  /** La frase del pie cuando el agente todavía no leyó la salida. */
  pendiente?: string | null;
};

const DATO = "shrink-0 text-caption text-neutral-500 tabular-nums";
// Un `!` que termina antes no enseña el botón: aparecer y desaparecer en un instante se lee como un parpadeo.
const ESPERA_DEL_BOTON_MS = 500;
// Margen para contar como «al fondo»: el redondeo del scroll deja a veces un píxel.
const HOLGURA_DEL_FONDO_PX = 8;

export default function TarjetaDeTerminal(props: TarjetaDeTerminalProps) {
  const [ahora, setAhora] = createSignal(Date.now());
  // Una tarjeta nace viva o terminada; las del historial no llevan reloj.
  const [botonVisible, setBotonVisible] = createSignal(false);
  if (props.vivo) {
    const reloj = setInterval(() => setAhora(Date.now()), 1000);
    const boton = setTimeout(() => setBotonVisible(true), ESPERA_DEL_BOTON_MS);
    onCleanup(() => {
      clearInterval(reloj);
      clearTimeout(boton);
    });
  }
  let salida: HTMLPreElement | undefined;
  let pegadoAlFondo = true;
  const alScroll = () => {
    if (!salida) return;
    pegadoAlFondo = salida.scrollHeight - salida.scrollTop - salida.clientHeight <= HOLGURA_DEL_FONDO_PX;
  };
  createEffect(
    on(
      () => props.output,
      () => {
        if (props.vivo && salida && pegadoAlFondo) salida.scrollTop = salida.scrollHeight;
      },
    ),
  );

  return (
    <article class="col-start-1 grid min-w-0 overflow-hidden rounded-lg border border-border bg-surface-raised">
      <header class="flex h-[34px] min-w-0 items-center gap-2 bg-surface-muted px-3">
        <SquareTerminal size={14} class="shrink-0 text-neutral-700" aria-hidden="true" />
        <span
          class="min-w-0 truncate font-mono text-xs font-medium text-neutral-950"
          title={props.cwd ?? undefined}
        >
          $ {props.command}
        </span>
        <span class="ml-auto" />
        <Show when={props.vivo}>
          {(vivo) => (
            <>
              <span class={DATO}>
                {t("chat.shell.running", {
                  duration: formatearDuracion(Math.max(0, ahora() - vivo().desde)),
                })}
              </span>
              <Show when={botonVisible()}>
                <Pressable
                  class="flex size-6 shrink-0 items-center justify-center rounded-full bg-neutral-950 text-neutral-50 outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
                  aria-label={vivo().deteniendo ? t("chat.turn.stopping") : t("chat.shell.stop")}
                  title={vivo().deteniendo ? t("chat.turn.stopping") : t("chat.shell.stop")}
                  disabled={vivo().deteniendo}
                  onClick={() => vivo().onDetener()}
                >
                  <Square size={9} fill="currentColor" aria-hidden="true" />
                </Pressable>
              </Show>
            </>
          )}
        </Show>
        <Show when={!props.vivo && props.exitCode != null}>
          <span
            class={cn(
              "flex h-5 shrink-0 items-center rounded-[5px] px-[7px] text-caption font-medium",
              props.exitCode === 0
                ? "bg-success/10 text-success-strong"
                : "bg-error/10 text-error-strong",
            )}
          >
            {t("chat.shell.exit", { code: props.exitCode! })}
          </span>
        </Show>
        <Show when={!props.vivo && props.durationMs != null}>
          <span class={DATO}>{formatearDuracion(props.durationMs!)}</span>
        </Show>
      </header>
      <Show when={props.output || props.truncated}>
        <pre ref={salida} onScroll={alScroll} class="m-0 max-h-72 overflow-auto px-3 py-2.5 font-mono text-xs leading-[18px] break-words whitespace-pre-wrap text-neutral-700">
          <Show when={props.truncated}>
            <span class="text-neutral-500">{t("chat.shell.truncated")}{"\n"}</span>
          </Show>
          <AnsiText text={props.output} enlaces />
        </pre>
      </Show>
      <Show when={!props.vivo && props.pendiente}>
        <div class="flex min-h-7 min-w-0 items-center gap-1.5 border-t border-border px-3 py-0.5 text-caption text-neutral-500">
          <CornerDownRight size={12} class="shrink-0" aria-hidden="true" />
          <span class="min-w-0 truncate">{props.pendiente}</span>
        </div>
      </Show>
    </article>
  );
}
