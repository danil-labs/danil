import { PlatformSessionError } from "./platform-session.ts";

/** One unresolved intent at a time; a receipt acknowledges an operation, not current state. */
export function workspaceSelection(api: { active(): Promise<string>; select(id: string, key: string): Promise<unknown> }, key: () => string = () => crypto.randomUUID()) {
  let pending: { id: string; key: string; phase: "unknown" | "confirmed" } | null = null;
  let active: string | null = null;
  let running = false;
  async function settle() {
    if (pending?.phase === "unknown") {
      try {
        await api.select(pending.id, pending.key);
        pending.phase = "confirmed";
      } catch (error) {
        if (error instanceof PlatformSessionError && error.status >= 400 && error.status < 500 && ![408, 429].includes(error.status)) {
          active = await api.active();
          pending = null;
        }
        throw error;
      }
    }
    const actual = await api.active();
    active = actual;
    pending = null;
  }
  async function exclusive(action: () => Promise<void>) {
    if (running) throw new Error("workspace_selection_in_progress");
    running = true;
    try { await action(); } finally { running = false; }
  }
  return {
    active: () => active,
    uncertain: () => pending !== null,
    reconcile: () => exclusive(settle),
    choose: (id: string) => exclusive(async () => {
      const retry = pending?.id === id;
      if (pending) await settle();
      if (retry) return;
      pending = { id, key: key(), phase: "unknown" };
      active = null;
      await settle();
    }),
  };
}
