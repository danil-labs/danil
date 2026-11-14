/**
 * La cuenta de Danil de Desk: login por el navegador contra `identity`
 * (`danil_sign_in`, `danil_session_status`, `danil_sign_out` en Rust). Una sola
 * cuenta: no hay correos para elegir ni flujo del motor. El camino real de
 * `invoke` (`__TAURI_INTERNALS__`) con respuestas simuladas.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

type Call = { command: string; args: Record<string, unknown> | undefined };
type Reply = (args: Record<string, unknown> | undefined) => unknown;

function window(replies: Record<string, Reply>) {
  const calls: Call[] = [];
  (globalThis as { window?: unknown }).window = {
    __TAURI_INTERNALS__: {
      invoke: async (command: string, args?: Record<string, unknown>) => {
        calls.push({ command, args });
        const reply = replies[command];
        if (!reply) throw { what: { clave: "shell.service.command" }, detail: "command" };
        return reply(args);
      },
    },
  };
  return calls;
}

const account = () => import("../../src/features/settings/danil-account.ts");
const LEGACY = ["danil_connect_start", "danil_connect_status", "danil_connect_options", "danil_disconnect", "open_external"];

test("the account is read from the Desk session, not from the engine", async () => {
  const calls = window({ danil_session_status: () => ({ state: "connected", account: "user_1", email: "ana@danil.ai", online: true }) });
  const { readDanilAccount } = await account();
  const status = await readDanilAccount();
  assert.equal(status?.state, "connected");
  assert.equal(status?.email, "ana@danil.ai");
  assert.deepEqual(calls.map((c) => c.command), ["danil_session_status"]);
});

test("a window without the Desk session reads as unavailable", async () => {
  window({});
  const { readDanilAccount } = await account();
  assert.equal(await readDanilAccount(), null);
});

test("there are no emails to choose: switching user does not exist", async () => {
  const calls = window({ danil_connect_options: () => [{ workspace: "w1", email: "a@danil.ai" }] });
  const { readDanilOptions, ONE_CLICK_SIGN_IN } = await account();
  assert.deepEqual(await readDanilOptions(), []);
  assert.equal(ONE_CLICK_SIGN_IN, false);
  assert.equal(calls.length, 0);
});

test("signing in opens the system browser from Rust and never falls back to the engine flow", async () => {
  const calls = window({ danil_sign_in: () => ({ state: "connected", account: "user_1", email: "ana@danil.ai" }) });
  const { signInWithBrowser } = await account();
  const status = await signInWithBrowser(" Mac ");
  assert.equal(status.state, "connected");
  assert.deepEqual(calls.map((c) => c.command), ["danil_sign_in"]);
});

test("while the browser is open, the current state is read and nothing else opens", async () => {
  const calls = window({ danil_sign_in: () => new Promise(() => {}), danil_session_status: () => ({ state: "disconnected" }) });
  const { signInWithBrowser } = await account();
  const status = await signInWithBrowser("");
  assert.equal(status.state, "disconnected");
  assert.ok(!calls.some((c) => LEGACY.includes(c.command)), calls.map((c) => c.command).join());
});

test("a failed sign-in keeps its code and does not start the engine flow", async () => {
  const calls = window({
    danil_sign_in: () => Promise.reject({ what: { clave: "danil.error.not_available_yet" }, detail: "not_available_yet" }),
    danil_session_status: () => ({ state: "disconnected" }),
  });
  const { signInWithBrowser, failureCode } = await account();
  const refused = await signInWithBrowser("").catch((e: unknown) => e);
  assert.equal(failureCode(refused), "not_available_yet");
  assert.ok(!calls.some((c) => LEGACY.includes(c.command)));
});

test("signing out closes the Desk session in one command", async () => {
  const calls = window({ danil_sign_out: () => ({ state: "disconnected" }) });
  const { signOut } = await account();
  assert.equal((await signOut()).state, "disconnected");
  assert.deepEqual(calls.map((c) => c.command), ["danil_sign_out"]);
});

test("signing out forgets the saved machine names", async () => {
  const saved = new Map<string, string>([["harness.layout.machines.known_names", JSON.stringify({ cmp_cloud: "Nube" })]]);
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => saved.get(k) ?? null,
    setItem: (k: string, v: string) => void saved.set(k, v),
    removeItem: (k: string) => void saved.delete(k),
  };
  window({ danil_sign_out: () => ({ state: "disconnected" }) });
  const { signOut } = await account();
  await signOut();
  assert.equal(saved.has("harness.layout.machines.known_names"), false);
  delete (globalThis as { localStorage?: unknown }).localStorage;
});
