import { useEffect, useMemo, useRef, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import {
  executePluginProxyHttp,
  subscribeMessagingEvents,
  unwrapPluginSseEvent,
  type PluginSseEvent,
} from "../../../../packages/platform-client/src/messaging-proxy";
import { useAccount } from "../lib/account";
import { useHomeLabel } from "../lib/homeLabel";
import { useWorkspaces } from "../lib/workspaces";
import { NavBar, pageColor } from "../ui/list";
import { useTheme } from "../ui/theme";

const MESSAGING_ORIGIN = "https://messaging.danil.ai";
const DEFAULT_EDGE_ORIGIN = "https://edge.danil.ai";

function safeExternalUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export default function MessagingScreen() {
  const theme = useTheme();
  const back = useHomeLabel();
  const account = useAccount();
  const { current } = useWorkspaces();

  const orgId = account.organizations?.state.kind === "ready" ? account.organizations.state.active : null;
  const workspaceId = current?.id ?? null;
  const edgeOrigin = useMemo(() => {
    const configured = process.env.EXPO_PUBLIC_DANIL_EDGE_ORIGIN?.trim();
    return configured && /^https?:\/\//i.test(configured) ? configured.replace(/\/+$/, "") : DEFAULT_EDGE_ORIGIN;
  }, []);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [frameReady, setFrameReady] = useState(false);

  const postToFrame = (payload: unknown) => {
    const targetWindow = iframeRef.current?.contentWindow;
    if (!targetWindow) return;
    targetWindow.postMessage(payload, MESSAGING_ORIGIN);
  };

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const abortController = new AbortController();

    const sendContext = () => {
      postToFrame({
        type: "danil:context",
        mode: "proxy",
        orgId: orgId ?? null,
        workspaceId: workspaceId ?? null,
        theme: theme.dark ? "dark" : "light",
      });
    };

    const syncHostTheme = () => {
      postToFrame({
        jsonrpc: "2.0",
        method: "ui/notifications/host-context-changed",
        params: { theme: theme.dark ? "dark" : "light" },
      });
    };

    const handleHttp = async (id: unknown, rawParams: unknown) => {
      const params = (rawParams && typeof rawParams === "object" ? rawParams : {}) as Record<string, unknown>;
      try {
        const result = await executePluginProxyHttp(
          {
            method: typeof params.method === "string" ? params.method : "GET",
            path: typeof params.path === "string" ? params.path : "",
            headers:
              params.headers && typeof params.headers === "object" && !Array.isArray(params.headers)
                ? (params.headers as Record<string, string>)
                : undefined,
            body: params.body,
            workspaceId,
            signal: abortController.signal,
          },
          { origin: edgeOrigin },
        );
        postToFrame({ jsonrpc: "2.0", id, result });
      } catch (error) {
        if (abortController.signal.aborted) return;
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

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== MESSAGING_ORIGIN) return;
      const frameWindow = iframeRef.current?.contentWindow;
      if (!frameWindow || event.source !== frameWindow) return;
      const msg = event.data as Record<string, unknown> | null;
      if (!msg || typeof msg !== "object") return;

      if (msg.type === "danil:ready") {
        setFrameReady(true);
        sendContext();
        syncHostTheme();
        return;
      }

      if (msg.method === "ui/initialize") {
        setFrameReady(true);
        if (msg.id !== undefined) {
          postToFrame({
            jsonrpc: "2.0",
            id: msg.id,
            result: {
              protocolVersion: "2025-11-25",
              hostInfo: { name: "Danil Mobile Web", version: "1.0.0" },
              hostCapabilities: { openLinks: {}, downloadFile: {}, proxyHttp: true },
              hostContext: {
                theme: theme.dark ? "dark" : "light",
                orgId: orgId ?? null,
                workspaceId: workspaceId ?? null,
              },
            },
          });
        }
        sendContext();
        syncHostTheme();
        return;
      }

      if (msg.method === "danil/http" && msg.id !== undefined) {
        void handleHttp(msg.id, msg.params);
        return;
      }

      if (msg.method === "ui/open-link" || msg.method === "ui/download") {
        const params = msg.params as { url?: unknown } | undefined;
        const safeUrl = safeExternalUrl(params?.url);
        if (safeUrl) window.open(safeUrl, "_blank", "noopener,noreferrer");
      }
    };

    window.addEventListener("message", onMessage);
    if (frameReady) {
      sendContext();
      syncHostTheme();
    }
    return () => {
      abortController.abort();
      window.removeEventListener("message", onMessage);
    };
  }, [edgeOrigin, frameReady, orgId, theme.dark, workspaceId]);

  useEffect(() => {
    if (Platform.OS !== "web" || !frameReady || !orgId) return;
    const stop = subscribeMessagingEvents({
      workspaceId,
      origin: edgeOrigin,
      onEvent: (event: PluginSseEvent) => {
        postToFrame({ type: "danil/event", event: unwrapPluginSseEvent(event) });
      },
    });
    return () => stop();
  }, [edgeOrigin, frameReady, orgId, workspaceId]);

  return (
    <View style={[styles.root, { backgroundColor: pageColor(theme) }]}>
      <NavBar back={back} title="Mensajería" />
      {Platform.OS === "web" ? (
        <View style={styles.frameWrap}>
          {/* HTML iframe embebido solo en móvil web usando el puente Modalidad 1 sin tokens */}
          <iframe
            ref={iframeRef}
            src={MESSAGING_ORIGIN}
            title="Danil Mensajería"
            allow="microphone; clipboard-read; clipboard-write; autoplay"
            style={{ width: "100%", height: "100%", border: 0, display: "block" }}
          />
        </View>
      ) : (
        <View style={styles.fallback}>
          <Text style={{ color: theme.textMuted, textAlign: "center" }}>
            Mensajería en móvil está disponible desde la web (beta.danil.ai/m/).
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  frameWrap: { flex: 1, overflow: "hidden" },
  fallback: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
});
