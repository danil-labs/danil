export type HandoffPresentation = ({ queueItemId: string } & ({ phase: "waiting-close"; pendingMessage: { text: string; attachments?: readonly string[] } }
  | { phase: "submitting" | "awaiting-start" })) | null;
