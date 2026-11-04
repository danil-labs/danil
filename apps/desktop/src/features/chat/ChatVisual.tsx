import { createEffect, createMemo, createResource, createSignal, on, onCleanup, onMount, Show } from "solid-js";
import { createRowSignal, retainRowWhile } from "./threadRow";
import Maximize2 from "lucide-solid/icons/maximize-2";
import Minimize2 from "lucide-solid/icons/minimize-2";
import X from "lucide-solid/icons/x";
import { envolver, SANDBOX_ARTEFACTO } from "../artifacts/sandbox";
import { VISUAL_THEME_TOKENS, type VisualTheme } from "../artifacts/inlineVisual";
import geist from "../../styles/fonts/Geist-Variable.woff2?inline";
import { t } from "../../lib/i18n";
import { suspendSiteLayers } from "../../lib/sites";
import { Button } from "../../ui/Button";
import { Spinner } from "../../ui/Spinner";
import { asFailure, FailureNote } from "../../ui/Failure";
import type { VisualBudget } from "./visualBudget";
import type { ChatVisual as Visual } from "./visualDirective";

export default function ChatVisual(props: {
  visual: Visual;
  owner: string;
  budget: VisualBudget;
  read: (file: string) => Promise<string>;
  /** Abre el archivo fuera, cuando el chat no puede pintarlo. */
  open?: (file: string) => Promise<void>;
}) {
  let container!: HTMLDivElement;
  let panel!: HTMLDialogElement;
  let frame: HTMLIFrameElement | undefined;
  let expandButton: HTMLButtonElement | undefined;
  let restoreSites: (() => void) | undefined;
  const [visible, setVisible] = createSignal(false);
  const [opened, setOpened] = createRowSignal("visual-opened", true);
  const [expanded, setExpanded] = createSignal(false);
  retainRowWhile(expanded);
  const [height, setHeight] = createRowSignal("visual-height", 320);
  // La tarjeta se queda hasta que el marco ya midió su alto: así no se cambia
  // por un hueco a medio pintar ni salta el texto que la rodea.
  const [painted, setPainted] = createSignal(false);
  let paintTimer: ReturnType<typeof setTimeout> | undefined;
  const paint = () => { clearTimeout(paintTimer); setPainted(true); };
  const readTheme = (): VisualTheme => {
    const root = document.documentElement;
    const tokens = getComputedStyle(root);
    const text = getComputedStyle(container);
    return {
      mode: root.dataset.theme === "dark" ? "dark" : "light",
      tokens: Object.fromEntries(VISUAL_THEME_TOKENS.map((key) => [key, tokens.getPropertyValue(key).trim()])),
      fontFamily: text.fontFamily,
      fontSize: text.fontSize,
      lineHeight: text.lineHeight,
    };
  };
  const syncTheme = () => frame?.contentWindow?.postMessage({ type: "terminus:visual-theme", theme: readTheme() }, "*");
  const resize = (next: boolean) => {
    if (next === expanded()) return;
    setExpanded(next);
    // El mismo nodo pasa a la capa modal; mover el iframe a un portal lo recarga.
    panel.close();
    if (next) {
      restoreSites = suspendSiteLayers();
      panel.showModal();
    }
    else {
      restoreSites?.();
      restoreSites = undefined;
      panel.show();
      expandButton?.focus({ preventScroll: true });
    }
  };
  type Reading = { release: () => void; pending: boolean; closed: boolean };
  let current: Reading | undefined;
  let disposed = false;
  const retire = () => {
    if (!current) return;
    current.closed = true;
    if (!current.pending) current.release();
    current = undefined;
  };
  onCleanup(() => { disposed = true; clearTimeout(paintTimer); retire(); restoreSites?.(); });
  const identity = createMemo(() => `${props.owner}:${props.visual.id}`);
  const [html, { refetch, mutate }] = createResource(
    () => visible() && opened() ? identity() : false,
    async () => {
      retire();
      const reservation = props.budget.claim();
      if (!reservation) throw { what: t("chat.visual.budget"), detail: "visual_thread_budget" };
      const reading: Reading = { release: reservation, pending: true, closed: false };
      current = reading;
      try {
        const html = await props.read(props.visual.file);
        if (disposed || reading.closed || current !== reading) return undefined;
        return html;
      } catch (error) {
        reading.closed = true;
        if (disposed || current !== reading) return undefined;
        throw error;
      } finally {
        reading.pending = false;
        if (disposed || reading.closed || current !== reading) reading.release();
      }
    },
  );
  const content = createMemo(() => {
    if (html.error || html.loading) return undefined;
    const value = html();
    return value === undefined ? undefined : envolver(value, { inline: { font: geist, theme: readTheme() } });
  });
  const close = () => {
    setOpened(false);
    setPainted(false);
    resize(false);
    retire();
    mutate(undefined);
  };
  const title = () => props.visual.title || t("chat.visual.title");
  const [openFailed, setOpenFailed] = createSignal(false);
  const openOutside = async () => {
    setOpenFailed(false);
    try {
      await props.open?.(props.visual.file);
    } catch {
      setOpenFailed(true);
    }
  };
  const failure = () => {
    const error = html.error;
    const cause = error instanceof Error && !("what" in error) ? error.cause : undefined;
    return asFailure(cause && typeof cause === "object" && "what" in cause ? cause : error);
  };
  onMount(() => {
    const receive = (event: MessageEvent) => {
      if (!opened() || !frame?.contentWindow || event.source !== frame.contentWindow || event.origin !== "null") return;
      const message = event.data;
      if (!message || typeof message !== "object") return;
      if (message.type === "terminus:visual-height" && typeof message.height === "number" && Number.isFinite(message.height)) {
        if (!expanded()) setHeight(Math.max(48, Math.min(4096, Math.ceil(message.height))));
        paint();
      }
      if (message.type === "terminus:visual-escape" && expanded()) resize(false);
    };
    window.addEventListener("message", receive);
    const theme = new MutationObserver(syncTheme);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-light-style", "data-dark-style", "style"] });
    onCleanup(() => {
      window.removeEventListener("message", receive);
      theme.disconnect();
    });
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setVisible(true);
      observer.disconnect();
    }, { rootMargin: "200px" });
    observer.observe(container);
    onCleanup(() => observer.disconnect());
  });
  createEffect(on(content, (value) => {
    clearTimeout(paintTimer);
    if (!value) setPainted(false);
  }));
  createEffect(on(identity, () => {
    setOpened(true);
    setPainted(false);
    if (panel) resize(false);
    setHeight(320);
  }, { defer: true }));
  return (
    <div ref={container} class="group/visual relative my-4" style={{ height: expanded() ? `${height()}px` : undefined }} data-chat-visual={props.visual.file}>
      <dialog ref={panel} open aria-label={title()} data-expanded={expanded() ? "" : undefined}
        class="relative m-0 block w-full max-w-none border-0 bg-transparent p-0 text-inherit data-[expanded]:fixed data-[expanded]:inset-6 data-[expanded]:m-auto data-[expanded]:flex data-[expanded]:max-h-[calc(100dvh-3rem)] data-[expanded]:w-[calc(100vw-3rem)] data-[expanded]:max-w-[1100px] data-[expanded]:flex-col data-[expanded]:rounded-lg data-[expanded]:bg-surface data-[expanded]:p-5 data-[expanded]:shadow-lg backdrop:bg-black/40"
        onCancel={(event) => { event.preventDefault(); resize(false); }}>
      <Show when={opened() && painted() && !html.error}>
        <div class="absolute top-0 right-0 z-10 flex gap-1 rounded-md bg-surface opacity-0 group-hover/visual:opacity-100 group-focus-within/visual:opacity-100 [@media(pointer:coarse)]:opacity-100" classList={{ "opacity-100": expanded() }}>
          <Button ref={expandButton} variant="ghost" size="iconCompact" disabled={!content()} onClick={() => resize(!expanded())} aria-expanded={expanded()} aria-label={expanded() ? t("chat.visual.collapse") : t("chat.visual.expand")} title={expanded() ? t("chat.visual.collapse") : t("chat.visual.expand")}>
            <Show when={expanded()} fallback={<Maximize2 class="size-3.5" />}><Minimize2 class="size-3.5" /></Show>
          </Button>
          <Button variant="ghost" size="iconCompact" onClick={close} aria-label={t("chat.visual.unload")} title={t("chat.visual.unload")}><X class="size-3.5" /></Button>
        </div>
      </Show>
      {/* Cerrada o cargando se lee como tarjeta y no como texto suelto: una
          línea gris en medio de la respuesta no parecía algo que se pudiera
          abrir, y cambiarla por «Cargando…» hacía saltar el mensaje. */}
      <Show when={!opened() || (!html.error && !painted())}>
        <button type="button" onClick={() => setOpened(true)} aria-busy={opened()} data-chat-visual-closed={opened() ? undefined : ""} data-chat-visual-loading={opened() ? "" : undefined}
          class="flex w-full items-center gap-3 rounded-lg border border-border bg-surface-raised px-3 py-2.5 text-left outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary"
          classList={{ "cursor-default": opened(), "hover:border-primary": !opened() }}>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-semibold text-neutral-950">{title()}</span>
            <Show when={!opened()}><span class="block text-xs text-neutral-500">{t("chat.visual.load")}</span></Show>
          </span>
          <span class="grid size-8 shrink-0 place-items-center text-neutral-500">
            <Show when={opened()} fallback={<Maximize2 class="size-4" />}><Spinner size={16} label={t("chat.visual.loading")} /></Show>
          </span>
        </button>
      </Show>
      <Show when={opened()}>
        {/* Ocupa el sitio del visual y nombra su archivo: el texto del mensaje
            sigue alrededor, y lo que no se pinta aquí se puede abrir fuera. */}
        <Show when={html.error}>
          <div data-chat-visual-failed="">
            <p class="text-sm font-semibold text-neutral-900">{title()}</p>
            <p class="text-xs text-neutral-500"><code>{props.visual.file}</code></p>
            <FailureNote f={failure()} />
            <Show when={openFailed()}>
              <p class="text-xs text-neutral-500">{t("chat.visual.open_failed")}</p>
            </Show>
            <div class="mb-3 flex flex-wrap gap-2">
              <Button variant="outline" size="compact" onClick={() => void refetch()}>{t("chat.visual.retry")}</Button>
              <Show when={props.open}>
                <Button variant="outline" size="compact" data-chat-visual-open="" onClick={() => void openOutside()}>{t("chat.visual.open_browser")}</Button>
              </Show>
            </div>
          </div>
        </Show>
        <Show when={!html.error && !html.loading && content()}>
          {/* Se pinta oculto detrás de la tarjeta y aparece ya a su alto. */}
          <iframe ref={frame} title={title()} class="block w-full shrink-0 border-0 bg-transparent transition-opacity duration-200"
            classList={{ "pointer-events-none invisible absolute inset-x-0 top-0 opacity-0": !painted() }}
            style={{ height: expanded() ? "75dvh" : `${height()}px` }} sandbox={SANDBOX_ARTEFACTO} srcdoc={content()}
            onLoad={() => { syncTheme(); if (!painted()) paintTimer = setTimeout(paint, 600); }} />
        </Show>
      </Show>
      </dialog>
    </div>
  );
}
