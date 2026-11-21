import { createEffect, createSignal, on, onCleanup, Show } from "solid-js";
import { AnsiText } from "@danil/ui";
import { CornerDownRight, Square, SquareTerminal } from "./icons.tsx";

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
  truncated?: boolean;
  exitCode?: number | null;
  durationMs?: number | null;
  /** Mientras corre: desde cuándo, y cómo se detiene. */
  vivo?: { desde: number; deteniendo: boolean; onDetener: () => void };
  /** La frase del pie cuando el agente todavía no leyó la salida. */
  pendiente?: string | null;
};

export function formatearDuracion(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seg = Math.round(ms / 1000);
  if (seg < 60) return `${seg}s`;
  const min = Math.floor(seg / 60);
  const segResto = seg % 60;
  return `${min}m ${segResto}s`;
}

const DATO = "shrink-0 text-caption text-neutral-500 tabular-nums";
const ESPERA_DEL_BOTON_MS = 500;
const HOLGURA_DEL_FONDO_PX = 8;

export function ShellCard(props: TarjetaDeTerminalProps) {
  const [ahora, setAhora] = createSignal(Date.now());
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
                corriendo {formatearDuracion(Math.max(0, ahora() - vivo().desde))}
              </span>
              <Show when={botonVisible()}>
                <button
                  type="button"
                  class="flex size-6 shrink-0 items-center justify-center rounded-full bg-neutral-950 text-neutral-50 outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
                  aria-label={vivo().deteniendo ? "deteniendo..." : "Detener"}
                  title={vivo().deteniendo ? "deteniendo..." : "Detener"}
                  disabled={vivo().deteniendo}
                  onClick={() => vivo().onDetener()}
                >
                  <Square size={9} fill="currentColor" />
                </button>
              </Show>
            </>
          )}
        </Show>
        <Show when={!props.vivo && props.exitCode != null}>
          <span
            class={`flex h-5 shrink-0 items-center rounded-[5px] px-[7px] text-caption font-medium ${
              props.exitCode === 0
                ? "bg-success/10 text-success-strong"
                : "bg-error/10 text-error-strong"
            }`}
          >
            {props.exitCode === 0 ? "código 0" : `error ${props.exitCode}`}
          </span>
        </Show>
        <Show when={!props.vivo && props.durationMs != null}>
          <span class={DATO}>{formatearDuracion(props.durationMs!)}</span>
        </Show>
      </header>
      <Show when={props.output || props.truncated}>
        <pre
          ref={salida}
          onScroll={alScroll}
          class="m-0 max-h-72 overflow-auto px-3 py-2.5 font-mono text-xs leading-[18px] break-words whitespace-pre-wrap text-neutral-700"
        >
          <Show when={props.truncated}>
            <span class="text-neutral-500">[salida truncada]{"\n"}</span>
          </Show>
          <AnsiText text={props.output} />
        </pre>
      </Show>
      <Show when={!props.vivo && props.pendiente}>
        <div class="flex min-h-7 min-w-0 items-center gap-1.5 border-t border-border px-3 py-0.5 text-caption text-neutral-500">
          <CornerDownRight size={12} class="shrink-0" />
          <span class="min-w-0 truncate">{props.pendiente}</span>
        </div>
      </Show>
    </article>
  );
}

export { ShellCard as TarjetaDeTerminal };
export default ShellCard;
