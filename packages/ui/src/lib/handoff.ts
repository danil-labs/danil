export type HandoffPresentation = ({ queueItemId: string } & ({ phase: "waiting-close"; pendingMessage: { text: string; attachments?: readonly string[] } }
  | { phase: "submitting" | "awaiting-start" })) | null;

export type ConversationScope = { workspace: string | null; generation: number; project: string; session: string; route?: { headers: Record<string, string> } };
export type HandoffView = { stopping: boolean; pending: { queueItemId: string; phase: "waiting-close" | "submitting" | "awaiting-start" } | null; error: unknown | null; released: boolean };

export type HandoffFact = { scope: ConversationScope } & ({ kind: "terminal" | "started" | "accepted" } | { kind: "dispatching"; itemIds: readonly string[] } | { kind: "rejected"; error: unknown } | { kind: "queue-removed"; queueItemId: string });
export type ConversationHandoffDeps = {
  current: () => { workspace: string | null; generation: number };
  runtime: { active: (scope: ConversationScope) => boolean; stop: (scope: ConversationScope) => Promise<unknown> };
  queue: { message: (scope: ConversationScope, id: string) => { text: string; attachments?: readonly string[] } | undefined; select: (scope: ConversationScope, id: string) => boolean; release: (scope: ConversationScope, id: string) => void; failed: (scope: ConversationScope, id: string, error: unknown) => void };
};
