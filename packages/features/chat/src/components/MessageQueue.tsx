import { editMentions, finishEdit, trimMentions, type PendingEdit, type TaskMention } from "../../../../ui/src/lib/taskMentions";
import CornerDownLeft from "lucide-solid/icons/corner-down-left";
import Paperclip from "lucide-solid/icons/paperclip";
import Pause from "lucide-solid/icons/pause";
import Pencil from "lucide-solid/icons/pencil";
import Play from "lucide-solid/icons/play";
import RotateCcw from "lucide-solid/icons/rotate-ccw";
import SquareTerminal from "lucide-solid/icons/square-terminal";
import X from "lucide-solid/icons/x";
import { createSignal, For, onCleanup, Show } from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import type { Agent } from "../../../../ui/src/lib/model";
import { cn } from "../../../../ui/src/lib/utils";
import { Button } from "../../../../ui/src/Button";
import { Textarea } from "../../../../ui/src/Textarea";
import { deOtraTarea, esDeLaTerminal, interrumpible, type Encolado, type RazonDeRetencion } from "../../../../ui/src/lib/queue.ts";
import { OpenSenderTask } from "./OpenSenderTask";
export type { Encolado };


export type ColaDeMensajesProps = {
  compact?: boolean;
  items: Encolado[];
  pending?: string[];
  /** The transcript already presents this pending input; retain its queue controls without repeating its body. */
  handoffItemId?: string;
  agentes: Agent[];
  /** Con qué se responde ahora mismo, para marcar lo que se escribió con otra cosa. */
  actual: { agent: string; model: string };
  /**
   * Por qué la cola no sale sola. Es la razón y no un `boolean` porque **una no
   * se puede soltar a mano**: dejar salir la cola con una pregunta abierta haría
   * correr el turno siguiente sin el dato que el agente pidió.
   */
  retenida: RazonDeRetencion | null;
  onEditar: (id: string, text: string, mentions?: TaskMention[]) => void;
  onBorrar: (id: string) => void;
  /** Interrumpe el turno actual y envía el mensaje cuando su cierre esté confirmado. */
  onDetenerYEnviar: ((id: string) => Promise<void>) | null;
  /** Editar pausa la cola: un turno que cierra a mitad de la edición no se lleva el texto a medias. */
  onEditando: (activo: boolean) => void;
  onMandar: () => void;
  /** Reenvía como mensaje nuevo uno que quizá ya salió: puede llegar dos veces. */
  onReenviar: (id: string) => void;
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

  // Una razón o una edición abierta se ven igual porque significan lo mismo:
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
            <Show when={props.retenida === "manual"}>
              <span class="truncate text-xs text-neutral-500">{t("chat.queue.manual")}</span>
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
                            {(sender) => <OpenSenderTask sender={sender} onOpenTask={props.onOpenTask} />}
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
                        {props.handoffItemId === it.id ? t("chat.activity.preparing") : it.text}
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
                      <Show when={it.uncertain}>
                        <span class="text-xs text-warning-strong">{t("chat.queue.uncertain")}</span>
                        <Button type="button" variant="ghost" size="icon" class="size-7" aria-label={t("chat.queue.send_again_aria", { n: i() + 1 })}
                          title={t("chat.queue.send_again")} disabled={props.pending?.includes(it.id)} onClick={() => props.onReenviar(it.id)}>
                          <RotateCcw size={13} />
                        </Button>
                      </Show>
                      <Show when={interrumpible(it) && !it.uncertain ? props.onDetenerYEnviar : null}>
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
                            <CornerDownLeft size={13} />
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
