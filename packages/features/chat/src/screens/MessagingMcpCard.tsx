import { createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { openExternalTarget } from "../../../../host/src/file-preview";
import { VISUAL_THEME_TOKENS, type VisualTheme } from "../../../../ui/src/lib/chat/inlineVisual";
import { t } from "../../../../ui/src/lib/i18n";
import { isSafeExternalUrl, originOf } from "../../../../ui/src/lib/url";
import type { MessagingCardTarget } from "../model/messagingMcpApp";
import { proxyMessagingCardHttp } from "../queries/messaging-connect";

const CARD_SANDBOX =
  "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox";

/**
 * Tarjeta compacta MCP App en el chat (`?mode=card&entity=conversation|campaign&id=<id>`).
 * Ajusta su altura mediante `terminus:visual-height` / `ui/notifications/size-changed`
 * y atiende `danil/http` vía Modalidad 1 (`proxy`).
 */
export default function MessagingMcpCard(props: { target: MessagingCardTarget; workspaceId?: string | null }) {
  let frame: HTMLIFrameElement | undefined;
  const [height, setHeight] = createSignal(220);
  const targetOrigin = createMemo(() => originOf(props.target.url));
  const pending = new AbortController();

  const readTheme = (): VisualTheme => {
    const root = document.documentElement;
    const tokens = getComputedStyle(root);
    return {
      mode: root.dataset.theme === "dark" ? "dark" : "light",
      tokens: Object.fromEntries(VISUAL_THEME_TOKENS.map((k) => [k, tokens.getPropertyValue(k).trim()])),
      fontFamily: getComputedStyle(root).fontFamily,
      fontSize: getComputedStyle(root).fontSize,
      lineHeight: getComputedStyle(root).lineHeight,
    };
  };

  const syncContextAndTheme = () => {
    const origin = targetOrigin();
    if (!origin || !frame?.contentWindow) return;
    const theme = readTheme();
    frame.contentWindow.postMessage(
      { type: "danil:context", mode: "proxy", workspaceId: props.workspaceId ?? null, theme: theme.mode },
      origin,
    );
    frame.contentWindow.postMessage({ type: "terminus:visual-theme", theme }, origin);
    frame.contentWindow.postMessage(
      { jsonrpc: "2.0", method: "ui/notifications/host-context-changed", params: { theme: theme.mode } },
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
        syncContextAndTheme();
        return;
      }

      if (msg.method === "ui/initialize") {
        if (msg.id !== undefined) {
          frame.contentWindow.postMessage(
            {
              jsonrpc: "2.0",
              id: msg.id,
              result: {
                protocolVersion: "2025-11-25",
                hostInfo: { name: "Danil", version: "0.3.5" },
                hostCapabilities: { openLinks: {}, proxyHttp: true },
                hostContext: { theme: readTheme().mode, workspaceId: props.workspaceId ?? null },
              },
            },
            origin,
          );
        }
        syncContextAndTheme();
        return;
      }

      const nextHeight =
        msg.type === "terminus:visual-height"
          ? msg.height
          : msg.method === "ui/notifications/size-changed"
            ? msg.params?.height
            : undefined;
      if (typeof nextHeight === "number" && Number.isFinite(nextHeight)) {
        setHeight(Math.max(120, Math.min(720, Math.ceil(nextHeight))));
        return;
      }

      if (msg.method === "danil/http" && msg.id !== undefined) {
        const params = (msg.params && typeof msg.params === "object" ? msg.params : {}) as Record<string, unknown>;
        void proxyMessagingCardHttp({
          method: typeof params.method === "string" ? params.method : "GET",
          path: typeof params.path === "string" ? params.path : "",
          headers:
            params.headers && typeof params.headers === "object" && !Array.isArray(params.headers)
              ? (params.headers as Record<string, string>)
              : undefined,
          body: params.body,
          workspaceId: props.workspaceId,
          signal: pending.signal,
        }).then((result) => {
          frame?.contentWindow?.postMessage({ jsonrpc: "2.0", id: msg.id, result }, origin);
        }).catch((error) => {
          if (pending.signal.aborted) return;
          frame?.contentWindow?.postMessage(
            { jsonrpc: "2.0", id: msg.id, error: { code: -32000, message: error instanceof Error ? error.message : "proxy_failed" } },
            origin,
          );
        });
        return;
      }

      if (msg.method === "ui/open-link" && isSafeExternalUrl(msg.params?.url)) {
        void openExternalTarget(msg.params.url).catch(() => {});
      }
    };

    window.addEventListener("message", onMessage);
    onCleanup(() => {
      pending.abort();
      window.removeEventListener("message", onMessage);
    });
  });

  return (
    <div
      class="my-2 overflow-hidden rounded-xl border border-border bg-surface-raised"
      data-messaging-mcp-card={`${props.target.entity}:${props.target.id}`}
    >
      <iframe
        ref={frame}
        src={props.target.url}
        title={t("chat.mcp_app.title", { name: props.target.entity })}
        sandbox={CARD_SANDBOX}
        referrerPolicy="no-referrer"
        class="block w-full border-0 bg-transparent"
        style={{ height: `${height()}px` }}
        onLoad={syncContextAndTheme}
      />
    </div>
  );
}
