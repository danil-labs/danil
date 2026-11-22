import type { HistoryChunk, HistoryRef } from "@terminus/protocol";
import { currentRef, readDetailText } from "../../../../engine-client/src/historyDetail.ts";
import { createResource, createSignal, For, Show, onCleanup, type JSX } from "solid-js";
import { retainRowWhile } from "../model/threadRow";
import { readTurns, readDetailChunk, type MachineOf } from "../queries";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { Markdown } from "../../../../ui/src/Markdown";
import type { Session } from "../model/transcript";
import { Pressable } from "../../../../ui/src/Pressable";

const REREADS = 5;
const REREAD_MS = 150;

/** El texto del mensaje es la respuesta misma: se trae al montar la fila y `render` lo pinta como cualquier otra. */
function HistoryText(props: { reference: HistoryRef; turnId?: string; onUnavailable: () => void; render?: (text: string) => JSX.Element; route: MachineOf }) {
  const [text] = createResource(() => props.reference, (ref) => readDetailText<Session["turns"][number]>({
    part: (current, offset) => readDetailChunk(ref, { ...current, kind: "detail", offset }, props.route),
    turns: readTurns(ref, props.route),
  }, ref, props.turnId).then((value) => {
    if (value === null) props.onUnavailable();
    return value;
  }).catch(() => {
    props.onUnavailable();
    return null;
  }));
  return <Show when={text()}>{(value) => props.render ? props.render(value()) : <Markdown>{value()}</Markdown>}</Show>;
}

/** Una sola página de contenido crudo en memoria, incluso con resultados de muchos MB. */
export function HistoryDetails(props: { refs: HistoryRef[]; turnId?: string; renderText?: (text: string) => JSX.Element; route: MachineOf }) {
  const [selected, setSelected] = createSignal<HistoryRef | null>(null);
  const [chunk, setChunk] = createSignal<HistoryChunk | null>(null);
  retainRowWhile(() => selected() !== null);
  const [loading, setLoading] = createSignal(false);
  const [failed, setFailed] = createSignal(false);
  const [offsets, setOffsets] = createSignal<number[]>([]);
  let generation = 0;
  onCleanup(() => generation++);
  const close = () => { generation++; setSelected(null); setChunk(null); setOffsets([]); setLoading(false); };
  // El archivo cambió desde que llegó la referencia: se pide la del mismo turno y se empieza de nuevo.
  async function reread(ref: HistoryRef, current: number, attempts: number) {
    for (; attempts < REREADS; attempts++) {
      await new Promise((done) => setTimeout(done, REREAD_MS * attempts));
      if (current !== generation) return true;
      const fresh = await currentRef<Session["turns"][number]>(
        readTurns(ref, props.route),
        ref, props.turnId,
      ).catch(() => undefined);
      if (current !== generation) return true;
      if (fresh === null) return false;
      if (fresh) {
        void read({ ...ref, ...fresh }, 0, false, attempts + 1);
        return true;
      }
    }
    return false;
  }
  async function read(ref: HistoryRef, offset: number, backwards = false, attempts = 0) {
    const current = ++generation;
    setSelected(ref); setChunk(null); setFailed(false); setLoading(true);
    try {
      const page = await readDetailChunk(ref, { ...ref, kind: "detail", offset }, props.route);
      if (current !== generation) return;
      if (page.version !== 1 || page.offset !== offset || page.revision !== ref.revision || page.text.length > 131072 || (!page.done && page.next <= offset)) throw new Error("invalid history chunk");
      setChunk(page);
      if (!backwards) setOffsets(previous => offset === 0 ? [] : [...previous, offset]);
    } catch {
      if (current === generation && !await reread(ref, current, attempts)) setFailed(true);
    }
    finally { if (current === generation) setLoading(false); }
  }
  const [textFailed, setTextFailed] = createSignal(false);
  const textRef = () => textFailed() ? undefined : props.refs.find((ref) => ref.pointer === "/text");
  const listed = () => props.refs.filter((ref) => ref !== textRef());
  return <>
  <Show when={textRef()}>{(ref) => <HistoryText reference={ref()} turnId={props.turnId} render={props.renderText} route={props.route} onUnavailable={() => setTextFailed(true)} />}</Show>
  <Show when={listed().length > 0}>
  <div class="my-2 text-xs text-neutral-500">
    <For each={listed()}>{ref => <Pressable class="mr-2 underline" onClick={() => void read(ref, 0)}>
      {t("chat.history.open")} ({ref.pointer === "/text" ? t("chat.history.text") : ref.pointer === "/pieces" ? t("chat.history.pieces") : t("chat.history.content")}, {Math.ceil(ref.bytes / 1024)} KiB)
    </Pressable>}</For>
    <Show when={selected()}>{ref => <div class="mt-2 rounded border border-border p-2">
      <Pressable onClick={close}>{t("chat.history.close")}</Pressable>
      <Show when={loading()}><p role="status">{t("chat.history.loading")}</p></Show>
      <Show when={failed()}><p role="alert">{t("chat.history.error")}</p></Show>
      <Show when={chunk()}>{page => <>
        <pre class="max-h-80 overflow-auto whitespace-pre-wrap break-all">{page().text}</pre>
        <span>{page().offset}–{page().next} / {page().total}</span>
        <Pressable class="mx-2" disabled={loading() || page().offset === 0} onClick={() => {
          const rest = offsets().slice(0, -1); setOffsets(rest); void read(ref(), rest.at(-1) ?? 0, true);
        }}>{t("chat.history.previous")}</Pressable>
        <Pressable disabled={loading() || page().done} onClick={() => void read(ref(), page().next)}>{t("chat.history.next")}</Pressable>
      </>}</Show>
    </div>}</Show>
  </div>
  </Show>
  </>;
}
