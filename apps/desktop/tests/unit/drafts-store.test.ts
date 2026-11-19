import assert from "node:assert/strict";
import test from "node:test";
import { createEffect, createRoot, createSignal } from "solid-js";
import { createDraftsStore } from "../../src/features/drafts/index.ts";

function fixture(prepareAttachments: (paths: string[], project: string) => Promise<string[]> = async paths => paths) {
  return createRoot(dispose => {
    const [key, setKey] = createSignal("draft:p1");
    let workspace = "A", generation = 1;
    const store = createDraftsStore({ key, workspace: () => workspace, generation: () => generation, project: () => "p1",
      projects: () => [{ id: "p1", sources: ["root"] }] as never, sources: () => [{ id: "root" }, { id: "extra" }] as never, prepareAttachments });
    return { store, setKey, dispose, switchWorkspace: (id: string) => { workspace = id; generation++; store.reset(); } };
  });
}
test("drafts survive view changes and promote to a real session", () => {
  const f = fixture(); f.store.changeText("first"); f.store.replaceFiles(["a"]);
  f.setKey("other"); assert.equal(f.store.input(), ""); f.store.changeText("second");
  f.setKey("draft:p1"); assert.equal(f.store.input(), "first"); f.store.promote("draft:p1", "session");
  f.setKey("session"); assert.equal(f.store.input(), "first"); assert.deepEqual(f.store.files(), ["a"]);
  assert.equal(f.store.peek("draft:p1"), undefined); f.store.drop("session"); assert.equal(f.store.input(), ""); f.dispose();
});
test("recipient insertion, typing, undo and redo preserve reference ranges", () => {
  const f = fixture(); f.store.changeText("@"); f.store.recipient("architect", "@architect", { kind: "@", from: 0, to: 1, query: "" });
  const before = f.store.current(); assert.equal(before.recipients?.length, 1);
  f.store.changeText(before.input + " hello"); assert.equal(f.store.history(false), true);
  assert.equal(f.store.input(), before.input); assert.equal(f.store.current().recipients?.length, 1);
  assert.equal(f.store.history(true), true); assert.equal(f.store.input(), before.input + " hello"); f.dispose();
});
test("source membership differentiates inherited, pending and already sent material", () => {
  const f = fixture(); f.store.addSource("root"); assert.deepEqual(f.store.sourceIds(), []);
  f.store.addSource("extra"); f.store.addSource("extra"); assert.deepEqual(f.store.sourceIds(), ["extra"]);
  f.store.removeSource("root"); assert.deepEqual(f.store.excludedSourceIds(), ["root"]);
  f.store.addSource("root"); assert.deepEqual(f.store.excludedSourceIds(), []);
  f.store.sentSources("draft:p1", ["extra"]); f.store.acceptSources(["extra"]); f.store.addSource("extra");
  assert.deepEqual(f.store.sourceIds(), []); assert.deepEqual(f.store.context().map(source => source.id), ["root", "extra"]); f.dispose();
});
test("failed send restores files but does not overwrite newer text", () => {
  const f = fixture(); f.store.changeText("old"); f.store.replaceFiles(["a", "b"]); f.store.takeFiles("draft:p1", ["a"]);
  f.store.changeText("new"); f.store.restoreFailed("draft:p1", { text: "old" }, ["a"]);
  assert.equal(f.store.input(), "new"); assert.deepEqual(f.store.files(), ["a", "b"]);
  f.store.changeText(""); f.store.restoreFailed("draft:p1", { text: "old" }, ["a"]); assert.equal(f.store.input(), "old"); f.dispose();
});
test("configuration preserves manually chosen mode across model changes", () => {
  const f = fixture(); const config = { agent: "codex", surface: "codex", model: "model", effort: "high", mode: "ask" };
  f.store.configure(config); f.store.configure({ ...config, model: "new", mode: undefined });
  assert.equal(f.store.current().configuration?.mode, "ask"); f.dispose();
});
test("prepare captures draft and rejects late A to B to A results", async () => {
  let resolve!: (value: string[]) => void;
  const f = fixture(() => new Promise(done => { resolve = done; }));
  const request = f.store.addFiles(["source"]); f.switchWorkspace("B"); f.switchWorkspace("A"); resolve(["prepared"]); await request;
  assert.deepEqual(f.store.files(), []); f.dispose();
});
test("prepare across tab switch attaches to original draft and deduplicates", async () => {
  let resolve!: (value: string[]) => void;
  const f = fixture(() => new Promise(done => { resolve = done; }));
  const request = f.store.addFiles(["source"]); f.setKey("other"); resolve(["a", "a"]); await request;
  assert.deepEqual(f.store.files(), []); assert.deepEqual(f.store.peek("draft:p1")?.archivos, ["a"]); f.dispose();
});
test("prepare failure preserves draft and propagates the error", async () => {
  const error = new Error("offline"); const f = fixture(async () => { throw error; }); f.store.changeText("keep");
  await assert.rejects(f.store.addFiles(["a"]), failure => failure === error); assert.equal(f.store.input(), "keep"); f.dispose();
});
test("disposing excludes pending attachment result", async () => {
  let resolve!: (value: string[]) => void;
  const f = fixture(() => new Promise(done => { resolve = done; }));
  const request = f.store.addFiles(["source"]); f.store.dispose(); resolve(["late"]); await request;
  assert.deepEqual(f.store.files(), []); f.dispose();
});

test("equal source memberships do not notify readers while text changes", async () => {
  const f = fixture(); let reads = 0;
  const dispose = createRoot(stop => { createEffect(() => { f.store.sourceIds(); reads++; }); return stop; });
  await Promise.resolve(); const before = reads;
  f.store.changeText("one"); f.store.changeText("two");
  assert.equal(reads, before); f.store.addSource("extra"); assert.equal(reads, before + 1);
  dispose(); f.dispose();
});

test("disposed draft store never begins attachment preparation", async () => {
  let reads = 0; const f = fixture(async paths => { reads++; return paths; });
  f.store.dispose(); await f.store.addFiles(["source"]); assert.equal(reads, 0); f.dispose();
});

test("a context transition resets drafts and rejects attachments even when the workspace id is unchanged", async () => {
  let resolve!: (value: string[]) => void;
  const f = fixture(() => new Promise(done => { resolve = done; }));
  f.store.changeText("Private draft");
  const pending = f.store.addFiles(["private-source"]);
  f.switchWorkspace("A");
  resolve(["private-attachment"]);
  await pending;
  assert.equal(f.store.input(), "");
  assert.deepEqual(f.store.files(), []);
  f.dispose();
});
