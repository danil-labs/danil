import type { EmptyReply, RemovedContext } from "./session-empty.ts";

type SessionContext = { context_id: string; org: string; org_name: string | null; plan: string | null; role?: string | null; workspaces?: "all" | "later" };
export type SessionFamily = { family: string; sub?: string; email: string | null; contexts: SessionContext[]; available_contexts?: number };
export type ContextGroup = SessionContext & { family: string; email: string | null; available_contexts?: number };
export type SessionStatus = { state: string; sessions?: SessionFamily[]; default_context?: string | null; empty_reason?: string | null; removed?: RemovedContext[] };
export type ContextReply = EmptyReply;
export type ContextInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

