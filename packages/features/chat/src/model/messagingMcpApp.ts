import type { McpAppCall } from "./transcript.ts";

export type MessagingChannelType = "whatsapp" | "instagram" | "messenger" | "web";

export type MessagingConnectAsset = {
  id: string;
  name: string;
  category?: string | null;
};

export type MessagingConnectSession = {
  id: string;
  channelType: MessagingChannelType;
  status: string;
  connectUrl: string | null;
  state: string | null;
  expiresAt: string | null;
  channelId: string | null;
  channelName: string | null;
  publishableKey: string | null;
  discoveredAssets: MessagingConnectAsset[];
  errorCode: string | null;
  errorMessage: string | null;
};

export type MessagingCardTarget = {
  entity: "conversation" | "campaign";
  id: string;
  url: string;
};

const DEFAULT_MESSAGING_ORIGIN = "https://messaging.danil.ai";
export const ALLOWED_MESSAGING_ORIGINS = new Set([
  "https://messaging.danil.ai",
  "https://messaging-staging.danil.ai",
]);

function messagingUiOrigin(): string {
  const configured = (import.meta.env?.VITE_DANIL_MESSAGING_URL as string | undefined)?.trim();
  if (!configured) return DEFAULT_MESSAGING_ORIGIN;
  try {
    const parsed = new URL(configured);
    if (ALLOWED_MESSAGING_ORIGINS.has(parsed.origin)) return parsed.origin;
  } catch {
    // Fallback al origen oficial.
  }
  return DEFAULT_MESSAGING_ORIGIN;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeToolName(raw: string): string {
  const parts = raw.split("__");
  return (parts[parts.length - 1] ?? raw).trim().toLowerCase();
}

function extractPayload(result: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!result) return null;
  const structured = asRecord(result.structuredContent);
  if (structured) return structured;
  const content = result.content;
  if (Array.isArray(content)) {
    for (const item of content) {
      const rec = asRecord(item);
      if (rec?.type === "text" && typeof rec.text === "string") {
        try {
          const parsed = asRecord(JSON.parse(rec.text));
          if (parsed) return parsed;
        } catch {
          // Texto plano no JSON.
        }
      }
    }
  }
  return result;
}

function uiMetaOf(call: McpAppCall): Record<string, unknown> | null {
  const fromResult = asRecord(asRecord(call.result?._meta)?.ui);
  if (fromResult) return fromResult;
  const payload = extractPayload(call.result);
  return asRecord(asRecord(payload?._meta)?.ui);
}

/** Detecta si una llamada MCP corresponde al flujo interactivo `ui://danil-messaging/connect`. */
export function isMessagingConnectCall(call: McpAppCall | undefined): boolean {
  if (!call) return false;
  if (normalizeToolName(call.tool) === "messaging_connect_channel_start") return true;
  const ui = uiMetaOf(call);
  return ui?.resourceUri === "ui://danil-messaging/connect";
}

/** Valida que una URL de popup/iframe pertenezca a Danil Messaging o Meta OAuth. */
export function isSafeConnectUrl(raw: string | null | undefined): raw is string {
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:") return false;
    if (ALLOWED_MESSAGING_ORIGINS.has(parsed.origin)) return true;
    return (
      parsed.hostname === "www.facebook.com" ||
      parsed.hostname === "facebook.com" ||
      parsed.hostname === "www.instagram.com" ||
      parsed.hostname === "api.instagram.com"
    );
  } catch {
    return false;
  }
}

export function normalizeChannelType(raw: unknown): MessagingChannelType {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (value === "instagram" || value === "messenger" || value === "web") return value;
  return "whatsapp";
}

function parseAssets(raw: unknown): MessagingConnectAsset[] {
  if (!Array.isArray(raw)) return [];
  const out: MessagingConnectAsset[] = [];
  for (const item of raw) {
    const rec = asRecord(item);
    const id = asString(rec?.id);
    if (!id) continue;
    out.push({
      id,
      name: asString(rec?.name) ?? id,
      category: asString(rec?.category),
    });
  }
  return out;
}

/** Construye el estado inicial de la tarjeta «Conectar canal» a partir de `tools/call`. */
export function parseConnectSessionPayload(call: McpAppCall): MessagingConnectSession | null {
  if (!isMessagingConnectCall(call)) return null;
  const payload = extractPayload(call.result);
  const args = asRecord(call.arguments);
  const id = asString(payload?.id) ?? asString(payload?.session_id);
  const channelType = normalizeChannelType(payload?.channel_type ?? args?.channel_type);
  const rawConnectUrl = asString(payload?.connect_url);
  const fallbackConnectUrl = id
    ? `${messagingUiOrigin()}/?mode=connect&channel_type=${encodeURIComponent(channelType)}&session_id=${encodeURIComponent(id)}`
    : null;
  const connectUrl = isSafeConnectUrl(rawConnectUrl) ? rawConnectUrl : fallbackConnectUrl;

  if (!id && !connectUrl) return null;

  return {
    id: id ?? "",
    channelType,
    status: asString(payload?.status) ?? "pending",
    connectUrl,
    state: asString(payload?.state),
    expiresAt: asString(payload?.expires_at),
    channelId: asString(payload?.channel_id),
    channelName: asString(payload?.channel_name),
    publishableKey: asString(payload?.publishable_key),
    discoveredAssets: parseAssets(payload?.discovered_assets),
    errorCode: asString(payload?.error_code) ?? asString(payload?.code),
    errorMessage: asString(payload?.error_message) ?? asString(payload?.detail),
  };
}

/** Detecta tarjetas compactas `?mode=card&entity=conversation|campaign&id=<id>` declaradas en `_meta.ui`. */
export function parseMessagingCardTarget(call: McpAppCall | undefined): MessagingCardTarget | null {
  if (!call || isMessagingConnectCall(call)) return null;
  const ui = uiMetaOf(call);
  const entity = ui?.entity;
  if (entity !== "conversation" && entity !== "campaign") return null;
  const payload = extractPayload(call.result);
  const id =
    asString(ui?.entityId) ??
    asString(payload?.id) ??
    asString(entity === "conversation" ? payload?.conversation_id : payload?.campaign_id);
  if (!id) return null;
  return {
    entity,
    id,
    url: `${messagingUiOrigin()}/?mode=card&entity=${entity}&id=${encodeURIComponent(id)}`,
  };
}

export type ConnectCardPhase =
  | "idle"
  | "waiting"
  | "completing"
  | "selecting_asset"
  | "connected"
  | "expired"
  | "error";

export type ConnectProblemKey =
  | "chat.messaging_connect.error_expired"
  | "chat.messaging_connect.error_mismatch"
  | "chat.messaging_connect.error_type_mismatch"
  | "chat.messaging_connect.error_generic";

export function deriveInitialConnectPhase(session: MessagingConnectSession): ConnectCardPhase {
  if (session.status === "connected" || session.status === "completed") return "connected";
  if (session.status === "selecting_asset") return "selecting_asset";
  if (session.status === "expired") return "expired";
  if (session.status === "failed" || session.errorCode) return "error";
  return "idle";
}

export function classifyConnectProblem(
  status: number,
  code: string | null | undefined,
): { phase: ConnectCardPhase; key: ConnectProblemKey } {
  if (status === 410 || code === "connect_session_expired") {
    return { phase: "expired", key: "chat.messaging_connect.error_expired" };
  }
  if (status === 409 || code === "reconnect_channel_mismatch") {
    return { phase: "error", key: "chat.messaging_connect.error_mismatch" };
  }
  if (status === 422 || code === "channel_type_mismatch") {
    return { phase: "error", key: "chat.messaging_connect.error_type_mismatch" };
  }
  return { phase: "error", key: "chat.messaging_connect.error_generic" };
}

export function parseAllowedOriginsInput(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Las tarjetas interactivas de Danil Socials se muestran directamente debajo
 * de la fila de ejecución (fuera del acordeón colapsable de `TurnActivity`).
 */
export function isInteractiveMcpApp(call: McpAppCall | undefined): boolean {
  return isMessagingConnectCall(call) || parseMessagingCardTarget(call) !== null;
}
