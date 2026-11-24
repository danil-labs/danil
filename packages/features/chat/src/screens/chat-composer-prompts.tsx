import { enfocar } from "../../../../ui/src/lib/focus";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { searchTasks } from "../../../../ui/src/lib/taskMentions";
import { cn } from "../../../../ui/src/lib/utils";
import { Button } from "../../../../ui/src/Button";
import { MarcaFuente } from "../../../../ui/src/sources";
import BloqueDeInterrupcion from "../components/InterruptionBlock";
import Preguntas from "../components/Questions";
import Suggestions from "../components/Suggestions";
import type { createChatComposerInput } from "./chat-composer-input";
import type { createChatComposerState } from "./chat-composer-state";
import type { ChatProps } from "./chat-props";
import type { createChatTurnState } from "./chat-turn-state";
import Maximize2 from "lucide-solid/icons/maximize-2";
import { Show } from "solid-js";
import { Portal } from "solid-js/web";

/** Lo que el bloque usa del cuerpo de Chat. */
export type ChatComposerPromptsDeps = { cancelarPregunta: ReturnType<typeof createChatTurnState>["cancelarPregunta"]; insertSuggestion: ReturnType<typeof createChatComposerInput>["insertSuggestion"]; menuAnchor: ReturnType<typeof createChatTurnState>["menuAnchor"]; menuOpen: ReturnType<typeof createChatComposerInput>["menuOpen"]; picked: ReturnType<typeof createChatComposerInput>["picked"]; preguntaPendiente: ReturnType<typeof createChatTurnState>["preguntaPendiente"]; preguntaPlegada: ReturnType<typeof createChatComposerState>["preguntaPlegada"]; setPlegadaEn: ReturnType<typeof createChatComposerState>["setPlegadaEn"]; suggestions: ReturnType<typeof createChatComposerInput>["suggestions"]; trigger: ReturnType<typeof createChatComposerState>["trigger"] };

/** Movido tal cual de Chat.tsx (el componente `Chat`, tarea 2.6). Lo que usa del cuerpo de Chat llega por `deps`. */
export function createChatComposerPrompts(props: ChatProps, deps: ChatComposerPromptsDeps) {
  const { cancelarPregunta, insertSuggestion, menuAnchor, menuOpen, picked, preguntaPendiente, preguntaPlegada, setPlegadaEn, suggestions, trigger } = deps;
  const MenuDeSugerencias = () => (
      <Show when={menuOpen() && menuAnchor()}>
        {(punto) => (
          <Portal>
            <div
              class="fixed z-50"
              style={{ top: `${punto().top}px`, left: `${punto().left}px`, width: `${punto().width}px` }}
            >
              <Suggestions
                items={suggestions()}
                index={picked()}
                renderAvatar={props.renderAvatar}
                truncated={trigger()?.kind === "@" && (props.mentionSources?.truncado || searchTasks(props.taskCandidates ?? [], trigger()?.query ?? "", props.mentionProject ?? "", props.mentionSession).length > 40)}
                empty={
                  trigger()?.kind === "@"
                    ? t("chat.mentions.no_match")
                    : t("chat.commands.no_match")
                }
                onPick={(s) => {
                  if (!s.disabled) insertSuggestion(s.value);
                }}
              />
            </div>
          </Portal>
        )}
      </Show>
  );

  const PermisoDeLaCaja = () => (
      <Show when={props.permission}>
        {(permission) => {
          return (
            <BloqueDeInterrupcion kind="permission" class="p-3">
              <p class="m-0 text-sm font-semibold">
                {t("chat.permission.title")}
              </p>
              <p class="m-0 text-sm">
                {t("chat.permission.needs_approval", {
                  tool: permission().tool,
                })}
              </p>
              <Show when={permission().origin?.foreign ? permission().origin : null}>
                {(origin) => (
                  <p class="m-0 flex items-center gap-2 rounded-sm border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-warning-strong">
                    <MarcaFuente
                      location={origin().location}
                      kind={origin().kind}
                    />
                    <span class="min-w-0">
                      <strong class="font-semibold">{origin().etiqueta}</strong>{" "}
                      {t("chat.permission.foreign")}
                    </span>
                  </p>
                )}
              </Show>
              <Show when={permission().target}>
                {(target) => (
                  <code class="max-h-40 overflow-auto rounded-sm border border-border bg-surface-muted p-3 font-mono text-xs break-words whitespace-pre-wrap">
                    {target()}
                  </code>
                )}
              </Show>
              <Show when={props.permissionError}>
                {(error) => <p class="m-0 text-sm text-error-strong">{error()}</p>}
              </Show>
              <div class="flex justify-end gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={props.stopping}
                  onClick={() => void props.onStop()}
                >
                  {props.stopping ? t("chat.turn.stopping") : t("chat.turn.stop")}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  ref={enfocar}
                  disabled={props.respondingPermission}
                  onClick={() => props.onPermission(permission(), false)}
                >
                  {t("chat.permission.deny")}
                </Button>
                <Button
                  size="sm"
                  disabled={props.respondingPermission}
                  onClick={() => props.onPermission(permission(), true)}
                >
                  {t("chat.permission.approve")}
                </Button>
              </div>
            </BloqueDeInterrupcion>
          );
        }}
      </Show>
  );

  const PreguntaDeLaCaja = () => (
        <Show when={!props.permission && preguntaPendiente()}>
          {(msg) => (
            <>
              <Show when={preguntaPlegada()}>
                <div class="flex min-w-0 items-center gap-2 px-3 py-2">
                  <span class="min-w-0 flex-1 truncate text-sm font-medium text-neutral-700">
                    {t("chat.questions.title")} · {msg().preguntas![0].question}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    class="size-8 shrink-0 rounded-full"
                    aria-label={t("chat.questions.expand")}
                    title={t("chat.questions.expand")}
                    onClick={() => setPlegadaEn(null)}
                  >
                    <Maximize2 size={15} />
                  </Button>
                </div>
              </Show>
              <div
                class={cn(
                  "h-full min-h-0 min-w-0 overflow-hidden",
                  preguntaPlegada() && "hidden",
                )}
              >
                <Preguntas
                  turno={msg().turno!}
                  items={msg().preguntas!}
                  onResponder={props.onResponder}
                  onCancelar={() => void cancelarPregunta(msg().turno!)}
                  onPlegar={() => setPlegadaEn(msg().turno!)}
                  almacen={props.preguntasAMedias}
                />
              </div>
            </>
          )}
        </Show>
  );
  return { MenuDeSugerencias, PermisoDeLaCaja, PreguntaDeLaCaja };
}
