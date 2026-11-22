import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { claseDelTramo, finishEdit, type PendingEdit } from "../../../../../apps/desktop/src/lib/taskMentions";
import { cn } from "../../../../../apps/desktop/src/lib/utils";
import { Textarea } from "../../../../ui/src/Textarea";
import { FIN_DE_ARCHIVO, TECLAS_DE_TERMINAL } from "../model/commandInput";
import { siguienteModo } from "../model/modes";
import { sangrarTerminal } from "../model/terminalIndent";
import type { createChatAttachments } from "./chat-attachments";
import type { createChatComposerInput } from "./chat-composer-input";
import type { createChatComposerState } from "./chat-composer-state";
import { FUENTE_DE_TERMINAL, METRICA_DEL_CAMPO } from "./chat-model";
import type { ChatProps } from "./chat-props";
import type { createChatTurnState } from "./chat-turn-state";
import { For, Show } from "solid-js";

/** Lo que el bloque usa del cuerpo de Chat. */
export type ChatComposerFieldDeps = { cambiarModo: ReturnType<typeof createChatComposerState>["cambiarModo"]; dirigido: ReturnType<typeof createChatComposerState>["dirigido"]; entrada: ReturnType<typeof createChatTurnState>["entrada"]; entradaActiva: ReturnType<typeof createChatTurnState>["entradaActiva"]; entradaOculta: ReturnType<typeof createChatTurnState>["entradaOculta"]; escribible: ReturnType<typeof createChatComposerState>["escribible"]; fieldSpans: ReturnType<typeof createChatComposerState>["fieldSpans"]; habilitada: ReturnType<typeof createChatComposerInput>["habilitada"]; hasHighlight: ReturnType<typeof createChatComposerState>["hasHighlight"]; insertSuggestion: ReturnType<typeof createChatComposerInput>["insertSuggestion"]; interrumpirConCola: ReturnType<typeof createChatTurnState>["interrumpirConCola"]; interruptibles: ReturnType<typeof createChatTurnState>["interruptibles"]; mandar: ReturnType<typeof createChatAttachments>["mandar"]; menuOpen: ReturnType<typeof createChatComposerInput>["menuOpen"]; mirror: HTMLDivElement | undefined; modoTerminal: ReturnType<typeof createChatTurnState>["modoTerminal"]; pegar: ReturnType<typeof createChatAttachments>["pegar"]; pendingCaret: number | null; pendingEdit: PendingEdit | undefined; picked: ReturnType<typeof createChatComposerInput>["picked"]; setCaret: ReturnType<typeof createChatComposerState>["setCaret"]; setDismissed: ReturnType<typeof createChatComposerState>["setDismissed"]; setEntrada: ReturnType<typeof createChatTurnState>["setEntrada"]; setPick: ReturnType<typeof createChatComposerState>["setPick"]; setSoltadoDe: ReturnType<typeof createChatTurnState>["setSoltadoDe"]; suggestions: ReturnType<typeof createChatComposerInput>["suggestions"]; teclearAlComando: ReturnType<typeof createChatTurnState>["teclearAlComando"]; tomarCampo: ReturnType<typeof createChatComposerState>["tomarCampo"] };

/** Movido tal cual de Chat.tsx (el componente `Chat`, tarea 2.6). Lo que usa del cuerpo de Chat llega por `deps`. */
export function createChatComposerField(props: ChatProps, deps: ChatComposerFieldDeps) {
  const { cambiarModo, dirigido, entrada, entradaActiva, entradaOculta, escribible, fieldSpans, habilitada, hasHighlight, insertSuggestion, interrumpirConCola, interruptibles, mandar, menuOpen, modoTerminal, pegar, picked, setCaret, setDismissed, setEntrada, setPick, setSoltadoDe, suggestions, teclearAlComando, tomarCampo } = deps;
  const CampoDeLaCaja = () => (
        <div class="relative min-w-0">
        {/* La capa y el campo salen de `METRICA_DEL_CAMPO`, y de ahí los dos:
            escribirla dos veces es lo que las dejó con tamaños distintos. */}
        <Show when={hasHighlight() && !entradaActiva()}>
          <div
            ref={deps.mirror}
            aria-hidden="true"
            class={cn(
              "pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words text-neutral-950",
              METRICA_DEL_CAMPO,
              modoTerminal() && FUENTE_DE_TERMINAL,
            )}
          >
            <For each={fieldSpans()}>
              {(tramo) => (
                <Show when={tramo.kind} fallback={tramo.text}>
                  {/* Dos clases y no un atributo: el material lleva el color de
                      referencia y el destinatario el de acción, que es el de
                      llamar a alguien. Con la misma clase para los dos, la
                      diferencia no se descubría hasta que el mensaje ya se fue. */}
                  {(kind) => (
                    <span data-kind={kind()} class={claseDelTramo(kind())}>
                      {tramo.text}
                    </span>
                  )}
                </Show>
              )}
            </For>
            {" "}
          </div>
        </Show>
        <Textarea
          variant="ghost"
          rows={1}
          ref={tomarCampo}
          class={cn(
            "relative block max-h-[11.25rem] min-h-10 overflow-y-auto",
            METRICA_DEL_CAMPO,
            modoTerminal() && FUENTE_DE_TERMINAL,
            hasHighlight() && !entradaActiva() && "text-transparent caret-neutral-950",
            entradaOculta() && "[-webkit-text-security:disc]",
          )}
          autocomplete="off"
          spellcheck={!entradaActiva()}
          onScroll={(e) => {
            if (deps.mirror) deps.mirror.scrollTop = e.currentTarget.scrollTop;
          }}
          value={entradaActiva() ? entrada() : props.input}
          // El placeholder invita a escribir. El motivo por el que no se puede
          // mandar vive abajo, junto a la superficie que lo provoca: aquí se
          // cortaba y desaparecía en cuanto alguien escribía una letra.
          placeholder={
            entradaActiva()
              ? entradaOculta()
                ? t("chat.composer.placeholder.secret")
                : t("chat.composer.placeholder.stdin")
              : dirigido()
              ? t("chat.composer.placeholder.deliver")
              : props.esperando
                ? t("chat.composer.placeholder.answer")
                : props.busy
                  ? t("chat.composer.placeholder.next")
                  : t("chat.composer.placeholder.ask")
          }
          // Deshabilitar el campo le quita el foco: preparar un adjunto pegado
          // o soltado no lo cierra, solo impide mandar (`listo()`).
          disabled={!escribible()}
          enterkeyhint="send"
          onPaste={pegar}
          onBeforeInput={(e) => {
            deps.pendingEdit = { text: e.currentTarget.value, start: e.currentTarget.selectionStart,
              end: e.currentTarget.selectionEnd, inputType: e.inputType };
          }}
          onInput={(e) => {
            if (entradaActiva()) {
              setEntrada(e.currentTarget.value);
              return;
            }
            const valor = e.currentTarget.value;
            const caret = e.currentTarget.selectionStart ?? valor.length;
            const sangrado = sangrarTerminal(props.input, valor, caret, e.inputType);
            if (sangrado.text === valor) {
              props.onInput(valor, e.inputType, finishEdit(deps.pendingEdit, valor));
            } else {
              deps.pendingCaret = sangrado.caret;
              props.onInput(sangrado.text, e.inputType);
            }
            deps.pendingEdit = undefined;
            setCaret(sangrado.caret);
          }}
          // El cursor se mueve con el ratón y con las flechas sin que cambie el
          // texto, y de dónde esté depende qué menú corresponde.
          onKeyUp={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
          onClick={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
          onKeyDown={(e) => {
            if (entradaActiva() && !e.isComposing) {
              const tecla = !entrada() ? TECLAS_DE_TERMINAL[e.key] : undefined;
              if (tecla && !e.shiftKey && !e.metaKey && !e.altKey && !e.ctrlKey) {
                e.preventDefault();
                void teclearAlComando(tecla);
              } else if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void teclearAlComando(`${entrada()}\r`);
              } else if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                setSoltadoDe(props.terminal?.id ?? null);
              } else if (e.ctrlKey && e.key.toLowerCase() === "d" && !entrada()) {
                e.preventDefault();
                void teclearAlComando(FIN_DE_ARCHIVO);
              } else if (e.ctrlKey && e.key.toLowerCase() === "c" && !props.stopping) {
                // En esta terminal `Ctrl+C` mataría también al shell: se detiene el `!`.
                e.preventDefault();
                void props.onStop();
              }
              return;
            }
            if (!e.isComposing && (e.metaKey || e.ctrlKey) &&
              (e.key.toLowerCase() === "z" || (e.ctrlKey && e.key.toLowerCase() === "y")) &&
              props.onMentionHistory?.(e.shiftKey || e.key.toLowerCase() === "y")) {
              e.preventDefault();
              deps.pendingCaret = props.input.length;
              return;
            }
            // `shift+tab` cambia de modo, y solo dentro de esta caja. Va
            // antes que todo lo demás: el menú de `@` y `/` también usa Tab
            // —para aceptar la sugerencia—, y ahí Tab a secas es el gesto,
            // sin `shift`. Fuera de la caja el atajo no existe, para no
            // apropiarse de una tecla global que otras pantallas van a querer.

            // Lo que cuesta, dicho: desde aquí no se navega hacia atrás con
            // el teclado. `shift+tab` es esa tecla y capturarla se la quita
            // a este campo. No deja nada inalcanzable —`Tab` a secas lleva
            // al `+`, a este selector, al de modelo y al de enviar, y desde
            // el último se da la vuelta—, pero es un gesto que alguien
            // puede echar de menos.

            // La alternativa, capturarlo solo a veces, haría que el atajo
            // funcione o no según lo que haya escrito.

            // Si el agente no da más de un modo, no hace nada: `siguienteModo`
            // devuelve `null` en vez de fingir un cambio.
            if (e.key === "Tab" && e.shiftKey && !menuOpen()) {
              const siguiente = siguienteModo(props.modos, props.modo);
              if (siguiente) {
                e.preventDefault();
                cambiarModo(siguiente);
              }
              return;
            }
            if (menuOpen() && suggestions().length > 0) {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setPick(habilitada((picked() + 1) % suggestions().length, 1));
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setPick(habilitada((picked() - 1 + suggestions().length) % suggestions().length, -1));
                return;
              }
              if (e.key === "Tab" || e.key === "Enter") {
                e.preventDefault();
                const suggestion = suggestions()[picked()];
                if (suggestion && !suggestion.disabled) insertSuggestion(suggestion.value);
                return;
              }
            }
            if (e.key === "Escape") {
              // Con el menú abierto, Esc cierra el menú. Vaciar la caja ahí
              // sería tirar el párrafo entero por pedir cerrar una lista.
              if (menuOpen()) {
                e.stopPropagation();
                setDismissed(true);
                return;
              }
              // Antes que detener: con el panel abierto, Esc es cerrarlo.
              if (props.alMargen && props.onCerrarAlMargen) {
                e.stopPropagation();
                props.onCerrarAlMargen();
                return;
              }
              // Y con la caja vacía, detiene el turno. Va la última de las
              // tres: quien escribió algo y pulsa Esc quiere limpiarlo, no
              // matar lo que está corriendo.
              if (!props.input && props.busy && !props.stopping) {
                e.stopPropagation();
                void props.onStop();
                return;
              }
              props.onInput("");
              return;
            }
            // Enter manda; Shift+Enter hace salto de línea.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              // La caja vacía usa la misma interrupción que la flecha de la cola.
              if (!props.stopping && !props.input.trim() && interruptibles().length > 0) {
                interrumpirConCola();
                return;
              }
              void mandar();
            }
          }}
        />
        </div>
  );
  return { CampoDeLaCaja };
}
