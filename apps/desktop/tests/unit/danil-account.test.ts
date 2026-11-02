/**
 * La cuenta de Danil contra un motor simulado: el camino real de `invoke`
 * (`__TAURI_INTERNALS__`) con las respuestas de `danil_connect_*`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

type Call = { command: string; args: Record<string, unknown> | undefined };
type Reply = (args: Record<string, unknown> | undefined) => unknown;

function engine(replies: Record<string, Reply>) {
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

test("an engine without the flow reads as unavailable, not as an error", async () => {
  engine({});
  const { readDanilAccount, readDanilOptions } = await account();
  assert.equal(await readDanilAccount(), null);
  assert.deepEqual(await readDanilOptions(), []);
});

test("a window without the single sign-in starts the engine flow with the edited name and opens the approval page", async () => {
  const calls = engine({
    danil_connect_start: () => ({
      state: "pending",
      verification_uri: "https://app.danil.ai/terminus/connect",
      verification_uri_complete: "https://app.danil.ai/terminus/connect?code=WDJB-MJHT",
      user_code: "WDJB-MJHT",
      expires_at: 1792412100000,
    }),
    open_external: () => null,
  });
  const { signInWithBrowser } = await account();
  const started = await signInWithBrowser("  Mac de Alberto ");
  assert.equal(started.state, "pending");
  assert.equal(started.user_code, "WDJB-MJHT");
  const later = calls.filter((c) => c.command !== "danil_sign_in");
  assert.deepEqual(later[0], { command: "danil_connect_start", args: { name: "Mac de Alberto" } });
  assert.deepEqual(later[1], { command: "open_external", args: { target: "https://app.danil.ai/terminus/connect?code=WDJB-MJHT" } });
});

test("an empty name lets the engine use the hostname", async () => {
  const calls = engine({ danil_connect_start: () => ({ state: "pending", verification_uri: "https://app.danil.ai/terminus/connect" }), open_external: () => null });
  const { signInWithBrowser } = await account();
  await signInWithBrowser("   ");
  const later = calls.filter((c) => c.command !== "danil_sign_in");
  assert.deepEqual(later[0].args, {});
  assert.equal(later[1].args?.target, "https://app.danil.ai/terminus/connect");
});

test("continuing as a workspace email connects without the browser", async () => {
  const calls = engine({
    danil_connect_options: () => [
      { workspace: "w1", name: "Danil", email: "alberto@danil.ai" },
      { workspace: "w2", name: "Otro", email: "Alberto@Danil.ai" },
      { workspace: "w3", name: "Cliente", email: "otra@danil.ai" },
      { workspace: "w4", name: "Sin correo", email: "" },
    ],
    danil_connect_start: (args) => ({ state: "connected", computer_id: "cmp_1", name: args?.name, email: "alberto@danil.ai" }),
  });
  const { readDanilOptions, signInWithWorkspace } = await account();
  const options = await readDanilOptions();
  assert.deepEqual(options.map((o) => o.workspace), ["w1", "w3"], "one button per distinct email");
  const status = await signInWithWorkspace("Mac", "w1");
  assert.deepEqual(calls.find((c) => c.command === "danil_connect_start")?.args, { name: "Mac", workspace: "w1" });
  assert.ok(!calls.some((c) => c.command === "open_external"), "no browser");
  assert.equal(status?.state, "connected");
  assert.equal(status?.email, "alberto@danil.ai");
});

test("an email without a Danil account is told apart from other failures", async () => {
  engine({
    danil_connect_start: () => {
      throw { what: { clave: "danil.error.no_danil_account" }, detail: "no_danil_account" };
    },
  });
  const { signInWithWorkspace, failureCode } = await account();
  const refused = await signInWithWorkspace("Mac", "w1").catch((e: unknown) => e);
  assert.equal(failureCode(refused), "no_danil_account");
  assert.equal(failureCode({ what: { clave: "danil.error.no_danil_account" } }), "no_danil_account");
  assert.equal(failureCode(new Error("x")), null);
});

test("signing out returns the engine's state", async () => {
  const calls = engine({
    danil_disconnect: () => ({ state: "disconnected", name: "alberto-mbp", error: "revoke_unconfirmed", online: false }),
  });
  const { signOut } = await account();
  const status = await signOut();
  assert.equal(status.state, "disconnected");
  assert.equal(status.error, "revoke_unconfirmed", "the engine says when Danil did not confirm");
  assert.deepEqual(calls.map((c) => c.command), ["danil_sign_out", "danil_disconnect"], "a window without the single sign-out falls back");
});

test("signing out closes the window session and the engine account in one command", async () => {
  const calls = engine({ danil_sign_out: () => ({ state: "disconnected", online: false }) });
  const { signOut } = await account();
  assert.equal((await signOut()).state, "disconnected");
  assert.deepEqual(calls.map((c) => c.command), ["danil_sign_out"]);
});

test("the single sign-in answers with the engine's state when it finishes at once", async () => {
  const calls = engine({ danil_sign_in: (args) => ({ state: "connected", name: args?.name, email: "alberto@danil.ai" }) });
  const { signInWithBrowser } = await account();
  const status = await signInWithBrowser(" Mac ");
  assert.equal(status.state, "connected");
  assert.deepEqual(calls.map((c) => c.command), ["danil_sign_in"]);
  assert.deepEqual(calls[0].args, { name: "Mac" });
});

test("while the single sign-in waits for the browser, the pending state is read and nothing else opens", async () => {
  const calls = engine({
    danil_sign_in: () => new Promise(() => {}),
    danil_connect_status: () => ({ state: "pending", user_code: "WDJB-MJHT" }),
  });
  const { signInWithBrowser } = await account();
  const status = await signInWithBrowser("");
  assert.equal(status.state, "pending");
  assert.ok(!calls.some((c) => c.command === "open_external" || c.command === "danil_connect_start"), "the window opened its own page");
});
