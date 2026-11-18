import assert from "node:assert/strict";
import { EventRecovery } from "../../../../packages/computers/src/event-recovery.ts";
import test from "node:test";
import { createEffect, createRoot } from "solid-js";
import { createBatchDelivery } from "../../src/features/service-stream/index.ts";
import { createThreadsStore } from "../../src/features/threads/index.ts";
import { createRouter } from "../../src/features/machines/router.ts";
import { Fleet } from "@terminus/fleet";
import type { ChatEvent, Session } from "../../src/features/chat/index.ts";
import type { PushedBatch } from "../../src/features/service-stream/index.ts";

test("a delayed history read and replay use durable IDs while equal new output remains legitimate", async () => {
  await createRoot(async dispose => {
    const saved = { id: "saved-one", role: "agent", text: "same answer" }, old = { turns: [saved], provider: "codex" } as Session;
    let finish!: (session: Session) => void;
    const threads = createThreadsStore({ scope: { workspace: () => "w", generation: () => 1, paged: () => false }, activeSession: () => "s", project: () => "p",
      invoke: async <T>() => new Promise<Session>(resolve => { finish = resolve; }) as Promise<T>, route: () => undefined, liveThreads: () => new Set() });
    const router = createRouter({ self: null, fleet: new Fleet({ self: null, connect: () => { throw new Error("not used"); } }), native: null });
    let lifecycle = 0;
    const deliver = createBatchDelivery({ resync: () => {}, replay: threads.replay, deliver: events => {
      for (const event of events) {
        const fact = event.payload as ChatEvent;
        if (fact.kind === "started" || fact.kind === "done") lifecycle++;
        threads.event(fact, { author: null });
      }
    } });
    const event = (kind: ChatEvent["kind"], text: string, fields: Partial<ChatEvent> = {}) => ({ name: "chat", payload: { workspace: "w", session: "s", kind, text, meta: null, ...fields } });
    const poll = async () => deliver((await router.handle("service_poll") as { batches: PushedBatch[] }).batches);
    try {
      threads.acceptSession("s", old, true, 1);
      const slow = threads.read("p", "s");
      router.events("m", [...Array.from({ length: 20 }, () => [event("started", ""), event("done", "", { ok: true })]).flat(),
        event("delta", saved.text, { starts_message: true, message_id: "native-one" }), event("segment_saved", "", { id: saved.id })], { replay: true, replayId: "subscription-one", cursor: 40 });
      await poll();
      assert.equal(lifecycle, 0, "historical lifecycle cannot fan out into fresh task/status reads");
      assert.equal(threads.messages().filter(row => row.text === saved.text).length, 1);
      finish(old); threads.acceptSession("s", await slow, false, 1);
      threads.beginActivity("s", 1000);
      router.events("m", [event("delta", saved.text, { starts_message: true, message_id: "native-two" })], { replay: false, cursor: 41 });
      await poll(); threads.flush();
      assert.equal(threads.messages().filter(row => row.text === saved.text).length, 2, "two distinct native executions can legitimately say the same thing");
    } finally { router.close(); threads.dispose(); dispose(); }
  });
});


test("a committed replay never exposes the transient live/durable duplicate to reactive observers", () => {
  const counts: number[] = [];
  const f = createRoot(dispose => {
    const saved = { id: "saved", role: "agent", text: "single saved answer" };
    const threads = createThreadsStore({ scope: { workspace: () => "w", generation: () => 1, paged: () => false }, activeSession: () => "s", project: () => "p",
      invoke: async <T>() => ({ turns: [saved], provider: "codex" }) as T, route: () => undefined, liveThreads: () => new Set() });
    threads.acceptSession("s", { turns: [saved], provider: "codex" } as Session, true, 1);
    createEffect(() => counts.push(threads.messages().filter(row => row.text === saved.text).length));
    const delivery = createBatchDelivery({ resync: () => {}, replay: threads.replay, deliver: events => {
      for (const event of events) threads.event(event.payload as ChatEvent, { author: null });
    } });
    return { threads, delivery, dispose };
  });
  try {
    const fact = (kind: ChatEvent["kind"], text: string, extra = {}) => ({ name: "chat", payload: { kind, text, workspace: "w", session: "s", meta: null, ...extra } });
    const recovery = new EventRecovery();
    const receive = (cursor: number, complete: boolean, events: { name: string; payload: unknown; seq: number }[]) => {
      const recovered = recovery.receive({ cursor, runtime: "runtime", replay: true, recovery: { id: "finite-catchup", through: 9, complete }, events });
      if (recovered.handled && recovered.page) f.delivery([{ ...recovered.page, replayId: "finite-catchup" }]);
      f.threads.flush();
    };
    receive(3, false, [{ ...fact("delta", "single saved answer", { starts_message: true, message_id: "native" }), seq: 3 }]);
    receive(6, false, []);
    receive(9, true, [{ ...fact("segment_saved", "", { id: "saved" }), seq: 9 }]);
    assert.ok(counts.length > 0);
    assert.ok(counts.every(count => count <= 1), `transient duplicate reached an observer: ${counts}`);
    assert.equal(f.threads.messages().filter(row => row.text === "single saved answer").length, 1);
  } finally { f.threads.dispose(); f.dispose(); }
});
