import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import { cn, SignalDot, taskSignalTone } from "@danil/ui";
import type { AttentionState } from "./organization-rail-model.ts";

/** Las iniciales de las dos primeras palabras; una sola palabra da una letra. */
export function monogram(name: string) {
  const words = name.trim().split(/[\s\-_.]+/).filter(Boolean);
  return words.slice(0, 2).map((word) => [...word][0] ?? "").join("").toUpperCase() || "?";
}

/** El logo del workspace, o sus iniciales si no hay imagen o todavía no carga. */
export function MarcaDeWorkspace(props: { id?: string; name: string; logo?: string | null; load?: () => Promise<string | null> }) {
  const [url, setUrl] = createSignal<string | null>(props.logo ?? null);
  createEffect(() => {
    if (props.load) {
      let vivo = true;
      onCleanup(() => {
        vivo = false;
      });
      void props.load().then((siguiente) => {
        if (vivo) setUrl(siguiente);
      }, () => undefined);
      return;
    }
    setUrl(props.logo ?? null);
  });
  return (
    <Show when={url()} fallback={<>{monogram(props.name)}</>}>
      {(src) => <img src={src()} alt="" draggable={false} class="absolute inset-0 size-full object-cover" />}
    </Show>
  );
}

/** Lo más urgente de un workspace: la señal común sobre un disco de superficie. */
export function AttentionBadge(props: { state: AttentionState; class?: string }) {
  return (
    <span data-attention-badge={props.state} class={cn("grid size-3 shrink-0 place-items-center rounded-full bg-surface", props.class)}>
      <SignalDot tone={taskSignalTone(props.state)} />
    </span>
  );
}
