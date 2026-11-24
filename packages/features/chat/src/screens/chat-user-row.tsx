import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { modelBrand } from "../../../../../apps/desktop/src/lib/models";
import { cn } from "../../../../ui/src/lib/utils";
import { Pressable } from "../../../../ui/src/Pressable";
import { MarcaAgente } from "../../../../ui/src/icons";
import Adjuntos from "../components/Attachments";
import { HistoryDetails } from "../components/HistoryDetails";
import { MessageText } from "../components/MessageText";
import { BotonCopiar, HoraDelTurno } from "../components/thread/MessageDecorations";
import type { Msg } from "../model/messageTypes";
import type { createChatAttachments } from "./chat-attachments";
import type { createChatBlocks } from "./chat-blocks";
import type { createChatComposerState } from "./chat-composer-state";
import { FILA_DEL_MENSAJE, type Bloque } from "./chat-model";
import type { ChatProps } from "./chat-props";
import { For, Show } from "solid-js";
import { Dynamic } from "solid-js/web";

/** Lo que el bloque usa del cuerpo de Chat. */
export type ChatUserRowDeps = { claveFila: ReturnType<typeof createChatBlocks>["claveFila"]; commandNames: ReturnType<typeof createChatComposerState>["commandNames"]; copiado: ReturnType<typeof createChatComposerState>["copiado"]; copiando: ReturnType<typeof createChatComposerState>["copiando"]; copiarMensaje: ReturnType<typeof createChatAttachments>["copiarMensaje"]; presentation: ReturnType<typeof createChatComposerState>["presentation"]; skillNames: ReturnType<typeof createChatComposerState>["skillNames"] };

/** Movido tal cual de Chat.tsx (el componente `Chat`, tarea 2.6). Lo que usa del cuerpo de Chat llega por `deps`. */
export function createChatUserRow(props: ChatProps, deps: ChatUserRowDeps) {
  const { claveFila, commandNames, copiado, copiando, copiarMensaje, presentation, skillNames } = deps;
  const filaDeUsuario = (m: () => Msg, b: () => Bloque, indice: () => number) => {
                    const entrante = () => !!(m().encargado || m().fromTask);
                    // El input de la persona va a la derecha; el de un encargado
                    // u otra tarea, a la izquierda con su cara en el margen de
                    // 52 px del hilo: meterla en el globo encoge el hilo.
                    return (
                    <div class={entrante() ? "col-start-1 -ml-[52px] flex min-w-0 items-end gap-2" : "col-start-1 min-w-0"}>
                    {/* Despierto, no dormido ni trabajando: la cara firma
                        quién escribió el input, no en qué anda ahora. Con
                        `asleep` el globo de quien acaba de hablar salía gris y
                        con los ojos cerrados; el estado vivo se lee en el riel
                        y en la cabecera. */}
                    <Show when={m().encargado}>
                      {(name) => (
                        <div class="shrink-0 self-end pb-9">
                          {props.renderAvatar({ name: name(), status: "awake", body: props.bodyOf?.(name()), avatar: props.avatarOf?.(name()), size: 44 })}
                        </div>
                      )}
                    </Show>
                    {/* Una tarea sin encargado no tiene cuerpo celeste: su cara
                        es el icono de su agente, con el modelo al pasar encima. */}
                    <Show when={!m().encargado ? m().fromTask : undefined}>
                      {(sender) => (
                        <div class="shrink-0 self-end pb-9">
                          <div
                            class="flex size-11 items-center justify-center rounded-full bg-neutral-200"
                            title={sender().model ?? sender().provider}
                          >
                            <MarcaAgente id={modelBrand(sender().provider, sender().model)} size={22} />
                          </div>
                        </div>
                      )}
                    </Show>
                    <article
                      class={cn(
                        "group/mensaje min-w-0",
                        entrante() ? presentation().incomingMessage : presentation().userMessage,
                      )}
                    >
                      <Show when={m().historyRefs?.length}><HistoryDetails refs={m().historyRefs!} turnId={m().turno} route={props.machineOf} /></Show>
                      <Show when={entrante()}>
                        <div class="mb-1 flex justify-start gap-1 text-[0.72rem] text-neutral-500" data-sender={m().encargado ? "agent" : "task"}>
                          <Show when={m().encargado}>
                            {(name) => <span class="font-semibold">{name()}</span>}
                          </Show>
                          <Show when={m().fromTask}>
                            {(sender) => (
                              <>
                                <Show when={m().encargado}><span aria-hidden="true">·</span></Show>
                                <Pressable
                                  class={cn("truncate underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-primary", !m().encargado && "font-semibold")}
                                  aria-label={t("chat.recipients.open_task", { title: sender().title })}
                                  onClick={() => props.onOpenTask?.(sender().folder, sender().task, sender().machine)}
                                >
                                  {sender().title}
                                </Pressable>
                              </>
                            )}
                          </Show>
                        </div>
                      </Show>
                      <Show when={m().relevo}>
                        {(relevo) => (
                          <div class="mb-1 text-right text-[0.72rem] text-neutral-500">
                            {t("chat.subagent.relayed", { title: relevo().titulo })}
                          </div>
                        )}
                      </Show>
                      <Show when={!m().encargado && !m().fromTask ? m().channel : undefined}>
                        {(channel) => (
                          <div class="mb-1 text-right text-[0.72rem] text-neutral-500">
                            {t("chat.recipients.via", { channel: channel() })}
                          </div>
                        )}
                      </Show>
                      {/* Dónde se contesta, cuando no es aquí. Va con la firma
                          y no dentro del globo: es del sobre, no del texto. */}
                      <Show when={m().reply_to}>
                        {(r) => (
                          <div class={cn("mb-1 text-[0.7rem] text-neutral-500", entrante() ? "text-left" : "text-right")}>
                            {t("chat.recipients.reply_in", { task: r().task, folder: r().folder })}
                          </div>
                        )}
                      </Show>
                      <Dynamic component={entrante() ? presentation().IncomingBubble : presentation().UserBubble}>
                        {/* La línea de dirección: a quién se le entregó esto.
                            Encima de los adjuntos y no entre ellos: no es
                            algo que se adjuntó. Con dos destinatarios, dos
                            caras y un solo turno en el hilo de origen. */}
                        <Show when={m().recipients?.length}>
                          <div class="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.72rem] text-neutral-900">
                            <span>{t("chat.recipients.to")}</span>
                            <For each={m().recipients!}>
                              {(r) => (
                                <span class="flex items-center gap-1 font-semibold text-primary">
                                  {props.renderAvatar({ name: r.name, status: "awake", body: props.bodyOf?.(r.name), avatar: props.avatarOf?.(r.name), size: 18 })}
                                  {r.name}
                                </span>
                              )}
                            </For>
                          </div>
                        </Show>
                        {/* Encima del texto, que es donde se adjuntó: en la
                            caja el archivo va sobre lo que se escribe, y el
                            mensaje mandado tiene que leerse igual que se
                            compuso. */}
                        <Show when={m().attachments?.length}>
                          <Adjuntos
                            rels={m().attachments!}
                            miniatura={props.onMiniatura}
                            preview={props.onPreview}
                            renderPdf={props.renderPdf}
                          />
                        </Show>
                        {/* Lo que se mencionó se sigue viendo como referencia
                            después de mandarlo: si en la transcripción volviera
                            a ser texto plano, la estructura solo existiría
                            mientras se escribe. */}
                        <Show when={m().text}>
                          <MessageText
                            incoming={entrante()}
                            text={m().text}
                            searchBlock={indice()}
                            taskMentions={m().task_mentions}
                            commands={commandNames()}
                            skills={skillNames()}
                            onOpenTask={props.onOpenTask}
                          />
                        </Show>
                        <Show when={!m().text && m().meta === "hidden_task"}>
                          <p class="m-0 leading-[1.5] italic text-neutral-500">
                            {t("chat.subagent.hidden_task")}
                          </p>
                        </Show>
                      </Dynamic>
                      <div class={cn(FILA_DEL_MENSAJE, entrante() ? "justify-start -ml-1.5" : "justify-end -mr-1.5")}>
                        <HoraDelTurno at={m().at} />
                        <Show when={m().text}>
                          <BotonCopiar
                            copiando={copiando() === claveFila(b())}
                            copiado={copiado() === claveFila(b())}
                            onCopiar={() => void copiarMensaje(claveFila(b()), m().text)}
                          />
                        </Show>
                      </div>
                    </article>
                    </div>
                    );
  };
  return { filaDeUsuario };
}
