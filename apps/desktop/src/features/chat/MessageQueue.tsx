import type { Recipient, ReplyTo, SenderTask } from "../../lib/recipients";
import { editMentions, finishEdit, trimMentions, type PendingEdit, type TaskMention } from "../../lib/taskMentions";
import CircleStop from "lucide-solid/icons/circle-stop";
import CornerDownLeft from "lucide-solid/icons/corner-down-left";
import Paperclip from "lucide-solid/icons/paperclip";
import Pause from "lucide-solid/icons/pause";
import Pencil from "lucide-solid/icons/pencil";
import Play from "lucide-solid/icons/play";
import SquareTerminal from "lucide-solid/icons/square-terminal";
import X from "lucide-solid/icons/x";
import { createSignal, For, onCleanup, Show } from "solid-js";
import { t } from "../../lib/i18n";
import { cn } from "../../lib/utils";
import type { Agent } from "../../lib/model";
import { Button } from "../../ui/Button";
import { Textarea } from "../../ui/Textarea";
import { deOtraTarea, esDeLaTerminal, inyectable } from "./queue";

// Conserva la configuración al encolar; el lote adopta la del último mensaje.
export type Encolado = {
  id: string;
  text: string;
  task_mentions?: TaskMention[];
  provider: string;
  model: string | null;
  effort: string | null;
  /**
   * Con cuánta vigilancia se escribió, capturado al encolar como el modelo.
   *
   * Es del mensaje y no de la caja porque un turno encolado puede salir minutos
   * después: si leyera el modo del momento de despacharse, alguien que cambiara
   * a automático mientras espera se encontraría con que lo que escribió para
   * aprobar a mano ya se hizo solo.
   */
  permission_mode: string | null;
  attachments: string[];
  /**
   * A quién va dirigido. Sin él, lo que se escribió para un encargado sale
   * como un turno más de esta conversación.
   */
  recipients?: Recipient[];
  /**
   * El sobre de una entrega que la cola guardó mientras el chat contestaba
   * (`runtime/chat/queue.rs`). La cola la vacía la ventana: lo que no se
   * devuelva aquí aterriza firmado como de la persona y sin dónde contestar.
   */
  agent?: string | null;
  /** Por qué canal lo escribió la persona (`Turn::channel`). */
  channel?: string | null;
  reply_to?: ReplyTo | null;
  /** Cuántos saltos entre encargados lleva. Se cuenta y se pinta, no se limita. */
  hops?: number | null;
  /** La tarea que lo mandó por el CLI (`Turn::from_task`). */
  from_task?: SenderTask | null;
  /**
   * El escritorio activo al encolarlo, no al salir: lo que lance un chat de
   * agente en ese turno cae ahí (`spaces::TurnDesk`).
   */
  space?: string | null;
};

export type ColaDeMensajesProps = {
  compact?: boolean;
  items: Encolado[];
  pending?: string[];
  agentes: Agent[];
  /** Con qué se responde ahora mismo, para marcar lo que se escribió con otra cosa. */
  actual: { agent: string; model: string };
  /**
   * Por qué la cola no avanza sola: falló el turno anterior, quedó de otra
   * sesión, o el agente preguntó algo que nadie ha contestado.
   *
   * Es la razón y no un `boolean` porque **una de las tres no se puede soltar a
   * mano**: dejar salir la cola con una pregunta abierta haría correr el turno
   * siguiente sin el dato que el agente pidió, que es la forma educada de
   * adivinar igual.
   */
  retenida: null | "fallo" | "borrador" | "pregunta" | "session";
  /**
   * Con `session`: el título de la sesión ocupada a
   * la que se espera. La cola sale sola cuando esa tarea termina.
   */
  esperandoA?: string | null;
  onEditar: (id: string, text: string, mentions?: TaskMention[]) => void;
  onBorrar: (id: string) => void;
  /**
   * Mete el mensaje en el turno que ya corre, en vez de esperar a que cierre.
   * `null` cuando el agente no lo admite: no todos aceptan entrada con el turno
   * vivo, y un botón que no hace nada es peor que no tenerlo.
   */
  onMandarAhora: ((id: string) => Promise<void>) | null;
  /**
   * Lo mismo que hace la persona a mano cuando el agente no recibe mensajes a
   * medias: detener el turno y dejar salir esta cola. `null` cuando el agente
   * sí los recibe —ahí va `onMandarAhora`— o cuando no hay turno vivo.
   *
   * No es un steer y no se disfraza de uno: el paso que estaba corriendo se
   * pierde, y eso lo dice el título.
   */
  onDetenerYEnviar: ((id: string) => void) | null;
  /** Editar pausa la cola: un turno que cierra a mitad de la edición no se lleva el texto a medias. */
  onEditando: (activo: boolean) => void;
  onMandar: () => void;
  /** Abre la tarea que mandó una entrega. */
  onOpenTask?: (folder: string, task: string, machine?: string | null) => void;
};

/**
 * Lo que va a salir cuando termine el turno, en orden, editable y borrable.
 *
 * Se escribe **antes** de ver la respuesta, así que cuando llega su momento la
 * mitad de las veces ya no dice lo que se quería: por eso cada elemento se
 * puede reescribir y quitar sin gastar un turno en corregirlo.
 *
 * Quitar no toca la carpeta de trabajo; solo pierde un texto que aún no salió.
 */
export default function ColaDeMensajes(props: ColaDeMensajesProps) {
  const [editando, setEditando] = createSignal<string | null>(null);
  const [borrador, setBorrador] = createSignal("");
  const [mentions, setMentions] = createSignal<TaskMention[]>([]);
  let pendingEdit: PendingEdit | undefined;
  let mentionHistory: { text: string; task_mentions: TaskMention[] }[] = [];

  /**
   * Si la cola desaparece con una edición abierta —cambio de sesión, de
   * proyecto— la pausa se iría con ella y no volvería nadie a quitarla.
   *
   * La limpieza lee `props.onEditando` al desmontarse, así que siempre reanuda
   * usando el callback vigente.
   */
  onCleanup(() => props.onEditando(false));

  function abrir(it: Encolado) {
    setEditando(it.id);
    setBorrador(it.text);
    setMentions(it.task_mentions ?? []);
    pendingEdit = undefined;
    mentionHistory = [];
    props.onEditando(true);
  }

  function cerrar() {
    setEditando(null);
    props.onEditando(false);
  }

  function guardar(id: string) {
    if (!borrador().trim() && !props.items.find(item => item.id === id)?.attachments.length) return;
    const message = trimMentions({ text: borrador(), task_mentions: mentions() });
    props.onEditar(id, message.text, message.task_mentions);
    cerrar();
  }

  // Las tres razones por las que la cola no avanza —falló el turno, quedó de
  // otra sesión, se está editando— se ven igual porque significan lo mismo:
  // de aquí no sale nada hasta que alguien haga algo.
  const parada = () => props.retenida !== null || editando() !== null;

  return (
    <Show when={props.items.length > 0}>
      <div class={cn("mb-1.5 w-full", props.compact ? "px-1 py-1" : "rounded-md border border-border bg-surface p-1.5")}>
        <Show when={props.items.length > 0}>
          <div class="flex items-center gap-2 px-1 pb-1">
            <Show when={parada()}>
              <Pause
                size={12}
                class="shrink-0 text-warning-strong"
                aria-hidden="true"
              />
            </Show>
            <span class={cn("text-xs", props.compact ? "font-medium text-neutral-500" : "font-semibold text-neutral-700")}>
              {t("chat.queue.label")} ·{" "}
              <span class="tabular-nums">{props.items.length}</span>
            </span>
            <Show when={props.retenida === "session" && props.esperandoA}>
              {(tarea) => (
                <span class="truncate text-xs text-neutral-500">
                  {t("chat.queue.waiting_for", { tarea: tarea() })}
                </span>
              )}
            </Show>
            {/* Con una pregunta abierta no hay «mandar»: lo de la cola se
                escribió sin la respuesta, y soltarlo la daría por contestada. Se
                contesta arriba y la cola sigue sola. */}
            <Show
              when={
                props.retenida !== null &&
                props.retenida !== "pregunta" &&
                editando() === null
              }
            >
              <Button
                type="button"
                variant="secondary"
                size="sm"
                class="ml-auto min-h-7 gap-1.5 px-2 text-xs"
                onClick={props.onMandar}
              >
                <Play size={12} />
                {t("chat.queue.send")}
              </Button>
            </Show>
          </div>
        </Show>

        <ol class={cn("m-0 grid list-none gap-0.5 p-0", props.compact && "max-h-40 overflow-y-auto")}>
          <For each={props.items}>
            {(it, i) => (
              <Show
                when={editando() === it.id}
                fallback={
                  <li class={cn("group flex items-start gap-2 px-1.5 py-1 hover:bg-surface-muted", props.compact ? "rounded-lg" : "rounded-sm")}>
                    <span class="mt-1 w-3.5 shrink-0 text-right text-xs text-neutral-500 tabular-nums">
                      {i() + 1}
                    </span>
                    <Show when={esDeLaTerminal(it)}>
                      <SquareTerminal
                        size={13}
                        class="mt-1 shrink-0 text-neutral-500"
                        role="img"
                        aria-label={t("chat.queue.terminal")}
                      />
                    </Show>
                    <span class="mt-0.5 flex min-w-0 flex-1 flex-col">
                      <Show when={deOtraTarea(it)}>
                        <span class="text-xs text-neutral-500" data-queue-from="task">
                          {it.from_task
                            ? t("chat.queue.from_task", { title: it.from_task.title })
                            : t("chat.queue.from_agent", { name: it.agent ?? "" })}
                          <Show when={props.onOpenTask ? it.from_task : null}>
                            {(sender) => (
                              <>
                                {" — "}
                                <button
                                  type="button"
                                  class="cursor-pointer underline underline-offset-2"
                                  aria-label={t("chat.recipients.open_task", { title: sender().title })}
                                  onClick={() => props.onOpenTask?.(sender().folder, sender().task, sender().machine)}
                                >
                                  {t("chat.task_completed.open")}
                                </button>
                              </>
                            )}
                          </Show>
                        </span>
                      </Show>
                      <span
                        class={cn(
                          "min-w-0 text-sm break-words text-neutral-700",
                          props.compact ? "line-clamp-1" : "line-clamp-2",
                          esDeLaTerminal(it) && "font-mono text-ui",
                        )}
                        title={props.compact ? it.text : undefined}
                      >
                        {it.text}
                      </span>
                    </span>

                    {/* Solo cuando difiere de lo que hay puesto ahora: eso es lo
                        que hay que ver, y verlo en cada renglón sería ruido. */}
                    <Show
                      when={
                        it.provider !== props.actual.agent ||
                        (it.model ?? "") !== props.actual.model
                      }
                    >
                      <span class="mt-1 shrink-0 rounded-sm bg-surface-muted px-1.5 py-0.5 text-[0.62rem] font-semibold tracking-wide text-neutral-700 uppercase">
                        {props.agentes.find((a) => a.id === it.provider)?.label ??
                          it.provider}
                        {` · ${it.model ?? t("chat.queue.default_model")}`}
                      </span>
                    </Show>

                    <Show when={it.attachments.length > 0}>
                      <span class="mt-1 flex shrink-0 items-center gap-1 text-[0.62rem] font-semibold text-neutral-700 tabular-nums">
                        <Paperclip size={11} />
                        {it.attachments.length}
                      </span>
                    </Show>

                    <span class="flex shrink-0 items-center gap-0.5">
                      <Show when={inyectable(it) ? props.onMandarAhora : null}>
                        {(mandar) => (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            class="size-7"
                            aria-label={t("chat.queue.send_now_aria", { n: i() + 1 })}
                            title={t("chat.queue.send_now")}
                            disabled={props.pending?.includes(it.id)}
                            onClick={() => mandar()(it.id)}
                          >
                            <CornerDownLeft size={13} />
                          </Button>
                        )}
                      </Show>
                      <Show when={inyectable(it) ? props.onDetenerYEnviar : null}>
                        {(parar) => (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            class="size-7"
                            aria-label={t("chat.queue.stop_and_send_aria", { n: i() + 1 })}
                            title={t("chat.queue.stop_and_send")}
                            disabled={props.pending?.includes(it.id)}
                            onClick={() => parar()(it.id)}
                          >
                            <CircleStop size={13} />
                          </Button>
                        )}
                      </Show>
                      <Show when={!deOtraTarea(it)}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        class="size-7"
                        aria-label={t("chat.queue.edit_aria", { n: i() + 1 })}
                        title={t("chat.queue.edit")}
                        disabled={props.pending?.includes(it.id)}
                        onClick={() => abrir(it)}
                      >
                        <Pencil size={13} />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        class="size-7"
                        aria-label={t("chat.queue.remove_aria", { n: i() + 1 })}
                        title={t("chat.queue.remove")}
                        disabled={props.pending?.includes(it.id)}
                        onClick={() => props.onBorrar(it.id)}
                      >
                        <X size={13} />
                      </Button>
                      </Show>
                    </span>
                  </li>
                }
              >
                <li class="grid grid-cols-[0.875rem_minmax(0,1fr)] items-start gap-x-2 gap-y-1.5 rounded-sm bg-surface-muted p-1.5">
                  {/* El número se queda: sin él la lista salta de 1 a 3 y se
                      pierde cuál se está tocando. */}
                  <span class="mt-2 text-right text-xs text-neutral-500 tabular-nums">
                    {i() + 1}
                  </span>
                  {/* Sin ceder ante la caja de escribir: editar lo pidió la persona, y en
                      WebKit el clic en «Editar» deja el foco donde estaba. */}
                  <Textarea
                    ref={(el) => queueMicrotask(() => el.focus())}
                    rows={2}
                    class="max-h-40"
                    value={borrador()}
                    onBeforeInput={(e) => {
                      pendingEdit = { text: e.currentTarget.value, start: e.currentTarget.selectionStart,
                        end: e.currentTarget.selectionEnd, inputType: e.inputType };
                    }}
                    onInput={(e) => {
                      const value = e.currentTarget.value;
                      const before = { text: borrador(), task_mentions: mentions() };
                      mentionHistory = [...mentionHistory, before].slice(-100);
                      const restored = e.inputType?.startsWith("history") ? [...mentionHistory].reverse().find(h => h.text === value) : undefined;
                      setMentions(restored?.task_mentions ?? editMentions(before, value, finishEdit(pendingEdit, value)));
                      pendingEdit = undefined;
                      setBorrador(value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        e.preventDefault();
                        cerrar();
                        return;
                      }
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        guardar(it.id);
                      }
                    }}
                  />
                  <div class="col-start-2 flex items-center justify-end gap-1.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      class="min-h-7 text-xs"
                      onClick={cerrar}
                    >
                      {t("chat.queue.discard")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      class="min-h-7 text-xs"
                      disabled={!borrador().trim() && it.attachments.length === 0}
                      title={
                        borrador().trim() || it.attachments.length > 0
                          ? undefined
                          : t("chat.queue.empty_blocked")
                      }
                      onClick={() => guardar(it.id)}
                    >
                      {t("chat.queue.save")}
                    </Button>
                  </div>
                </li>
              </Show>
            )}
          </For>
        </ol>
      </div>
    </Show>
  );
}
