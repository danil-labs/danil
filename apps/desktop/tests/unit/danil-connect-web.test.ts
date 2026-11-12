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

const API = "https://computers.danil.ai";

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

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7]);

function account(handler: (url: string, init: RequestInit) => Response) {
  const seen: { url: string; init: RequestInit }[] = [];
  const f = async (url: string, init: RequestInit = {}) => {
    seen.push({ url, init });
    return handler(url, init);
  };
  let unauthorized = 0;
  return { source: webAccountProfile(API, async () => "tok", () => unauthorized++, f), seen, unauthorized: () => unauthorized };
}

test("the account reads name, email and photo from the control plane with the session", async () => {
  const { source, seen } = account((url) =>
    url.startsWith(`${API}/v1/me/avatar`)
      ? new Response(PNG, { headers: { "content-type": "image/png" } })
      : Response.json({ name: "Alberto Ceballos", email: "alberto@danil.ai", avatar_url: `${API}/v1/me/avatar?v=abc`, avatar_source: "danil" }),
  );
  const profile = await source.read();
  assert.deepEqual(profile, {
    name: "Alberto Ceballos",
    email: "alberto@danil.ai",
    photo: `data:image/png;base64,${Buffer.from(PNG).toString("base64")}`,
    source: "danil",
  });
  assert.deepEqual(seen.map((s) => s.url), [`${API}/v1/me`, `${API}/v1/me/avatar?v=abc`]);
  assert.ok(seen.every((s) => new Headers(s.init.headers).get("authorization") === "Bearer tok"));
});

test("a photo on another origin, or not an image, is never fetched or shown", async () => {
  const foreign = account(() => Response.json({ name: "A", email: "a@danil.ai", avatar_url: "https://evil.test/me.png", avatar_source: "provider" }));
  assert.deepEqual(await foreign.source.read(), { name: "A", email: "a@danil.ai", photo: null, source: null });
  assert.equal(foreign.seen.length, 1, "the session goes nowhere else");

  const svg = account((url) =>
    url.includes("/avatar")
      ? new Response("<svg/>", { headers: { "content-type": "image/svg+xml" } })
      : Response.json({ avatar_url: `${API}/v1/me/avatar?v=1`, avatar_source: "danil" }),
  );
  assert.equal((await svg.source.read())?.photo, null);
});

test("changing and removing the photo go to the account with the image as the body", async () => {
  let removed = false;
  const { source, seen } = account((url, init) => {
    if (init.method === "PUT") return Response.json({ name: "A", email: "a@danil.ai", avatar_url: null, avatar_source: null });
    if (init.method === "DELETE") {
      removed = true;
      return Response.json({ name: "A", email: "a@danil.ai", avatar_url: null, avatar_source: null });
    }
    return new Response("", { status: 404 });
  });
  const blob = new Blob([PNG], { type: "image/png" });
  await source.setPhoto({ dataUrl: "", blob, type: "image/png" });
  const put = seen.find((s) => s.init.method === "PUT");
  assert.equal(put?.url, `${API}/v1/me/avatar`);
  assert.equal(new Headers(put?.init.headers).get("content-type"), "image/png");
  assert.equal(put?.init.body, blob);
  await source.removePhoto();
  assert.ok(removed);
});

test("a refused photo carries the control plane's code, and 401 asks to sign in again", async () => {
  const big = account(() => Response.json({ error: { code: "image_too_large" } }, { status: 413 }));
  await assert.rejects(big.source.setPhoto({ dataUrl: "", blob: new Blob([PNG]), type: "image/png" }), { detail: "image_too_large" });
  const gone = account(() => Response.json({ error: { code: "invalid_token" } }, { status: 401 }));
  await assert.rejects(gone.source.read(), { detail: "invalid_token" });
  assert.equal(gone.unauthorized(), 1);
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
