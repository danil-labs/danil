/**
 * The account's name and photo through the control-plane client,
 * against a fake `fetch`; and that no client takes a machine out by its contract.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { webAccountProfile } from "../../src/web/account.ts";

import { platformTransport, PlatformSessionError } from "../../src/web/platform-session.ts";

// Como el teléfono: un motor con otro contrato sigue en servicio y solo falla la
// orden que no conoce. Ni la ventana ni la web lo marcan desactualizado por su hash.
test("neither the window nor the web gates a machine by its engine contract", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
  for (const file of ["src/features/machines/account.tsx", "src/web/main.tsx", "src/features/machines/ConnectMachine.tsx", "src/features/machines/AccountComputers.tsx"]) {
    const source = readFileSync(join(root, file), "utf8");
    assert.doesNotMatch(source, /machineCompatibility|machineContracts|__TERMINUS_CONTRACT__/, file);
    assert.doesNotMatch(source, /^\s*(contracts|compatible):/m, file);
  }
});

test("the account reads the WorkOS identity through the cookie edge without image or token requests", async () => {
  const calls: Request[] = [];
  const source = webAccountProfile(platformTransport({ origin: "https://edge.danil.ai", timeoutMs: 1000 }, async (url, init) => {
    const request = new Request(url, init); calls.push(request);
    return Response.json({ id: "user_A", name: "Alberto", workspace: "11", organizations: [] });
  }));
  assert.deepEqual(await source.read(), { name: "Alberto", email: null, photo: null, source: null });
  assert.equal(calls[0].url, "https://edge.danil.ai/v1/identity/me");
  assert.equal(calls[0].credentials, "include");
  assert.equal(calls[0].headers.has("authorization"), false);
  assert.equal(source.readonly, true);
  await assert.rejects(source.removePhoto());
  assert.equal(calls.length, 1, "unsupported writes never leave the client");
});

test("an expired edge session is distinct from an unavailable identity service", async () => {
  for (const status of [401, 503]) {
    const source = webAccountProfile(platformTransport({ origin: "https://edge.danil.ai", timeoutMs: 1000 }, async () => new Response(null, { status })));
    await assert.rejects(source.read(), (error: unknown) => error instanceof PlatformSessionError && error.status === status);
  }
});

test("the installer path serves a script, not the app page", () => {
  const file = join(dirname(fileURLToPath(import.meta.url)), "../../web-public/install.sh");
  assert.match(readFileSync(file, "utf8"), /^#!\/bin\/sh\n/);
});

test("the installer script says nothing was installed", { skip: process.platform === "win32" && "install.sh es POSIX y Windows no trae sh" }, () => {
  const file = join(dirname(fileURLToPath(import.meta.url)), "../../web-public/install.sh");
  const run = spawnSync("sh", [file], { encoding: "utf8" });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /no se instaló nada/);
  assert.equal(run.stdout, "");
});

test("the account reuses the authenticated startup profile without another me request", async () => {
  const source = webAccountProfile({ call: async () => { throw new Error("unexpected extra me request"); } }, () => ({ name: "Ana", email: "ana@example.test" }));
  assert.deepEqual(await source.read(), { name: "Ana", email: "ana@example.test", photo: null, source: null });
});
