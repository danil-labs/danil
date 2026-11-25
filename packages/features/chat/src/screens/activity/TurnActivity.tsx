import ChevronRight from "lucide-solid/icons/chevron-right";
import { createMemo, createUniqueId, For, Index, type JSX, Match, Show, Switch } from "solid-js";
import { t } from "../../../../../ui/src/lib/i18n";
import { sharedLazy } from "../../../../../ui/src/lib/sharedLazy";
import { partesDelTramo, type Paso } from "../../../../../ui/src/lib/steps";
import { cn } from "../../../../../ui/src/lib/utils";
import { Markdown } from "../../../../../ui/src/Markdown";
import type { ActivityChunk } from "../../model/activityBlocks";
import { ActivityIndicator, ActivityCaption } from "../../components/activity/ActivityIndicator";
import McpAppView from "../McpAppView";
import type { Msg, Razonamiento } from "../../model/messageTypes";
import LineaDeTiempo, { SUPERFICIE_DE_EJECUCION } from "../../components/Timeline";
import { currentActivityAction, isConcreteActivityLabel, presentActivity, type ActivityAction } from "../../model/activityPresentation";
import { buildActivityTimeline } from "../../model/activityTimeline";
import type { TurnOutcome } from "../../model/turnActivity";
import { Pressable } from "../../../../../ui/src/Pressable";
type Avance = ActivityChunk<Msg>;
const SIN_AVANCE: Avance[] = [];
/** La cabecera de un tramo, entera o partida (ver `RegistroDeTrabajo`). */
const FILA_DEL_TRAMO =
  "inline-flex min-w-0 max-w-full items-center gap-2 rounded-sm py-0.5 text-left text-ui font-normal text-neutral-500 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary";
// Chunk aparte: el bloque de razonamiento solo lo carga un turno que lo trae.
const Reasoning = sharedLazy(() => import("../../components/Reasoning"));
export function RegistroDeTrabajo(props: {
  pasos: Paso[];
  /** Lo que el turno hizo y dijo antes de su respuesta; se pliega con los pasos. */
  avance?: Avance[];
  /** Mensajes cronológicos del turno (cuando vienen de `TurnActivity`). */
  messages?: readonly Msg[];
  corriendo: boolean;
  outcome?: TurnOutcome;
  stopping?: boolean;
  latestAction?: ActivityAction | null;
  status?: () => JSX.Element;
  blocked?: boolean;
  observed?: boolean;
  label?: string;
  duracion?: string | null;
  abierto?: boolean;
  onAlternar: (abierto: boolean) => void;
  razonamiento?: Razonamiento[];
  animando?: boolean;
  /** Con él, «Editó N archivos» abre los cambios en el panel de la tarea. */
  onVerCambios?: () => void;
}) {
  const panelId = createUniqueId();
  // Sin contar los pasos con error: fallar y reintentar es normal en un turno
  // correcto, y «1 con error» alarmaba. El fallo del turno va aparte.
  const avance = () => props.avance ?? SIN_AVANCE;
  const todos = createMemo(() => [...avance().flatMap((a) => a.pasos), ...props.pasos]);
  const runningSteps = createMemo(() => todos().filter((step) => step.corriendo).length);
  const action = createMemo(() => currentActivityAction(props.latestAction, todos()));
  const presentation = createMemo<{ label: string; animate: boolean }>((previous) => {
    const fallbackLabel =
      (props.corriendo || props.stopping) && previous && isConcreteActivityLabel(previous.label)
        ? previous.label
        : null;
    return presentActivity({
      active: props.corriendo,
      outcome: props.outcome,
      stopping: props.stopping,
      blocked: props.blocked,
      paused: props.animando === false,
      duration: props.duracion,
      action: action(),
      reasoning: props.razonamiento,
      runningSteps: runningSteps(),
      label: props.label,
      fallbackLabel,
    });
  });
  const rotulo = () => presentation().label;
  // Solo cicla palabras genéricas («Pensando…», «Cavilando…») cuando aún no llegó un título vivo.
  const genericThinking = () => action()?.kind === "thinking" && rotulo() === t("chat.reasoning.thinking");
  const hasContent = () => todos().length > 0 || avance().some(chunk => chunk.msg.razonamiento?.length || (!chunk.outside && chunk.msg.text)) || Boolean(props.razonamiento?.length);
  // Solo hay dropdown (>) si realmente hubo herramientas, lecturas o razonamiento.
  // Un turno sin herramientas ni razonamiento solo muestra «Trabajó durante Xs».
  const inspectable = () => hasContent();
  const hasChanges = () => props.onVerCambios && partesDelTramo(todos(), props.corriendo).some(part => part.clase === "editar");
  const duracion = () =>
    !props.corriendo && props.outcome !== "failed" && props.outcome !== "interrupted" && props.duracion
      ? t("chat.work.duration", { duration: props.duracion })
      : null;
  const timeline = createMemo(() => buildActivityTimeline(props.messages, props.pasos, props.razonamiento));
  // El chevron y el cuerpo leen esto; si divergen, el primer clic abre lo que ya se veía abierto.
  const desplegado = () => inspectable() && Boolean(props.abierto);
  const chevron = () => (
    <ChevronRight
      size={13}
      strokeWidth={1.5}
      class={cn("shrink-0 transition-transform motion-reduce:transition-none", desplegado() && "rotate-90")}
      aria-hidden="true"
    />
  );
  // Parar sigue siendo el mismo tramo: si el indicador pasa a «terminó», la fila encoge antes del siguiente globo.
  const sigue = () => props.corriendo || Boolean(props.stopping);
  const girando = () => <ActivityIndicator mode={!sigue() ? "finished" : presentation().animate ? "running" : "paused"} />;
  const blocked = () => props.corriendo && !props.stopping && props.blocked;
  const caption = () => <Show when={!blocked()} fallback={props.status?.()}><ActivityCaption active={presentation().animate} thinking={genericThinking()} text={rotulo()} /></Show>;
  const showHeader = () => inspectable() || sigue();


  // Sin envoltorio y con los datos de la derecha en un solo texto: cada
  // elemento de más se multiplica por los tramos del hilo (`open-task-cost`).
  return (
    <>
      <span role="status" aria-live="polite" aria-atomic="true" class="sr-only">{sigue() && props.stopping ? t("chat.turn.stopping") : presentation().animate ? t("chat.turn.working_aria") : ""}</span>
      <Show
        when={showHeader()}
        fallback={<Show when={duracion()}>{(text) => <p class={cn("m-0 py-0.5 text-ui font-normal text-neutral-500", !props.observed && "mb-1")} data-activity-label="">{text()}</p>}</Show>}
      >
        <div class={cn("flex flex-wrap items-center gap-2", !desplegado() && !props.observed && "mb-1")}>
          <Show when={!inspectable()}><span class={FILA_DEL_TRAMO}><span class="activity-label inline-flex min-w-0 items-center">{girando()}{caption()}</span><Show when={props.corriendo && !props.stopping && !props.blocked}>{props.status?.()}</Show></span></Show>
          <Show when={inspectable()}>
            <Pressable aria-expanded={desplegado()} aria-controls={panelId} onClick={() => props.onAlternar(!desplegado())} class={FILA_DEL_TRAMO}>
              <span class="activity-label inline-flex min-w-0 items-center">{girando()}{caption()}</span><Show when={props.corriendo && !props.stopping && !props.blocked}>{props.status?.()}</Show>{chevron()}
            </Pressable>
          </Show>
          <Show when={hasChanges()}>
            <Pressable onClick={() => props.onVerCambios?.()} class={FILA_DEL_TRAMO}>{t("chat.work.open_changes")}</Pressable>
          </Show>
        </div>

        <Show when={desplegado()}>
          <div id={panelId} class={cn(SUPERFICIE_DE_EJECUCION, !props.observed && "mb-1")} data-turn-activity-content="">
            <Index each={avance()}>
              {(tramo, index) => (
                <>
                  <Show when={tramo().pasos.length > 0}>
                    <LineaDeTiempo pasos={tramo().pasos} active={presentation().animate && !props.stopping} individual />
                  </Show>
                  {/* La fila de siempre y no prosa suelta: dentro del pliegue
                      una ráfaga sin su rótulo se lee como algo que el agente dijo. */}
                  <Show when={tramo().msg.razonamiento?.length ? tramo().msg.razonamiento : null}>
                    {(bloques) => (
                      <Reasoning bloques={bloques()} slot={`avance-${index}`} />
                    )}
                  </Show>
                  <Show when={!tramo().outside}><div class="px-1 py-1 text-sm text-neutral-500"><Markdown>{tramo().msg.text}</Markdown></div></Show>
                </>
              )}
            </Index>
            <For each={timeline()}>
              {(item, index) => (
                <Switch>
                  <Match when={item.kind === "steps" ? item : null}>
                    {(entry) => <LineaDeTiempo pasos={entry().pasos} active={presentation().animate && !props.stopping} individual />}
                  </Match>
                  <Match when={item.kind === "reasoning" ? item : null}>
                    {(entry) => (
                      <Reasoning
                        bloques={entry().bloques}
                        slot={`timeline-${index()}`}
                        active={presentation().animate && !props.stopping && action()?.kind === "thinking" && index() === timeline().length - 1}
                      />
                    )}
                  </Match>
                </Switch>
              )}
            </For>
      <Index each={todos()}>
        {(step) => (
          <Show when={!step().corriendo && step().mcpApp}>
            {(call) => <McpAppView call={call()} />}
          </Show>
        )}
      </Index>
          </div>
        </Show>
      </Show>

    </>
  );
}
