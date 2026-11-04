import Search from "lucide-solid/icons/search";
import { fromMarkdown } from "mdast-util-from-markdown";
import { createEffect, createMemo, createSignal, For, on, onCleanup, onMount, Show, type Accessor, type JSX } from "solid-js";
import { Portal } from "solid-js/web";
import { t } from "../../lib/i18n";
import { textoDeAtajo, ariaDeAtajo } from "../../lib/shortcuts";
import { Button } from "../../ui/Button";
import { searchMatchCards, type SearchHit } from "./searchCards";

export type SearchMessage = {
  block: number;
  text: string;
  markdown: boolean;
  role: "user" | "agent";
  /** A name the message already carries. Absent when the turn recorded none. */
  speaker: string | null;
  /** When the turn was written, in epoch ms. Absent on older turns. */
  at?: number;
};
export type ThreadSearchTarget = {
  messages: () => SearchMessage[];
  thread: () => HTMLElement | undefined;
  jump: (block: number) => void;
  move: (delta: number) => void;
};

export type SearchSurface = {
  query: Accessor<string>;
  setQuery: (value: string) => void;
  cards: Accessor<SearchHit[]>;
  selected: Accessor<number>;
  status: () => string;
  move: (delta: number) => void;
  choose: (index: number) => void;
  close: () => void;
  focus: () => void;
  bindInput: (el: HTMLInputElement | undefined) => void;
};

type PaintedMatch = { left: number; top: number; width: number; height: number; active: boolean };

type TextNode = { type: string; value?: string; children?: TextNode[] };
function plainText(node: TextNode): string {
  if (["html", "image", "definition"].includes(node.type)) return "";
  if (node.value !== undefined) return node.value;
  const separator = ["root", "list", "blockquote"].includes(node.type) ? "\n" : "";
  return node.children?.map(plainText).join(separator) ?? "";
}

function offsets(text: string, query: string): { start: number; end: number }[] {
  if (!query) return [];
  const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  return [...text.matchAll(pattern)].map(match => ({ start: match.index, end: match.index + match[0].length }));
}

function rangesIn(element: Element, query: string): Range[] {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const nodes: { node: Text; start: number; end: number }[] = [];
  let text = "";
  let previousBlock: Element | null = null;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.parentElement?.closest("button, [aria-hidden='true']")) continue;
    const block = node.parentElement?.closest("p, pre, li, h1, h2, h3, h4, h5, h6, td, th") ?? null;
    if (text && previousBlock !== block) text += "\n";
    previousBlock = block;
    const value = node.textContent ?? "";
    nodes.push({ node: node as Text, start: text.length, end: text.length + value.length });
    text += value;
  }
  return offsets(text, query).flatMap(match => {
    const first = nodes.find(node => node.end > match.start);
    const last = nodes.find(node => node.end >= match.end);
    if (!first || !last) return [];
    const range = document.createRange();
    range.setStart(first.node, match.start - first.start);
    range.setEnd(last.node, match.end - last.start);
    return [range];
  });
}

export function ThreadSearch(props: {
  conversation: string;
  active: boolean;
  /** The task window is showing search. */
  open: boolean;
  messages: SearchMessage[];
  thread: () => HTMLElement | undefined;
  onJump: (block: number) => void;
  onMove: (delta: number) => void;
  onToggle: () => void;
  /** Opens search without closing it when it is already the window's content. */
  onShow: () => void;
  onClose: () => void;
  onSurface: (id: string, surface: SearchSurface | null) => void;
  /** Sin mensajes todavía (la tarea nueva): el botón queda, apagado y con su porqué. */
  disabled?: boolean;
  leadingTools?: JSX.Element;
  tools?: JSX.Element;
}) {
  const [query, setQuery] = createSignal("");
  const [selected, setSelected] = createSignal(0);
  const [painted, setPainted] = createSignal<PaintedMatch[]>([]);
  const stored = new Map<string, { query: string; selected: number }>();
  let input: HTMLInputElement | undefined;
  let button: HTMLButtonElement | undefined;
  let armFocus = false;
  let frame = 0;
  // La fila del resultado puede estar sin montar: se centra en cuanto aparezca.
  let pendingScroll = false;
  const cache = new Map<string, string>();
  const plainOf = (message: SearchMessage) => {
    if (!message.markdown) return message.text;
    let parsed = cache.get(message.text);
    if (parsed === undefined) {
      parsed = plainText(fromMarkdown(message.text));
      cache.set(message.text, parsed);
    }
    return parsed;
  };
  const cards = createMemo(() => {
    if (!props.open || !query()) return [];
    const used = new Set<string>();
    const sources = props.messages.map(message => {
      if (message.markdown) used.add(message.text);
      return { block: message.block, text: plainOf(message), role: message.role, speaker: message.speaker, at: message.at };
    });
    for (const key of cache.keys()) if (!used.has(key)) cache.delete(key);
    return searchMatchCards(sources, query());
  });
  const current = createMemo(() => {
    const list = cards();
    if (!list.length) return undefined;
    return list[Math.min(selected(), list.length - 1)];
  }, undefined, { equals: (a, b) => a?.block === b?.block && a?.occurrence === b?.occurrence });
  const save = () => {
    const id = props.conversation;
    if (id) stored.set(id, { query: query(), selected: selected() });
  };
  const writeQuery = (value: string) => {
    setQuery(value);
    setSelected(0);
    const id = props.conversation;
    if (id) stored.set(id, { query: value, selected: 0 });
  };
  const move = (delta: number) => {
    const total = cards().length;
    if (!total) return;
    setSelected((selected() + delta + total) % total);
    save();
  };
  const choose = (index: number) => {
    if (!cards()[index]) return;
    setSelected(index);
    save();
  };
  const focus = () => {
    armFocus = true;
    if (!input) return;
    armFocus = false;
    input.focus({ preventScroll: true });
    input.select();
  };
  const surface: SearchSurface = {
    query,
    setQuery: writeQuery,
    cards,
    selected,
    status: () => {
      const text = query();
      const total = cards().length;
      if (!text) return "";
      if (!total) return t("chat.search.empty");
      return t("chat.search.count", { current: Math.min(selected() + 1, total), total });
    },
    move,
    choose,
    close: () => {
      props.onClose();
      button?.focus({ preventScroll: true });
    },
    focus,
    bindInput: (el) => {
      input = el;
      if (!el || !armFocus) return;
      armFocus = false;
      el.focus({ preventScroll: true });
      el.select();
    },
  };
  const paint = (scroll: boolean) => {
    const thread = props.thread();
    if (!thread || !props.open) return setPainted([]);
    const target = current();
    const counts = new Map<number, number>();
    for (const card of cards()) counts.set(card.block, (counts.get(card.block) ?? 0) + 1);
    const results = [...thread.querySelectorAll<HTMLElement>("[data-thread-search-text]")].flatMap(element => {
      const block = Number(element.dataset.threadSearchText);
      return rangesIn(element, query()).slice(0, counts.get(block) ?? 0).map((range, occurrence) => ({ range, active: block === target?.block && occurrence === target.occurrence }));
    });
    if (scroll || pendingScroll) {
      const rect = results.find(result => result.active)?.range.getBoundingClientRect();
      pendingScroll = !rect;
      if (rect) props.onMove(rect.top - thread.getBoundingClientRect().top - thread.clientHeight / 3);
    }
    const origin = thread.getBoundingClientRect();
    setPainted(results.flatMap(result => [...result.range.getClientRects()].map(rect => ({
      left: rect.left - origin.left + thread.scrollLeft,
      top: rect.top - origin.top + thread.scrollTop,
      width: rect.width, height: rect.height, active: result.active,
    }))));
  };
  const schedule = (scroll = false) => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => paint(scroll));
  };
  createEffect(on(() => props.conversation, (id) => {
    const saved = id ? stored.get(id) : undefined;
    setQuery(saved?.query ?? "");
    setSelected(saved?.selected ?? 0);
    setPainted([]);
    cache.clear();
  }));
  createEffect(() => {
    const id = props.conversation;
    if (!id) return;
    props.onSurface(id, surface);
    onCleanup(() => props.onSurface(id, null));
  });
  createEffect(() => {
    const match = current();
    query();
    if (!props.open) return setPainted([]);
    if (match) props.onJump(match.block);
    pendingScroll = Boolean(match);
    schedule(Boolean(match));
  });
  createEffect(() => {
    if (!props.open) return;
    const thread = props.thread();
    const content = thread?.querySelector("[data-chat-thread]");
    if (!thread || !content) return;
    const observer = new MutationObserver(() => schedule());
    observer.observe(content, { subtree: true, childList: true, characterData: true });
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => schedule());
    resize?.observe(thread);
    resize?.observe(content);
    const repaint = () => schedule();
    thread.addEventListener("scroll", repaint);
    onCleanup(() => { observer.disconnect(); resize?.disconnect(); thread.removeEventListener("scroll", repaint); });
  });
  onMount(() => {
    const keydown = (event: KeyboardEvent) => {
      if (!props.active || event.defaultPrevented || event.isComposing) return;
      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "f") {
        if ((event.target as Element | null)?.closest(".cm-editor, [role='dialog']")) return;
        event.preventDefault();
        if (!props.disabled) { props.onShow(); focus(); }
      } else if (props.open && event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        surface.close();
      }
    };
    window.addEventListener("keydown", keydown);
    onCleanup(() => window.removeEventListener("keydown", keydown));
  });
  onCleanup(() => cancelAnimationFrame(frame));
  return <>
    <div class="relative flex max-w-full items-center gap-1">
      <div class="flex shrink-0 items-center gap-1.5">
        {props.leadingTools}
        {/* `aria-disabled` y no `disabled`: el botón apagado no recibe el puntero y perdería el porqué. */}
        <Button ref={button} variant={props.open ? "secondary" : "chrome"} size="iconCompact" class="size-[30px] text-neutral-500 aria-disabled:cursor-default aria-disabled:opacity-60 aria-disabled:hover:bg-transparent"
          onClick={() => {
            if (props.disabled) return;
            const opening = !props.open;
            props.onToggle();
            if (opening) focus();
          }} aria-disabled={props.disabled || undefined} aria-pressed={props.open}
          title={props.disabled ? t("chat.search.unavailable") : t("chat.search.open", { key: textoDeAtajo("findInTask") })} aria-label={t("chat.search.label")}
          aria-keyshortcuts={ariaDeAtajo("findInTask")} aria-expanded={props.open}><Search size={14} /></Button>
        {props.tools}
      </div>
    </div>
    <Show when={props.open && props.thread()}>{thread => <Portal mount={thread()}>
      <div class="pointer-events-none absolute inset-0" aria-hidden="true">
        <For each={painted()}>{rect => <span class="absolute rounded-sm bg-warning/20" classList={{ "outline-solid outline-2 outline-primary": rect.active }}
          style={{ left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` }} />}</For>
      </div>
    </Portal>}</Show>
  </>;
}
