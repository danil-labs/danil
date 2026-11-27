import Check from "lucide-solid/icons/check";
import Copy from "lucide-solid/icons/copy";
import Globe from "lucide-solid/icons/globe";
import MessageCircle from "lucide-solid/icons/message-circle";
import RefreshCw from "lucide-solid/icons/refresh-cw";
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { openExternalTarget } from "../../../../host/src/file-preview";
import { Button } from "../../../../ui/src/Button";
import { Input } from "../../../../ui/src/Input";
import { Spinner } from "../../../../ui/src/Spinner";
import { t } from "../../../../ui/src/lib/i18n";
import { cn } from "../../../../ui/src/lib/utils";
import {
  ALLOWED_MESSAGING_ORIGINS,
  classifyConnectProblem,
  deriveInitialConnectPhase,
  isSafeConnectUrl,
  parseAllowedOriginsInput,
  parseConnectSessionPayload,
  type ConnectCardPhase,
  type MessagingChannelType,
  type MessagingConnectAsset,
} from "../model/messagingMcpApp";
import type { McpAppCall } from "../model/transcript";
import {
  fetchConnectSessionStatus,
  submitConnectSessionCompletion,
  type ConnectSessionState,
} from "../queries/messaging-connect";

const POLL_INTERVAL_MS = 2_500;
const MAX_POLL_DURATION_MS = 5 * 60_000;

function channelLabel(type: MessagingChannelType): string {
  if (type === "instagram") return "Instagram";
  if (type === "messenger") return "Messenger";
  if (type === "web") return t("chat.messaging_connect.channel.web");
  return "WhatsApp";
}

function channelBadgeClass(type: MessagingChannelType): string {
  if (type === "instagram") return "bg-primary/15 text-primary border-primary/25";
  if (type === "messenger") return "bg-info/15 text-info-strong border-info/25";
  if (type === "web") return "bg-neutral-200 text-neutral-700 border-border";
  return "bg-success/15 text-success-strong border-success/25";
}

function resolveProblem(status: number, code: string | null | undefined, fallback?: string | null) {
  const classified = classifyConnectProblem(status, code);
  const message =
    classified.key === "chat.messaging_connect.error_generic" && fallback
      ? fallback
      : t(classified.key);
  return { phase: classified.phase, message };
}

/**
 * Tarjeta interactiva in-chat para `messaging_connect_channel_start` (`ui://danil-messaging/connect`).
 * Delega el popup de Meta/OAuth al origen aislado de mensajería (sin abrir `script-src` en Danil)
 * y sincroniza el cierre por `postMessage` y sondeo de estado vía `queries/messaging-connect`.
 */
export default function MessagingConnectCard(props: { call: McpAppCall; workspaceId?: string | null }) {
  const initial = parseConnectSessionPayload(props.call);
  if (!initial) return null;

  const [phase, setPhase] = createSignal<ConnectCardPhase>(deriveInitialConnectPhase(initial));
  const [channelName, setChannelName] = createSignal<string | null>(initial.channelName);
  const [publishableKey, setPublishableKey] = createSignal<string | null>(initial.publishableKey);
  const [assets, setAssets] = createSignal<MessagingConnectAsset[]>(initial.discoveredAssets);
  const [errorText, setErrorText] = createSignal<string | null>(
    initial.errorCode ? resolveProblem(0, initial.errorCode, initial.errorMessage).message : initial.errorMessage,
  );
  const [allowedOrigins, setAllowedOrigins] = createSignal("");
  const [welcomeMessage, setWelcomeMessage] = createSignal("");
  const [copiedKey, setCopiedKey] = createSignal(false);

  let popup: Window | null = null;
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let pollStartedAt = 0;
  let disposed = false;

  const stopPolling = () => {
    if (pollTimer !== undefined) {
      clearInterval(pollTimer);
      pollTimer = undefined;
    }
  };

  const applySessionUpdate = (next: ConnectSessionState) => {
    if (next.channel_name) setChannelName(next.channel_name);
    if (next.publishable_key) setPublishableKey(next.publishable_key);
    if (Array.isArray(next.discovered_assets) && next.discovered_assets.length > 0) {
      setAssets(next.discovered_assets);
    }
    if (next.status === "connected" || next.status === "completed") {
      stopPolling();
      setErrorText(null);
      setPhase("connected");
    } else if (next.status === "selecting_asset") {
      stopPolling();
      setErrorText(null);
      setPhase("selecting_asset");
    } else if (next.status === "expired") {
      stopPolling();
      setErrorText(t("chat.messaging_connect.error_expired"));
      setPhase("expired");
    } else if (next.status === "failed") {
      stopPolling();
      const mapped = resolveProblem(0, next.error_code, next.error_message);
      setErrorText(mapped.message);
      setPhase(mapped.phase);
    }
  };

  const pollOnce = async () => {
    if (disposed || !initial.id) return;
    if (Date.now() - pollStartedAt > MAX_POLL_DURATION_MS) {
      stopPolling();
      return;
    }
    try {
      const res = await fetchConnectSessionStatus(initial.id, { workspaceId: props.workspaceId });
      if (disposed) return;
      if (res.ok && res.session) {
        applySessionUpdate(res.session);
      } else if (res.status === 410 || res.problem?.code === "connect_session_expired") {
        stopPolling();
        setErrorText(t("chat.messaging_connect.error_expired"));
        setPhase("expired");
      }
    } catch {
      // Fallo transitorio de red: reintenta en el siguiente ciclo.
    }
  };

  const startPolling = () => {
    stopPolling();
    if (!initial.id) return;
    pollStartedAt = Date.now();
    pollTimer = setInterval(() => void pollOnce(), POLL_INTERVAL_MS);
  };

  const completeWith = async (payload: Record<string, unknown>) => {
    if (!initial.id) return;
    stopPolling();
    setPhase("completing");
    setErrorText(null);
    try {
      const res = await submitConnectSessionCompletion(initial.id, payload, { workspaceId: props.workspaceId });
      if (disposed) return;
      if (res.ok && res.session) {
        applySessionUpdate(res.session);
        if (phase() === "completing") setPhase("connected");
      } else {
        const code = typeof res.problem?.code === "string" ? res.problem.code : null;
        const detail = typeof res.problem?.detail === "string" ? res.problem.detail : null;
        const mapped = resolveProblem(res.status, code, detail);
        setErrorText(mapped.message);
        setPhase(mapped.phase);
      }
    } catch {
      if (!disposed) {
        setErrorText(t("chat.messaging_connect.error_generic"));
        setPhase("error");
      }
    }
  };

  const openConnectPopup = () => {
    if (!isSafeConnectUrl(initial.connectUrl)) {
      setErrorText(t("chat.messaging_connect.error_invalid_url"));
      setPhase("error");
      return;
    }
    setErrorText(null);
    setPhase("waiting");
    const width = 640;
    const height = 760;
    const left = Math.max(0, Math.round((window.screenX || 0) + (window.outerWidth - width) / 2));
    const top = Math.max(0, Math.round((window.screenY || 0) + (window.outerHeight - height) / 2));
    const opened = window.open(
      initial.connectUrl,
      "danil_channel_connect",
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`,
    );
    if (opened) {
      popup = opened;
      popup.focus();
    } else {
      // En Desk (Tauri) o si el navegador bloqueó el popup, abre en el navegador del sistema.
      void openExternalTarget(initial.connectUrl).catch(() => {});
    }
    startPolling();
  };

  const submitWebChannel = () => {
    const origins = parseAllowedOriginsInput(allowedOrigins());
    void completeWith({
      allowed_origins: origins,
      ...(welcomeMessage().trim() ? { welcome_message: welcomeMessage().trim() } : {}),
    });
  };

  const copyPublishableKey = () => {
    const key = publishableKey();
    if (!key) return;
    void navigator.clipboard?.writeText(key).then(() => {
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 1800);
    }).catch(() => {});
  };

  onMount(() => {
    const onMessage = (event: MessageEvent) => {
      if (!ALLOWED_MESSAGING_ORIGINS.has(event.origin)) return;
      const msg = event.data;
      if (!msg || typeof msg !== "object") return;

      if (msg.type === "danil:channel-connected" || msg.method === "ui/notifications/channel-connected") {
        const params = (msg.params && typeof msg.params === "object" ? msg.params : msg) as Record<string, unknown>;
        if (initial.id && (typeof params.session_id !== "string" || params.session_id !== initial.id)) return;
        stopPolling();
        if (typeof params.channel_name === "string") setChannelName(params.channel_name);
        setErrorText(null);
        setPhase("connected");
        return;
      }

      if (msg.type === "danil_channel_oauth") {
        if (typeof msg.error === "string" && msg.error) {
          stopPolling();
          setErrorText(typeof msg.error_description === "string" ? msg.error_description : msg.error);
          setPhase("error");
          return;
        }
        if (typeof msg.code === "string" && msg.code) {
          if (initial.state && typeof msg.state === "string" && msg.state !== initial.state) return;
          void completeWith({ code: msg.code, state: typeof msg.state === "string" ? msg.state : initial.state });
        }
      }
    };

    window.addEventListener("message", onMessage);
    onCleanup(() => {
      disposed = true;
      stopPolling();
      window.removeEventListener("message", onMessage);
    });
  });

  const name = () => channelLabel(initial.channelType);
  const subtitle = () =>
    initial.channelType === "web"
      ? t("chat.messaging_connect.subtitle_web")
      : t("chat.messaging_connect.subtitle_meta");

  return (
    <div
      class="my-2.5 flex flex-col gap-3 rounded-xl border border-border bg-surface-raised p-4"
      data-messaging-connect-card={initial.channelType}
      data-connect-phase={phase()}
    >
      <div class="flex items-start gap-3">
        <span
          aria-hidden="true"
          class={cn(
            "grid size-10 shrink-0 place-items-center rounded-lg border",
            channelBadgeClass(initial.channelType),
          )}
        >
          <Show when={initial.channelType === "web"} fallback={<MessageCircle size={18} />}>
            <Globe size={18} />
          </Show>
        </span>
        <div class="min-w-0 flex-1">
          <p class="m-0 text-sm font-semibold text-neutral-950">
            {t("chat.messaging_connect.title", { channel: name() })}
          </p>
          <p class="m-0 mt-0.5 text-xs text-neutral-500">{subtitle()}</p>
        </div>
        <Show when={phase() === "connected"}>
          <span class="inline-flex shrink-0 items-center gap-1 rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-medium text-success-strong">
            <Check size={12} aria-hidden="true" />
            {t("chat.messaging_connect.connected_badge")}
          </span>
        </Show>
      </div>

      <Show when={initial.channelType === "web" && phase() !== "connected" && phase() !== "expired"}>
        <div class="flex flex-col gap-2">
          <Input
            type="text"
            aria-label={t("chat.messaging_connect.web_origins_label")}
            placeholder={t("chat.messaging_connect.web_origins_placeholder")}
            value={allowedOrigins()}
            onInput={(e) => setAllowedOrigins(e.currentTarget.value)}
          />
          <Input
            type="text"
            aria-label={t("chat.messaging_connect.web_welcome_label")}
            placeholder={t("chat.messaging_connect.web_welcome_placeholder")}
            value={welcomeMessage()}
            onInput={(e) => setWelcomeMessage(e.currentTarget.value)}
          />
          <Button variant="terminal" class="w-full" disabled={phase() === "completing"} onClick={submitWebChannel}>
            <Show when={phase() === "completing"} fallback={t("chat.messaging_connect.web_submit")}>
              <Spinner size={14} label={t("chat.messaging_connect.completing")} />
              <span>{t("chat.messaging_connect.completing")}</span>
            </Show>
          </Button>
        </div>
      </Show>

      <Show when={initial.channelType !== "web" && (phase() === "idle" || phase() === "error")}>
        <Button variant="terminal" class="w-full" data-messaging-connect-action="" onClick={openConnectPopup}>
          {t("chat.messaging_connect.cta", { channel: name() })}
        </Button>
      </Show>

      <Show when={phase() === "waiting" || phase() === "completing"}>
        <div class="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2.5 text-xs text-neutral-700">
          <span class="flex min-w-0 items-center gap-2">
            <Spinner size={14} label={t("chat.messaging_connect.waiting_meta")} />
            <span class="truncate">
              {phase() === "completing" ? t("chat.messaging_connect.completing") : t("chat.messaging_connect.waiting_meta")}
            </span>
          </span>
          <Show when={phase() === "waiting"}>
            <Button variant="ghost" size="sm" onClick={openConnectPopup}>
              <RefreshCw size={12} aria-hidden="true" />
              <span>{t("chat.messaging_connect.reopen")}</span>
            </Button>
          </Show>
        </div>
      </Show>

      <Show when={phase() === "selecting_asset" && assets().length > 0}>
        <div class="flex flex-col gap-1.5" data-messaging-connect-assets="">
          <p class="m-0 text-xs font-medium text-neutral-700">{t("chat.messaging_connect.select_asset")}</p>
          <For each={assets()}>
            {(asset) => (
              <Button variant="outline" class="justify-start text-left" onClick={() => void completeWith({ page_id: asset.id })}>
                <span class="truncate font-medium">{asset.name}</span>
                <Show when={asset.category}>{(cat) => <span class="ml-auto text-xs text-neutral-500">{cat()}</span>}</Show>
              </Button>
            )}
          </For>
        </div>
      </Show>

      <Show when={phase() === "connected"}>
        <div class="flex flex-col gap-2 rounded-lg border border-border bg-surface px-3 py-2.5 text-xs text-neutral-700">
          <p class="m-0 font-medium text-neutral-950">
            {channelName()
              ? t("chat.messaging_connect.connected_named", { name: channelName()! })
              : t("chat.messaging_connect.connected_generic", { channel: name() })}
          </p>
          <Show when={publishableKey()}>
            {(key) => (
              <div class="flex items-center gap-2">
                <code class="min-w-0 flex-1 truncate rounded bg-surface-muted px-2 py-1 font-mono text-2xs text-neutral-950">{key()}</code>
                <Button variant="outline" size="sm" onClick={copyPublishableKey}>
                  <Show when={copiedKey()} fallback={<Copy size={12} aria-hidden="true" />}>
                    <Check size={12} aria-hidden="true" />
                  </Show>
                  <span>{copiedKey() ? t("chat.messaging_connect.copied") : t("chat.messaging_connect.copy_key")}</span>
                </Button>
              </div>
            )}
          </Show>
        </div>
      </Show>

      <Show when={errorText() && (phase() === "error" || phase() === "expired")}>
        <p class="m-0 text-xs text-error-strong" role="alert">{errorText()}</p>
      </Show>
    </div>
  );
}
