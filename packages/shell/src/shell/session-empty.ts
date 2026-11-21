export type EmptyReason = "no_organization" | "organization_access_denied" | "no_workspace_access" | "organization_selection_required" | "session_expired" | "unknown";
export type RemovedContext = { context_id: string; org: string; reason: string };
export type EmptyReply = { status: number; body?: unknown; empty_reason?: unknown; headers?: { get(name: string): string | null } };
const REASONS = new Set<EmptyReason>(["no_organization", "organization_access_denied", "no_workspace_access", "organization_selection_required", "session_expired", "unknown"]);

export function normalizeEmptyReason(value: unknown): EmptyReason | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return REASONS.has(value as EmptyReason) ? value as EmptyReason : "unknown";
}

export function emptyReasonKey(reason: EmptyReason): string {
  return reason === "session_expired" ? "shell.workspaces.session_expired" : reason === "organization_selection_required" ? "shell.workspaces.organization_required" : reason === "no_organization" ? "shell.workspaces.empty_no_org" : reason === "organization_access_denied" || reason === "no_workspace_access" ? "shell.workspaces.empty_no_access" : "shell.workspaces.empty_generic";
}

export function replyEmptyReason(reply: EmptyReply): EmptyReason | null {
  const body = reply.body as { empty_reason?: unknown; code?: unknown } | null;
  return normalizeEmptyReason(reply.empty_reason ?? reply.headers?.get("X-Danil-Empty-Reason") ?? body?.empty_reason ?? (reply.status === 403 && (body?.code === "organization_access_denied" || body?.code === "organization_selection_required") ? body.code : null));
}

export function refusalEmptyReason(value: unknown): EmptyReason | null {
  const refusal = value as { empty_reason?: unknown; detail?: unknown } | null;
  if (refusal?.empty_reason) return normalizeEmptyReason(refusal.empty_reason);
  return typeof refusal?.detail === "string" && REASONS.has(refusal.detail as EmptyReason) ? normalizeEmptyReason(refusal.detail) : null;
}

export function createSessionEmptyState() {
  let global: EmptyReason | null = null;
  const contexts = new Map<string, EmptyReason>();
  const removed = new Map<string, RemovedContext>();
  const dismissed = new Set<string>();
  const remove = (context: string, org: string, reason: string) => {
    const next = { context_id: context, org, reason: normalizeEmptyReason(reason) ?? "unknown" };
    const changed = removed.get(context)?.reason !== next.reason;
    if (changed) removed.set(context, next);
    contexts.delete(context);
    return changed;
  };
  return {
    update(status: { empty_reason?: unknown; removed?: RemovedContext[] }) {
      global = normalizeEmptyReason(status.empty_reason);
      for (const item of status.removed ?? []) remove(item.context_id, item.org, item.reason);
    },
    note(context: string, reply: EmptyReply) {
      const reason = replyEmptyReason(reply);
      const previous = contexts.get(context) ?? null;
      if (reason) contexts.set(context, reason);
      else if (reply.status >= 200 && reply.status < 300) contexts.delete(context);
      return previous !== (contexts.get(context) ?? null);
    },
    reason: (context?: string) => context ? contexts.get(context) ?? null : global,
    removed: () => [...removed.values()].filter((r) => !dismissed.has(r.context_id)),
    dismiss: (context: string) => dismissed.add(context),
    excludes: (context: string) => removed.has(context),
  };
}
