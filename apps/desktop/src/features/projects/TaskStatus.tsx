import Check from "lucide-solid/icons/check";
import CircleAlert from "lucide-solid/icons/circle-alert";
import CircleHelp from "lucide-solid/icons/circle-help";
import CirclePause from "lucide-solid/icons/circle-pause";
import ShieldQuestion from "lucide-solid/icons/shield-question";
import { SignalDot, taskSignalTone } from "../../ui/SignalDot";
import { Match, Show, Switch } from "solid-js";
import { t } from "../../lib/i18n";
import { Spinner } from "../../ui/Spinner";
import { cn } from "../../lib/utils";
import { type TaskActivity, markedState, taskPriority } from "@terminus/design";

export function taskLabel(state: ReturnType<typeof taskPriority>, folded = false) {
    switch (state) {
      case "approving": return folded ? t("projects.status.folded_approving") : t("projects.status.approving");
      case "asked": return folded ? t("projects.status.folded_asked") : t("projects.status.asked");
      case "working": return folded ? t("projects.status.folded_working") : t("projects.status.working");
      case "failed": return folded ? t("projects.status.folded_failed") : t("projects.status.failed");
      case "interrupted": return folded ? t("projects.status.folded_interrupted") : t("projects.status.interrupted");
      case "unseen": return folded ? t("projects.status.folded_unseen") : t("projects.status.unseen");
      default: return "";
    }
}

/** Lo comparten la fila, lo plegado y la columna de workspaces: un color por estado. */
export function stateColor(state: ReturnType<typeof taskPriority>) {
  switch (state) {
    case "failed": return "text-error-strong";
    case "interrupted": return "text-neutral-500";
    case "approving": return "text-warning";
    case "working": return "text-primary";
    case "unseen": return "text-success-strong";
    default: return "text-brand-yellow";
  }
}

export function stateIcon(state: ReturnType<typeof taskPriority>) {
  switch (state) {
    case "failed": return CircleAlert;
    case "interrupted": return CirclePause;
    case "approving": return ShieldQuestion;
    case "unseen": return Check;
    default: return CircleHelp;
  }
}

/**
 * El color de cada estado en la tarjeta del riel: preguntar y pedir aprobación
 * comparten el ámbar fuerte, que sobre el fondo del riel se lee como texto.
 */
/** El anillo punteado de la tarea que el motor todavía registra. */
function RailDashedRing(props: { size?: number }) {
  return (
    <svg data-spinner viewBox="0 0 16 16" width={props.size ?? 14} height={props.size ?? 14} class="animate-spin-lento text-neutral-500 motion-reduce:animate-none" aria-hidden="true">
      <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="2.2 2.4" />
    </svg>
  );
}

/**
 * El estado de la tarjeta, en el mismo cuadro que el menú (22×20): el loader,
 * el anillo de «recién creada» y el punto van al centro. La cara del agente no
 * entra aquí: si lo hiciera, el punto se iría a una esquina y dejaría de caer
 * sobre la hora.
 */
function CardMark(props: TaskActivity & { identityLabel?: string; provisional?: boolean; archivada?: boolean }) {
  const state = () => markedState(props);
  const label = () => [props.identityLabel, props.provisional ? t("projects.status.provisional") : taskLabel(state())].filter(Boolean).join(" · ");
  return <span class="task-card-identity" data-task-orbit role={label() ? "img" : undefined} title={label()} aria-label={label() || undefined}>
    <Show when={props.provisional} fallback={
      <Show when={state() === "working"} fallback={
        <Show when={state()}>
          <span class="task-card-badge"><SignalDot tone={taskSignalTone(state())} /></span>
        </Show>
      }><span class="task-card-orbit"><Spinner size={14} class="animate-spin-lento text-primary motion-reduce:animate-none" /></span></Show>
    }><span class="task-card-orbit"><RailDashedRing size={14} /></span></Show>
  </span>;
}

/**
 * La marca de la tarjeta del riel, a la derecha del título: un hueco de 16 px
 * que se queda vacío cuando no hay nada que decir.
 *
 * Trabajando es un arco que gira; recién creada, un anillo punteado más lento;
 * sin ver, un punto verde. Terminada y vista, detenida y vista o archivada no
 * llevan nada: lo dice la fila apagándose.
 */
function RailMark(props: TaskActivity & { provisional?: boolean; archivada?: boolean; plegadas?: boolean; size?: number }) {
  const state = () => markedState(props);
  const label = () => taskLabel(state(), !!props.plegadas);
  const lado = () => props.size ?? 14;
  return (
    <Switch>
      <Match when={props.provisional && !props.plegadas}>
        <span class="inline-flex shrink-0 items-center justify-center" title={t("projects.status.provisional")} aria-label={t("projects.status.provisional")}>
          <RailDashedRing size={lado()} />
        </span>
      </Match>
      <Match when={state() === "working"}>
        <span class="inline-flex shrink-0 items-center justify-center" title={label()} aria-label={label()}>
          <Spinner size={lado()} class="text-primary motion-reduce:animate-none" />
        </span>
      </Match>
      <Match when={state()}>
        <span class="inline-flex shrink-0 items-center justify-center" style={{ width: `${lado()}px`, height: `${lado()}px` }} title={label()} aria-label={label()}>
          <SignalDot tone={taskSignalTone(state())} />
        </span>
      </Match>
    </Switch>
  );
}

export default function EstadoDeTarea(props: TaskActivity & {
  ambito?: "tarea" | "plegadas";
  class?: string;
  /** Lado del icono; la fila del riel lo sube a 13. */
  size?: number;
  /** Las marcas de la tarjeta del riel (`Sessions.tsx`): arco, anillo, punto, centrados. */
  riel?: boolean;
  /** La tarjeta del riel: loader, anillo o punto en el cuadro del menú. */
  tarjeta?: boolean;
  identityLabel?: string;
  /** Recién creada: el motor todavía no la registra (`lib/taskDraft.ts`). */
  provisional?: boolean;
  archivada?: boolean;
}) {
  const lado = () => props.size ?? 12;
  const state = () => markedState(props);
  const label = () => taskLabel(state(), props.ambito === "plegadas");
  return <Show when={!props.tarjeta} fallback={<CardMark {...props} />}>
  <Show when={!props.riel} fallback={<RailMark {...props} plegadas={props.ambito === "plegadas"} />}>
  <Show when={state()}><span class={cn("inline-flex shrink-0 items-center gap-0.5", props.class)}>
    <span class={cn("inline-flex shrink-0 items-center justify-center", stateColor(state()))} style={{ width: `${lado()}px`, height: `${lado()}px` }} title={label()} aria-label={label()}>
      <SignalDot tone={taskSignalTone(state())} />
    </span>
  </span></Show>
  </Show></Show>;
}
