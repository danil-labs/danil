import type { EventsPage } from "./relay.ts";

export type RecoveryBoundary = { id: string; through: number; complete: boolean };
type RecoveryPage = EventsPage & { recovery: RecoveryBoundary };
const sequence = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
/** Commit a finite replay as one delivery; partial pages must never paint over a durable snapshot. */
export class EventRecovery {
  private staged: { id: string; runtime: string; through: number; cursor: number; bytes: number; events: NonNullable<EventsPage["events"]>; seen: Set<number>; gap: boolean } | null = null;
  private terminalId: string | null = null;
  private readonly maxBytes: number;
  constructor(maxBytes = 2 * 1024 * 1024) { this.maxBytes = maxBytes; }
  reset(): void { this.staged = null; this.terminalId = null; }
  receive(page: EventsPage): { handled: false } | { handled: true; page?: EventsPage } {
    if (!page.recovery) return { handled: false };
    if (typeof page.recovery !== "object" || Array.isArray(page.recovery)) return this.fail(page);
    const boundary = page.recovery;
    if (boundary.id === this.terminalId) return { handled: true };
    if ("failed" in boundary || !sequence(boundary.through) || typeof boundary.id !== "string" || !boundary.id || typeof boundary.complete !== "boolean"
      || !sequence(page.cursor) || typeof page.runtime !== "string" || !page.runtime || boundary.complete !== (page.cursor >= boundary.through) || page.cursor > boundary.through) {
      return this.fail(page);
    }
    const valid = page as RecoveryPage;
    if (!this.staged || this.staged.id !== boundary.id || this.staged.runtime !== page.runtime || page.gap === true) this.staged = {
      id: boundary.id, runtime: page.runtime, through: boundary.through, cursor: -1, bytes: 0, events: [], seen: new Set(), gap: false,
    };
    const stage = this.staged;
    if (stage.through !== boundary.through) return this.fail(page);
    if (page.cursor < stage.cursor) return { handled: true };
    const bytes = JSON.stringify(page).length * 2;
    if (stage.bytes + bytes > this.maxBytes) return this.fail(page);
    for (const event of page.events ?? []) {
      if (!sequence(event.seq) || event.seq > page.cursor) return this.fail(page);
      if (!stage.seen.has(event.seq)) { stage.seen.add(event.seq); stage.events.push(event); }
    }
    stage.bytes += bytes; stage.cursor = page.cursor; stage.gap ||= page.gap === true;
    if (!boundary.complete) return { handled: true };
    const committed: EventsPage = { ...valid, gap: stage.gap, replay: true, events: stage.events };
    this.staged = null; this.terminalId = boundary.id;
    return { handled: true, page: committed };
  }
  private fail(page: EventsPage): { handled: true; page: EventsPage } {
    this.reset();
    const id = typeof page.recovery === "object" && page.recovery && typeof page.recovery.id === "string" ? page.recovery.id : "invalid";
    this.terminalId = id;
    return { handled: true, page: { ...page, cursor: null, events: [], gap: true, recovery: { id, failed: true } } };
  }
}
