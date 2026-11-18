import ChevronRight from "lucide-solid/icons/chevron-right";
import { createMemo, createUniqueId, Index, type JSX, Show } from "solid-js";
import { t } from "../../../../lib/i18n";
import { sharedLazy } from "../../../../lib/sharedLazy";
import { partesDelTramo, type Paso } from "../../../../lib/steps";
import { cn } from "../../../../lib/utils";
import { Markdown } from "../../../../ui/Markdown";
import type { ActivityChunk } from "../../activityBlocks";
import { ActivityIndicator, ActivityCaption } from "./ActivityIndicator";
import McpAppView from "../../McpAppView";
import type { Msg, Razonamiento } from "../../messageTypes";
import LineaDeTiempo, { SUPERFICIE_DE_EJECUCION } from "../../Timeline";
import { presentActivity, type ActivityAction } from "../../activityPresentation";
type Avance = ActivityChunk<Msg>;
const SIN_AVANCE: Avance[] = [];
/** La cabecera de un tramo, entera o partida (ver `RegistroDeTrabajo`). */
const FILA_DEL_TRAMO =
  "inline-flex min-w-0 max-w-full items-center gap-2 rounded-sm py-1.5 text-left text-ui font-normal text-neutral-500 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary";
// Chunk aparte: el bloque de razonamiento solo lo carga un turno que lo trae.
const Reasoning = sharedLazy(() => import("../../Reasoning"));
export function RegistroDeTrabajo(props: {
  pasos: Paso[];
  /** Lo que el turno hizo y dijo antes de su respuesta; se pliega con los pasos. */
  avance?: Avance[];
  corriendo: boolean;
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
  const presentation = createMemo(() => presentActivity({ active: props.corriendo, stopping: props.stopping, blocked: props.blocked, paused: props.animando === false, duration: props.duracion, action: props.latestAction, label: props.label }));
  const rotulo = () => presentation().label;
  const hasContent = () => todos().length > 0 || avance().some(chunk => chunk.msg.razonamiento?.length || (!chunk.outside && chunk.msg.text)) || Boolean(props.razonamiento?.length);
  const inspectable = () => hasContent() || Boolean(!props.corriendo && props.duracion);
  const hasChanges = () => props.onVerCambios && partesDelTramo(todos(), props.corriendo).some(part => part.clase === "editar");
  const duracion = () =>
    !props.corriendo && props.duracion ? t("chat.work.duration", { duration: props.duracion }) : null;
  // El chevron y el cuerpo leen esto; si divergen, el primer clic abre lo que ya se veía abierto.
  const desplegado = () => Boolean(props.abierto);
  const chevron = () => (
    <ChevronRight
      size={13}
      strokeWidth={1.5}
      class={cn("shrink-0 transition-transform motion-reduce:transition-none", desplegado() && "rotate-90")}
      aria-hidden="true"
    />
  );
  const girando = () => <ActivityIndicator mode={!props.corriendo ? "finished" : presentation().animate ? "running" : "paused"} />;
  const blocked = () => props.corriendo && !props.stopping && props.blocked;
  const caption = () => <Show when={!blocked()} fallback={props.status?.()}><ActivityCaption active={presentation().animate} text={rotulo()} /></Show>;


  // Sin envoltorio y con los datos de la derecha en un solo texto: cada
  // elemento de más se multiplica por los tramos del hilo (`open-task-cost`).
  return (
    <>
      <span role="status" aria-live="polite" aria-atomic="true" class="sr-only">{props.corriendo && props.stopping ? t("chat.turn.stopping") : presentation().animate ? t("chat.turn.working_aria") : ""}</span>
      <Show
        when={inspectable() || props.corriendo || props.observed}
        fallback={<p class="m-0 mb-2 px-1 py-1.5 text-xs text-neutral-500">{duracion()}</p>}
      >
        <div class={cn("flex flex-wrap items-center gap-2", !desplegado() && "mb-2")}>
          <Show when={!inspectable()}><span class={FILA_DEL_TRAMO}><span class="activity-label inline-flex min-w-0 items-center">{girando()}{caption()}</span><Show when={props.corriendo && !props.stopping && !props.blocked}>{props.status?.()}</Show></span></Show>
          <Show when={inspectable()}>
            <button type="button" aria-expanded={desplegado()} aria-controls={panelId} onClick={() => props.onAlternar(!desplegado())} class={FILA_DEL_TRAMO}>
              <span class="activity-label inline-flex min-w-0 items-center">{girando()}{caption()}</span><Show when={props.corriendo && !props.stopping && !props.blocked}>{props.status?.()}</Show>{chevron()}
            </button>
          </Show>
          <Show when={hasChanges()}>
            <button type="button" onClick={() => props.onVerCambios?.()} class={FILA_DEL_TRAMO}>{t("chat.work.open_changes")}</button>
          </Show>
        </div>

        <Show when={desplegado()}>
          <div id={panelId} class={cn(SUPERFICIE_DE_EJECUCION, "mb-2")} data-turn-activity-content="">
            <Show when={!hasContent() && !props.corriendo}><p class="m-0 px-1 py-2 text-sm text-neutral-500">{t("chat.work.no_details")}</p></Show>
            <Index each={avance()}>
              {(tramo) => (
                <>
                  <Show when={tramo().pasos.length > 0}>
                    <LineaDeTiempo pasos={tramo().pasos} active={presentation().animate} individual />
                  </Show>
                  {/* La fila de siempre y no prosa suelta: dentro del pliegue
                      una ráfaga sin su rótulo se lee como algo que el agente dijo. */}
                  <Show when={tramo().msg.razonamiento?.length ? tramo().msg.razonamiento : null}>
                    {(bloques) => (
                      <Reasoning bloques={bloques()} />
                    )}
                  </Show>
                  <Show when={!tramo().outside}><div class="px-1 py-1 text-sm text-neutral-500"><Markdown>{tramo().msg.text}</Markdown></div></Show>
                </>
              )}
            </Index>
            <Show when={props.pasos.length > 0}>
              <LineaDeTiempo pasos={props.pasos} active={presentation().animate} individual />
            </Show>
            <Show when={props.razonamiento?.length ? props.razonamiento : null}>{(blocks) => <Reasoning bloques={blocks()} />}</Show>
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
