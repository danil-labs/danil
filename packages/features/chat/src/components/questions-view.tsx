import { For, Show, createEffect, on, onCleanup } from "solid-js";
import Square from "lucide-solid/icons/square";
import SquareCheck from "lucide-solid/icons/square-check";
import Minimize2 from "lucide-solid/icons/minimize-2";
import ChevronLeft from "lucide-solid/icons/chevron-left";
import ChevronRight from "lucide-solid/icons/chevron-right";
import Pencil from "lucide-solid/icons/pencil";
import { Button } from "../../../../ui/src/Button";
import { Textarea } from "../../../../ui/src/Textarea";
import { TeclaDeAtajo } from "../../../../ui/src/Shortcut";
import { ariaDeAtajo } from "../../../../../apps/desktop/src/lib/shortcuts";
import { cn } from "../../../../../apps/desktop/src/lib/utils";
import { enfocar, enfocarSiNadieEscribe } from "../../../../../apps/desktop/src/lib/focus";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import BloqueDeInterrupcion from "./InterruptionBlock";
import { Pressable } from "../../../../ui/src/Pressable";
import { editable, type PreguntasProps } from "./questions-types";
import { FILA, Insignia } from "./questions-parts";
import { createPreguntas } from "./questions-state";

/**
 * Lo que el agente preguntó y espera, en el sitio de la caja de escribir.
 * Una pregunta a la vez con un paginador: cuatro seguidas se leen como un
 * formulario, y un formulario se contesta por encima.
 */
export default function Preguntas(props: PreguntasProps) {
  const { mandando, en, de, tocar, actual, total, varias, ultima, respondidas, listo, ir, elegir, alternarOtra, avanzar } = createPreguntas(props);

  let bloque: HTMLElement | undefined;
  let cuerpo: HTMLDivElement | undefined;

  // Al cambiar de pregunta sus botones se rehacen y el foco caería al `body`.
  createEffect(
    on(
      en,
      () => {
        if (cuerpo) cuerpo.scrollTop = 0;
        const activo = document.activeElement;
        if (bloque && (!activo || activo === document.body || bloque.contains(activo)))
          if (!editable(activo)) bloque.focus({ preventScroll: true });
      },
      { defer: true },
    ),
  );

  /**
   * 1..n eligen, n+1 abre «Otra», ← → pasan de pregunta, ⌘↵ avanza y Esc
   * omite. Dentro del campo de «Otra» los números son texto y Esc vuelve a
   * la tarjeta, para que un Esc de más no tire lo escrito.
   */
  function atender(e: KeyboardEvent) {
    if (e.defaultPrevented || mandando()) return;
    const escribe = editable(e.target);
    const mod = e.metaKey || e.ctrlKey;
    let hecho = false;
    if (e.key === "Escape") {
      if (escribe) bloque?.focus({ preventScroll: true });
      else props.onCancelar?.();
      hecho = true;
    } else if (e.key === "Enter" && !e.shiftKey && (mod || escribe)) {
      if (listo()) avanzar();
      hecho = true;
    } else if (!escribe && !mod && !e.altKey && !e.shiftKey && !e.repeat) {
      if (e.key === "ArrowLeft" && varias()) {
        ir(en() - 1);
        hecho = true;
      } else if (e.key === "ArrowRight" && varias()) {
        ir(en() + 1);
        hecho = true;
      } else if (/^[1-9]$/.test(e.key)) {
        const p = actual();
        const n = Number(e.key);
        const opcion = p.options[n - 1];
        if (opcion) {
          elegir(p, opcion.value);
          hecho = true;
        } else if (p.free_text && p.options.length > 0 && n === p.options.length + 1) {
          alternarOtra(p);
          hecho = true;
        }
      }
    }
    if (hecho) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  // WebKit no enfoca un botón al pulsarlo: tras un clic el foco queda en el
  // `body` y la tecla no pasaría por la tarjeta. Con dos preguntas a la vista
  // (conversación partida) no se sabe a cuál va, y no se atiende.
  createEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (!bloque || bloque.offsetParent === null) return;
      if (bloque.contains(e.target as Node)) return;
      if (document.activeElement && document.activeElement !== document.body) return;
      const visibles = [
        ...document.querySelectorAll<HTMLElement>('[data-interruption="question"]'),
      ].filter((el) => el.offsetParent !== null);
      if (visibles.length !== 1 || visibles[0] !== bloque) return;
      atender(e);
    };
    window.addEventListener("keydown", alTeclear);
    onCleanup(() => window.removeEventListener("keydown", alTeclear));
  });

  const crecer = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };
  const campoDeOtra = (el: HTMLTextAreaElement) =>
    queueMicrotask(() => {
      crecer(el);
      enfocarSiNadieEscribe(el);
    });

  const Campo = (p: { conLapiz: boolean }) => (
    <div
      class={cn(
        FILA,
        "border-border-strong bg-surface focus-within:outline-solid focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary",
      )}
    >
      <Textarea
        variant="ghost"
        rows={1}
        ref={campoDeOtra}
        class="max-h-[7.5rem] min-h-0 flex-1 overflow-y-auto py-0.5 text-sm leading-[1.45]"
        maxlength={4096}
        value={de(actual()).texto}
        disabled={mandando()}
        placeholder={t("chat.questions.free_placeholder")}
        aria-label={t("chat.questions.other")}
        enterkeyhint={ultima() ? "send" : "next"}
        onInput={(ev) => {
          crecer(ev.currentTarget);
          tocar(actual(), { texto: ev.currentTarget.value });
        }}
      />
      <Show when={p.conLapiz}>
        <Insignia puesta>
          <Pencil size={11} />
        </Insignia>
      </Show>
    </div>
  );

  return (
    <BloqueDeInterrupcion
      kind="question"
      class="h-full max-h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-0 rounded-none border-0 bg-transparent shadow-none"
      onKeyDown={atender}
      tabIndex={-1}
      ref={(el) => {
        bloque = el;
        if (props.items[0]?.options.length > 0) enfocar(el);
      }}
    >
      <div ref={cuerpo} class="min-h-0 overflow-y-auto overscroll-contain px-3 pt-3 pb-2">
        <div class="grid gap-3">
          <div class="flex items-start gap-2 pl-1">
            <div class="grid min-w-0 flex-1 gap-0.5">
              <span class="text-xs text-neutral-500">{actual().header || t("chat.questions.title")}</span>
              <p class="m-0 text-sm leading-[1.45] font-medium break-words text-neutral-950">
                {actual().question}
              </p>
            </div>
            <Show when={props.onPlegar}>
              {(plegar) => (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  class="-mt-1 -mr-1 size-7 shrink-0 rounded-full"
                  aria-label={t("chat.questions.collapse")}
                  title={t("chat.questions.collapse")}
                  onClick={plegar()}
                >
                  <Minimize2 size={15} />
                </Button>
              )}
            </Show>
          </div>

          <Show when={actual().options.length > 0} fallback={<Campo conLapiz={false} />}>
            <ul class="m-0 grid list-none gap-1.5 p-0">
              <For each={actual().options}>
                {(o, i) => {
                  const puesta = () => de(actual()).elegidas.includes(o.value);
                  return (
                    <li>
                      <Pressable
                        aria-pressed={puesta()}
                        aria-label={`${i() + 1}. ${o.label}`}
                        data-option={o.value}
                        disabled={mandando()}
                        onClick={() => elegir(actual(), o.value)}
                        class={cn(
                          FILA,
                          "outline-none transition-[background-color,border-color,box-shadow] duration-150 ease-out focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-60",
                          puesta()
                            ? "border-border-strong bg-surface-raised text-neutral-950 shadow-sm"
                            : "border-transparent bg-surface-muted text-neutral-900 hover:border-border-strong hover:text-neutral-950",
                        )}
                      >
                        <Show when={actual().multiple}>
                          <span class="shrink-0 text-neutral-500" aria-hidden="true">
                            <Show when={puesta()} fallback={<Square size={16} />}>
                              <SquareCheck size={16} class="text-neutral-950" />
                            </Show>
                          </span>
                        </Show>
                        <span class="min-w-0 flex-1 break-words">{o.label}</span>
                        <Insignia puesta={puesta()}>{i() + 1}</Insignia>
                      </Pressable>
                    </li>
                  );
                }}
              </For>
              <Show when={actual().free_text}>
                <li>
                  <Show
                    when={de(actual()).otra}
                    fallback={
                      <Pressable
                        aria-pressed={false}
                        aria-label={`${actual().options.length + 1}. ${t("chat.questions.other")}`}
                        data-option="other"
                        disabled={mandando()}
                        onClick={() => alternarOtra(actual())}
                        class={cn(
                          FILA,
                          "border-transparent bg-surface-muted text-neutral-900 outline-none transition-[background-color,border-color] duration-150 ease-out hover:border-border-strong hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-60",
                        )}
                      >
                        <span class="min-w-0 flex-1">{t("chat.questions.other")}</span>
                        <Insignia puesta={false}>
                          <Pencil size={11} />
                        </Insignia>
                      </Pressable>
                    }
                  >
                    <Campo conLapiz />
                  </Show>
                </li>
              </Show>
            </ul>
          </Show>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 pt-1 pb-3">
        <Show when={varias()}>
          <div class="flex items-center gap-0.5 text-xs text-neutral-500">
            <Button
              type="button"
              variant="ghost"
              size="iconCompact"
              class="size-7 rounded-full"
              disabled={en() === 0}
              aria-label={t("chat.questions.previous_aria")}
              title={t("chat.questions.previous_aria")}
              onClick={() => ir(en() - 1)}
            >
              <ChevronLeft size={15} />
            </Button>
            <span class="min-w-12 text-center tabular-nums" aria-live="polite">
              {t("chat.questions.page", { current: en() + 1, total: total() })}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="iconCompact"
              class="size-7 rounded-full"
              disabled={ultima()}
              aria-label={t("chat.questions.next_aria")}
              title={t("chat.questions.next_aria")}
              onClick={() => ir(en() + 1)}
            >
              <ChevronRight size={15} />
            </Button>
          </div>
          <span class="text-xs text-neutral-500 tabular-nums">
            {t("chat.questions.answered", { done: respondidas(), total: total() })}
          </span>
        </Show>
        <div class="ml-auto flex items-center gap-2">
          <Show when={props.onCancelar}>
            {(cancelar) => (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={mandando()}
                aria-keyshortcuts={ariaDeAtajo("skipQuestion")}
                onClick={cancelar()}
              >
                {t("chat.questions.skip")}
                <TeclaDeAtajo accion="skipQuestion" />
              </Button>
            )}
          </Show>
          <Button
            type="button"
            size="sm"
            disabled={!listo() || mandando()}
            aria-keyshortcuts={ariaDeAtajo("advanceQuestion")}
            onClick={() => avanzar()}
          >
            {ultima() ? t("chat.questions.send") : t("chat.questions.next")}
            <TeclaDeAtajo accion="advanceQuestion" />
          </Button>
        </div>
      </div>
    </BloqueDeInterrupcion>
  );
}
