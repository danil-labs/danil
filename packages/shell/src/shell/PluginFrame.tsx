import { createMemo, createSignal, onCleanup, onMount, Show } from "solid-js";
import { openExternalTarget } from "../../../host/src/file-preview";
import { VISUAL_THEME_TOKENS, type VisualTheme } from "../../../ui/src/lib/chat/inlineVisual";
import { t } from "../../../ui/src/lib/i18n";
import { Spinner } from "../../../ui/src/Spinner";

const PLUGIN_SANDBOX =
  "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads";

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function isSafeExternalUrl(raw: unknown): raw is string {
  if (typeof raw !== "string") return false;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * Contenedor `<iframe>` para una pestaña de aplicación o conector visual.
 *
 * Mantiene el marco vivo mientras la pestaña exista (se oculta al cambiar de
 * pestaña sin recargar), sincroniza el tema del host hacia el origen exacto
 * del conector y delega la apertura de enlaces externos (`ui/open-link`).
 */
export default function PluginFrame(props: {
  pluginId: string;
  title: string;
  url: string;
}) {
  let container: HTMLDivElement | undefined;
  let frame: HTMLIFrameElement | undefined;
  const [loaded, setLoaded] = createSignal(false);
  const targetOrigin = createMemo(() => originOf(props.url));

  const readTheme = (): VisualTheme => {
    const root = document.documentElement;
    const tokens = getComputedStyle(root);
    const text = getComputedStyle(container ?? root);
    return {
      mode: root.dataset.theme === "dark" ? "dark" : "light",
      tokens: Object.fromEntries(VISUAL_THEME_TOKENS.map((key) => [key, tokens.getPropertyValue(key).trim()])),
      fontFamily: text.fontFamily,
      fontSize: text.fontSize,
      lineHeight: text.lineHeight,
    };
  };

  const syncTheme = () => {
    const origin = targetOrigin();
    if (!origin || !frame?.contentWindow) return;
    const theme = readTheme();
    frame.contentWindow.postMessage({ type: "terminus:visual-theme", theme }, origin);
    frame.contentWindow.postMessage(
      {
        jsonrpc: "2.0",
        method: "ui/notifications/host-context-changed",
        params: { theme: theme.mode },
      },
      origin,
    );
  };

  onMount(() => {
    const onMessage = (event: MessageEvent) => {
      const origin = targetOrigin();
      if (!origin || !frame?.contentWindow || event.source !== frame.contentWindow || event.origin !== origin) return;
      const msg = event.data;
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "danil:ready") {
        setLoaded(true);
        syncTheme();
        return;
      }
      if (msg.method === "ui/open-link" && isSafeExternalUrl(msg.params?.url)) {
        void openExternalTarget(msg.params.url).catch(() => {});
      }
    };

    window.addEventListener("message", onMessage);
    const themeObserver = new MutationObserver(syncTheme);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "data-light-style", "data-dark-style", "style"],
    });
    onCleanup(() => {
      window.removeEventListener("message", onMessage);
      themeObserver.disconnect();
    });
  });

  return (
    <div
      ref={container}
      class="relative flex h-full w-full flex-col overflow-hidden bg-surface"
      data-plugin-frame={props.pluginId}
    >
      <Show when={!loaded()}>
        <div
          class="pointer-events-none absolute inset-0 z-10 flex items-center justify-center gap-2 bg-surface text-xs text-neutral-500"
          role="status"
        >
          <Spinner size={16} label={t("shell.plugin.loading", { name: props.title })} />
          <span>{t("shell.plugin.loading", { name: props.title })}</span>
        </div>
      </Show>
      <iframe
        ref={frame}
        src={props.url}
        title={props.title}
        sandbox={PLUGIN_SANDBOX}
        allow="clipboard-write"
        referrerPolicy="no-referrer"
        class="block h-full w-full flex-1 border-0 bg-surface"
        onLoad={() => {
          setLoaded(true);
          syncTheme();
        }}
      />
    </div>
  );
}
