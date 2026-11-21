import { Show, createMemo, createSignal, onCleanup } from "solid-js";
import { formatearDuracion } from "./ShellCard.tsx";

export type MachineWaitStatus = { phase: "waking" | "connecting"; name: string; wakes: boolean };

export function ActivityDots() {
  return (
    <span class="inline-flex items-center gap-1" aria-hidden="true">
      <span class="inline-block size-1.5 rounded-full bg-primary animate-pulse" />
      <span class="inline-block size-1.5 rounded-full bg-primary animate-pulse [animation-delay:200ms]" />
      <span class="inline-block size-1.5 rounded-full bg-primary animate-pulse [animation-delay:400ms]" />
    </span>
  );
}

function MachineIcon(props: { wakes?: boolean; size?: number }) {
  return (
    <svg
      width={props.size ?? 14}
      height={props.size ?? 14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="shrink-0 text-neutral-500"
      aria-hidden="true"
    >
      <rect width="20" height="8" x="2" y="2" rx="2" />
      <rect width="20" height="8" x="2" y="14" rx="2" />
      <line x1="6" x2="6.01" y1="6" y2="6" />
      <line x1="6" x2="6.01" y1="18" y2="18" />
    </svg>
  );
}

const MUESTRA_EL_RELOJ_DESDE_MS = 3000;

export interface TurnStatusProps {
  paso?: unknown;
  inline?: boolean;
  esperando?: boolean;
  reintento?: { intento: number; total: number; clase?: string } | null;
  enFondo?: boolean;
  desde?: number | null;
  machineWait?: MachineWaitStatus | null;
}

export function TurnStatus(props: TurnStatusProps) {
  const [ahora, setAhora] = createSignal(Date.now());

  if (props.desde != null) {
    const reloj = setInterval(() => setAhora(Date.now()), 1000);
    onCleanup(() => clearInterval(reloj));
  }

  const blocked = () =>
    Boolean(props.machineWait || props.esperando || props.reintento || props.enFondo);

  const dice = createMemo(() => {
    if (props.machineWait) {
      const { phase, name } = props.machineWait;
      const verbo =
        phase === "connecting"
          ? `Conectando con ${name}...`
          : `Iniciando ${name}...`;
      return { verbo, sujeto: null };
    }
    if (props.esperando) return { verbo: "Esperando respuesta...", sujeto: null };
    if (props.enFondo) return { verbo: "Esperando proceso en segundo plano...", sujeto: null };
    const r = props.reintento;
    if (r) return { verbo: `Reintentando (${r.intento}/${r.total})...`, sujeto: null };
    return { verbo: "Trabajando...", sujeto: null };
  });

  const cuanto = () => {
    if (props.enFondo || props.desde == null) return null;
    const ms = Math.max(0, ahora() - props.desde);
    return ms >= MUESTRA_EL_RELOJ_DESDE_MS ? formatearDuracion(ms) : null;
  };

  return (
    <span
      class={
        props.inline
          ? "inline-flex items-center gap-2 text-neutral-500 not-italic"
          : "m-0 flex items-center gap-2 text-neutral-500 not-italic"
      }
      role={props.inline && !blocked() ? undefined : "status"}
      aria-live={props.inline && !blocked() ? undefined : "polite"}
      aria-label={
        props.inline && !blocked()
          ? undefined
          : props.machineWait
          ? dice().verbo
          : props.esperando
          ? "Esperando respuesta..."
          : props.reintento || props.enFondo
          ? dice().verbo
          : "Trabajando..."
      }
    >
      <Show when={!props.inline || props.machineWait || props.esperando || props.reintento || props.enFondo}>
        <Show
          when={props.machineWait || props.esperando || props.reintento || props.enFondo}
          fallback={
            <>
              <ActivityDots />
              <span class="text-neutral-700 not-italic">Pensando...</span>
            </>
          }
        >
          <Show when={props.machineWait}>
            {(machine) => <MachineIcon wakes={machine().wakes} size={14} />}
          </Show>
          <span>{dice().verbo}</span>
        </Show>
      </Show>
      <Show when={cuanto()}>
        {(duration) => <span aria-hidden="true" class="text-xs tabular-nums">{duration()}</span>}
      </Show>
    </span>
  );
}

export { TurnStatus as EstadoDelTurno };
export default TurnStatus;
