import { createEffect, createMemo, createSignal, on, onCleanup, onMount, Show } from "solid-js";
import { openExternalTarget } from "../../../host/src/file-preview";
import {
  executePluginProxyHttp,
  subscribeMessagingEvents,
  unwrapPluginSseEvent,
  type PluginSseEvent,
} from "../../../platform-client/src/messaging-proxy";
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
 * Implementa el puente de Modalidad 1 (`proxy`, cero tokens en el `<iframe>`,
 * #398 / #400 / #401):
 * - Handshake `danil:ready` / `ui/initialize` → `danil:context` (`mode: 'proxy'`)
 * - RPC `danil/http` hacia el borde con allowlist y sesión del host
 * - Stream SSE de eventos de mensajería reenviado como `danil/event`
 * - Sincronización de tema (`terminus:visual-theme` y `ui/notifications/host-context-changed`)
 * - Utilidades `ui/open-link`, `ui/download`, `ui/badge` y `danil:channel-connected`
 */
export default function PluginFrame(props: {
  pluginId: string;
  title: string;
  url: string;
  workspaceId?: string | null;
  orgId?: string | null;
  onBadge?: (count: number) => void;
  onChannelConnected?: (payload: unknown) => void;
}) {
  let container: HTMLDivElement | undefined;
  let frame: HTMLIFrameElement | undefined;
  const [loaded, setLoaded] = createSignal(false);
  const [ready, setReady] = createSignal(false);
  const targetOrigin = createMemo(() => originOf(props.url));
  const pendingRequests = new AbortController();

  const postToFrame = (payload: unknown) => {
    const origin = targetOrigin();
    if (!origin || !frame?.contentWindow) return;
    frame.contentWindow.postMessage(payload, origin);
  };

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

  const sendContext = () => {
    const theme = readTheme();
    postToFrame({
      type: "danil:context",
      mode: "proxy",
      orgId: props.orgId ?? null,
      workspaceId: props.workspaceId ?? null,
      theme: theme.mode,
    });
  };

  const syncTheme = () => {
    const theme = readTheme();
    postToFrame({ type: "terminus:visual-theme", theme });
    postToFrame({
      jsonrpc: "2.0",
      method: "ui/notifications/host-context-changed",
      params: { theme: theme.mode },
    });
  };

  const forwardSseEvent = (event: PluginSseEvent) => {
    postToFrame({ type: "danil/event", event: unwrapPluginSseEvent(event) });
  };

  const handleHttpRpc = async (id: unknown, rawParams: unknown) => {
    const params = (rawParams && typeof rawParams === "object" ? rawParams : {}) as Record<string, unknown>;
    try {
      const result = await executePluginProxyHttp({
        method: typeof params.method === "string" ? params.method : "GET",
        path: typeof params.path === "string" ? params.path : "",
        headers:
          params.headers && typeof params.headers === "object" && !Array.isArray(params.headers)
            ? (params.headers as Record<string, string>)
            : undefined,
        body: params.body,
        workspaceId: props.workspaceId,
        signal: pendingRequests.signal,
      });
      postToFrame({ jsonrpc: "2.0", id, result });
    } catch (error) {
      if (pendingRequests.signal.aborted) return;
      postToFrame({
        jsonrpc: "2.0",
        id,
        error: {
          code: -32000,
          message: error instanceof Error ? error.message : "proxy_request_failed",
        },
      });
    }
  };

  createEffect(
    on([ready, () => props.workspaceId, () => props.orgId], ([isReady]) => {
      if (!isReady) return;
      sendContext();
      if (props.pluginId !== "messaging") return;
      const stopSse = subscribeMessagingEvents({
        workspaceId: props.workspaceId,
        onEvent: forwardSseEvent,
      });
      onCleanup(stopSse);
    }),
  );

  onMount(() => {
    const onMessage = (event: MessageEvent) => {
      const origin = targetOrigin();
      if (!origin || !frame?.contentWindow || event.source !== frame.contentWindow || event.origin !== origin) return;
      const msg = event.data;
      if (!msg || typeof msg !== "object") return;

      if (msg.type === "danil:ready") {
        setLoaded(true);
        setReady(true);
        sendContext();
        syncTheme();
        return;
      }

      if (msg.method === "ui/initialize") {
        setLoaded(true);
        setReady(true);
        if (msg.id !== undefined) {
          postToFrame({
            jsonrpc: "2.0",
            id: msg.id,
            result: {
              protocolVersion: "2025-11-25",
              hostInfo: { name: "Danil", version: "0.3.5" },
              hostCapabilities: { openLinks: {}, downloadFile: {}, proxyHttp: true },
              hostContext: {
                theme: readTheme().mode,
                orgId: props.orgId ?? null,
                workspaceId: props.workspaceId ?? null,
              },
            },
          });
        }
        sendContext();
        syncTheme();
        return;
      }

      if (msg.method === "danil/http" && msg.id !== undefined) {
        void handleHttpRpc(msg.id, msg.params);
        return;
      }

      if ((msg.method === "ui/open-link" || msg.method === "ui/download") && isSafeExternalUrl(msg.params?.url)) {
        void openExternalTarget(msg.params.url).catch(() => {});
        return;
      }

      if (msg.method === "ui/badge" && typeof msg.params?.count === "number" && Number.isFinite(msg.params.count)) {
        props.onBadge?.(Math.max(0, Math.floor(msg.params.count)));
        return;
      }

      if (msg.type === "danil:channel-connected" || msg.method === "ui/notifications/channel-connected") {
        props.onChannelConnected?.(msg.params ?? msg);
      }
    };

    window.addEventListener("message", onMessage);
    const themeObserver = new MutationObserver(syncTheme);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "data-light-style", "data-dark-style", "style"],
    });
    onCleanup(() => {
      pendingRequests.abort();
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
        allow="clipboard-write; microphone"
        referrerPolicy="no-referrer"
        class="block h-full w-full flex-1 border-0 bg-surface"
        onLoad={() => {
          setLoaded(true);
          sendContext();
          syncTheme();
        }}
      />
    </div>
  );
}
