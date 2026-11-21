/**
 * La sesión vive en el motor: un login hecho con `danil login` llega como `person-session`
 * y la ventana lo oye por `danil-connect`, como un login desde el botón. Lo pegado va al
 * motor por `danil_sign_in_complete`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { bridgePersonSession, completeSignIn } from "../../src/lib/person-session.ts";

test("each person-session event of the engine is re-announced as danil-connect with its state", async () => {
  const handlers: Record<string, (event: { payload: unknown }) => void> = {};
  const emitted: [string, unknown][] = [];
  await bridgePersonSession(
    async (name, handler) => { handlers[name] = handler as (event: { payload: unknown }) => void; return () => {}; },
    async (name, payload) => { emitted.push([name, payload]); },
  );
  assert.deepEqual(Object.keys(handlers), ["person-session"]);
  handlers["person-session"]({ payload: { state: "connected", email: "ana@danil.ai" } });
  handlers["person-session"]({ payload: { state: "disconnected" } });
  assert.deepEqual(emitted, [["danil-connect", { state: "connected", email: "ana@danil.ai" }], ["danil-connect", { state: "disconnected" }]]);
});

test("an emit that fails does not break the listener", async () => {
  let handler: ((event: { payload: unknown }) => void) | undefined;
  await bridgePersonSession(async (_name, h) => { handler = h as typeof handler; return () => {}; }, async () => { throw new Error("closed"); });
  assert.doesNotThrow(() => handler!({ payload: { state: "connected" } }));
});

test("the pasted address or code goes to the engine and returns the session state", async () => {
  const calls: [string, unknown][] = [];
  const state = await completeSignIn("http://127.0.0.1:5000/callback?code=abc&state=s", async (command, args) => { calls.push([command, args]); return { state: "connected" }; });
  assert.deepEqual(calls, [["danil_sign_in_complete", { pasted: "http://127.0.0.1:5000/callback?code=abc&state=s" }]]);
  assert.deepEqual(state, { state: "connected" });
});
