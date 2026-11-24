import { createEffect, createSignal, onCleanup, Show, untrack } from "solid-js";
import { cn } from "../../../ui/src/lib/utils";
import { SignalDot, taskSignalTone } from "../../../ui/src/SignalDot";
import type { AttentionState } from "./attention";
import { cachedLogoUrl, generacionDeLogo, readLogoUrl } from "./logo-src";
import { cachedOrganizationLogo, readOrganizationLogo } from "./organization-logo";

/** Las iniciales de las dos primeras palabras; una sola palabra da una letra. */
function monogram(name: string) {
  const words = name.trim().split(/[\s\-_.]+/).filter(Boolean);
  return words.slice(0, 2).map((word) => [...word][0] ?? "").join("").toUpperCase() || "?";
}

/** El logo del workspace, o sus iniciales si no hay imagen o todavía no carga. */
/** `id`: en la web, el logo de un workspace de la cuenta sale de la cuenta (`urlDeLogo`). */
export function MarcaDeWorkspace(props: { id?: string; context?: string | null; name: string; logo?: string | null; load?: () => Promise<string | null> }) {
  const cachedCurrent = () => {
    if (props.load) return null;
    if (props.context && props.id) return cachedOrganizationLogo(props.context, props.id);
    return cachedLogoUrl(props.logo ?? null, props.id ?? null);
  };
  const [url, setUrl] = createSignal<string | null>(cachedCurrent());
  let lastIdentity = "";

  createEffect(() => {
    // Un workspace de otra cuenta trae su propio lector, con el token de su cuenta.
    const loader = props.load;
    if (loader) {
      const identity = `load:${props.id ?? props.name}`;
      if (identity !== lastIdentity) {
        lastIdentity = identity;
        setUrl(null);
      }
      let vivo = true;
      onCleanup(() => {
        vivo = false;
      });
      void loader().then((siguiente) => {
        if (vivo) setUrl(siguiente);
      }, () => undefined);
      return;
    }

    const context = props.context ?? null;
    const workspace = props.id ?? null;
    const path = props.logo ?? null;
    const gen = generacionDeLogo();

    if (context && workspace) {
      const identity = `org:${context}:${workspace}`;
      const cached = cachedOrganizationLogo(context, workspace);
      if (identity !== lastIdentity) {
        lastIdentity = identity;
        setUrl(cached);
      } else if (cached && !untrack(url)) {
        setUrl(cached);
      }
      let vivo = true;
      onCleanup(() => {
        vivo = false;
      });
      void readOrganizationLogo(context, workspace, path).then((res) => {
        if (vivo && generacionDeLogo() === gen && res.ok) setUrl(res.url);
      });
      return;
    }

    const identity = workspace ? `ws:${workspace}` : `path:${path ?? ""}`;
    const cached = cachedLogoUrl(path, workspace);
    if (identity !== lastIdentity) {
      lastIdentity = identity;
      setUrl(cached);
    } else if (cached && !untrack(url)) {
      setUrl(cached);
    }
    if (!path && !workspace) {
      setUrl(null);
      return;
    }
    let vivo = true;
    onCleanup(() => {
      vivo = false;
    });
    void readLogoUrl(path, workspace).then((res) => {
      if (vivo && generacionDeLogo() === gen && res.ok) setUrl(res.url);
    });
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

