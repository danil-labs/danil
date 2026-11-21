import { For, Show, createEffect, createSignal, on, onCleanup } from "solid-js";
import { Square, SquareCheck, Minimize2, ChevronLeft, ChevronRight, Pencil } from "./icons.tsx";
import { Button, Textarea, TeclaDeAtajo } from "@danil/ui";
import BloqueDeInterrupcion from "./InterruptionBlock.tsx";
import {
  type Opcion,
  type Pregunta,
  type RespuestaEnviada,
  type Estado,
  inicial,
  contestada,
  editable,
  Insignia,
} from "./questionsTypes.tsx";

export type { Opcion, Pregunta, RespuestaEnviada, Estado };

export interface QuestionsProps {
  turno?: string;
  items: Pregunta[];
  onAnswer?: (enviadas: RespuestaEnviada[]) => void | Promise<unknown>;
  onResponder?: (turno: string, enviadas: RespuestaEnviada[]) => Promise<boolean>;
  onPlegar?: () => void;
  onCancelar?: () => void;
}

const FILA = "relative flex min-h-9 w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-sm";

export function Questions(props: QuestionsProps) {
  const [mandando, setMandando] = createSignal(false);
  const [localEstado, setLocalEstado] = createSignal<Record<string, Estado>>({});
  const [en, setEn] = createSignal(0);

  const de = (p: Pregunta): Estado => localEstado()[p.id] ?? inicial(p);
  const tocar = (p: Pregunta, cambio: Partial<Estado>) => {
    setLocalEstado((prev) => ({ ...prev, [p.id]: { ...de(p), ...cambio } }));
  };

  const items = () => props.items ?? [];
  const actual = () => items()[Math.min(en(), Math.max(0, items().length - 1))] ?? { id: "", question: "", options: [] };
  const total = () => items().length;
  const varias = () => total() > 1;
  const ultima = () => en() >= total() - 1;
  const respondidas = () => items().filter((p) => contestada(de(p))).length;
  const listo = () => contestada(de(actual()));

  const ir = (i: number) => setEn(Math.max(0, Math.min(i, total() - 1)));

  function elegir(p: Pregunta, valor: string) {
    if (mandando()) return;
    const ahora = de(p);
    if (p.multiple) {
      const ya = ahora.elegidas.includes(valor);
      tocar(p, { elegidas: ya ? ahora.elegidas.filter((v) => v !== valor) : [...ahora.elegidas, valor] });
      return;
    }
    const siguiente = { ...localEstado(), [p.id]: { ...ahora, elegidas: [valor], otra: false } };
    setLocalEstado(siguiente);
    if (total() === 1) { void responder(siguiente); return; }
    avanzar(siguiente);
  }

  function alternarOtra(p: Pregunta) {
    if (mandando() || !p.free_text) return;
    const e = de(p);
    tocar(p, p.multiple ? { otra: !e.otra } : { otra: !e.otra, elegidas: [] });
  }

  const faltanEn = (estados: Record<string, Estado>) =>
    items().filter((p) => !contestada(estados[p.id] ?? inicial(p))).length;

  async function responder(estados = localEstado()) {
    if (faltanEn(estados) > 0 || mandando()) return;
    setMandando(true);
    try {
      const enviadas: RespuestaEnviada[] = items().map((p) => {
        const e = estados[p.id] ?? inicial(p);
        return {
          turn: props.turno,
          question: p.id,
          chosen: e.elegidas,
          free_text: e.otra && e.texto.trim() ? e.texto.trim() : null,
        };
      });
      if (props.onAnswer) await props.onAnswer(enviadas);
      else if (props.onResponder) await props.onResponder(props.turno ?? "", enviadas);
    } finally {
      setMandando(false);
    }
  }

  function avanzar(estados = localEstado()) {
    if (!ultima()) { ir(en() + 1); return; }
    const falta = items().findIndex((p) => !contestada(estados[p.id] ?? inicial(p)));
    if (falta >= 0) { ir(falta); return; }
    void responder(estados);
  }

  let bloque: HTMLElement | undefined;
  let cuerpo: HTMLDivElement | undefined;

  createEffect(
    on(en, () => {
      if (cuerpo) cuerpo.scrollTop = 0;
      const activo = document.activeElement;
      if (bloque && (!activo || activo === document.body || bloque.contains(activo))) {
        if (!editable(activo)) bloque.focus({ preventScroll: true });
      }
    }, { defer: true }),
  );

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
      if (e.key === "ArrowLeft" && varias()) { ir(en() - 1); hecho = true; }
      else if (e.key === "ArrowRight" && varias()) { ir(en() + 1); hecho = true; }
      else if (/^[1-9]$/.test(e.key)) {
        const p = actual();
        const n = Number(e.key);
        const opcion = p.options[n - 1];
        if (opcion) { elegir(p, opcion.value); hecho = true; }
        else if (p.free_text && p.options.length > 0 && n === p.options.length + 1) {
          alternarOtra(p); hecho = true;
        }
      }
    }
    if (hecho) { e.preventDefault(); e.stopPropagation(); }
  }

  createEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (!bloque || bloque.offsetParent === null) return;
      if (bloque.contains(e.target as Node)) return;
      if (document.activeElement && document.activeElement !== document.body) return;
      atender(e);
    };
    window.addEventListener("keydown", alTeclear);
    onCleanup(() => window.removeEventListener("keydown", alTeclear));
  });

  const crecer = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  const Campo = (p: { conLapiz: boolean }) => (
    <div class={`${FILA} border-border-strong bg-surface focus-within:outline-solid focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary`}>
      <Textarea
        variant="ghost"
        rows={1}
        ref={(el) => queueMicrotask(() => crecer(el))}
        class="max-h-[7.5rem] min-h-0 flex-1 overflow-y-auto py-0.5 text-sm leading-[1.45]"
        maxlength={4096}
        value={de(actual()).texto}
        disabled={mandando()}
        placeholder="Escribe una respuesta..."
        aria-label="Otra"
        enterkeyhint={ultima() ? "send" : "next"}
        onInput={(ev) => {
          crecer(ev.currentTarget);
          tocar(actual(), { texto: ev.currentTarget.value });
        }}
      />
      <Show when={p.conLapiz}><Insignia puesta><Pencil size={11} /></Insignia></Show>
    </div>
  );

  return (
    <BloqueDeInterrupcion
      kind="question"
      class="h-full max-h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-0 rounded-none border-0 bg-transparent shadow-none"
      onKeyDown={atender}
      tabIndex={-1}
      ref={(el) => { bloque = el; }}
    >
      <div ref={cuerpo} class="min-h-0 overflow-y-auto overscroll-contain px-3 pt-3 pb-2">
        <div class="grid gap-3">
          <div class="flex items-start gap-2 pl-1">
            <div class="grid min-w-0 flex-1 gap-0.5">
              <span class="text-xs text-neutral-500">{actual().header || "Pregunta"}</span>
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
                  aria-label="Plegar"
                  title="Plegar"
                  onClick={plegar()}
                >
                  <Minimize2 size={15} />
                </Button>
              )}
            </Show>
          </div>

          <Show when={actual().options && actual().options.length > 0} fallback={<Campo conLapiz={false} />}>
            <ul class="m-0 grid list-none gap-1.5 p-0">
              <For each={actual().options}>
                {(o, i) => {
                  const puesta = () => de(actual()).elegidas.includes(o.value);
                  return (
                    <li>
                      <button
                        type="button"
                        aria-pressed={puesta()}
                        aria-label={`${i() + 1}. ${o.label}`}
                        data-option={o.value}
                        disabled={mandando()}
                        onClick={() => elegir(actual(), o.value)}
                        class={`${FILA} outline-none transition-[background-color,border-color,box-shadow] duration-150 ease-out focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-60 ${
                          puesta()
                            ? "border-border-strong bg-surface-raised text-neutral-950 shadow-sm"
                            : "border-transparent bg-surface-muted text-neutral-900 hover:border-border-strong hover:text-neutral-950"
                        }`}
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
                      </button>
                    </li>
                  );
                }}
              </For>
              <Show when={actual().free_text}>
                <li>
                  <Show
                    when={de(actual()).otra}
                    fallback={
                      <button
                        type="button"
                        aria-pressed={false}
                        aria-label={`${actual().options.length + 1}. Otra`}
                        data-option="other"
                        disabled={mandando()}
                        onClick={() => alternarOtra(actual())}
                        class={`${FILA} border-transparent bg-surface-muted text-neutral-900 outline-none transition-[background-color,border-color] duration-150 ease-out hover:border-border-strong hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-60`}
                      >
                        <span class="min-w-0 flex-1">Otra</span>
                        <Insignia puesta={false}>
                          <Pencil size={11} />
                        </Insignia>
                      </button>
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
              aria-label="Pregunta anterior"
              title="Pregunta anterior"
              onClick={() => ir(en() - 1)}
            >
              <ChevronLeft size={15} />
            </Button>
            <span class="min-w-12 text-center tabular-nums" aria-live="polite">
              {en() + 1} de {total()}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="iconCompact"
              class="size-7 rounded-full"
              disabled={ultima()}
              aria-label="Pregunta siguiente"
              title="Pregunta siguiente"
              onClick={() => ir(en() + 1)}
            >
              <ChevronRight size={15} />
            </Button>
          </div>
          <span class="text-xs text-neutral-500 tabular-nums">
            {respondidas()}/{total()} respondidas
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
                onClick={cancelar()}
              >
                Omitir
                <TeclaDeAtajo accion="skipQuestion" />
              </Button>
            )}
          </Show>
          <Button
            type="button"
            size="sm"
            disabled={!listo() || mandando()}
            onClick={() => avanzar()}
          >
            {ultima() ? "Enviar" : "Siguiente"}
            <TeclaDeAtajo accion="advanceQuestion" />
          </Button>
        </div>
      </div>
    </BloqueDeInterrupcion>
  );
}

export default Questions;
