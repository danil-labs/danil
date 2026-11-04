import assert from "node:assert/strict";
import test from "node:test";
import type { DirectoryEntry } from "../../../../packages/computers/src/directory.ts";
import {
  ACCOUNT_WELCOME_KEY,
  accountWelcomeAnswered,
  adoptDanilWorkspace,
  offerAccountWelcome,
  pickWelcomeWorkspace,
  rememberAccountWelcome,
} from "../../src/features/onboarding/account-welcome.ts";
import { DESKTOP_DOWNLOADS, downloadsFor, platformOf } from "../../src/lib/downloads.ts";

const entry = (key: string, danil: number | null, workspace: string | null = null, extra: Partial<DirectoryEntry> = {}): DirectoryEntry => ({
  key,
  workspace_id: workspace,
  danil_workspace_id: danil,
  name: key,
  kind: "organization",
  organization: { id: 1, name: "Norte" },
  role: "owner",
  owner: true,
  support: null,
  capabilities: { agents: true, terminus: true },
  pin: null,
  ...extra,
});

function memory() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
}

test("the choice is remembered once per computer", () => {
  const store = memory();
  assert.equal(accountWelcomeAnswered(store), false);
  rememberAccountWelcome("local", store);
  assert.equal(store.data.get(ACCOUNT_WELCOME_KEY), "local");
  assert.equal(accountWelcomeAnswered(store), true);
  store.setItem(ACCOUNT_WELCOME_KEY, "otra cosa");
  assert.equal(accountWelcomeAnswered(store), false, "an unknown value asks again");
});

test("the screen is offered only on a first run without an answer", () => {
  assert.equal(offerAccountWelcome(true, false), true);
  assert.equal(offerAccountWelcome(true, true), false);
  assert.equal(offerAccountWelcome(false, false), false);
});

test("one free workspace is taken directly; several are chosen; none continues", () => {
  assert.deepEqual(pickWelcomeWorkspace([]), { kind: "none" });
  assert.equal(pickWelcomeWorkspace([entry("a:1", 1)]).kind, "one");
  const withTaken = pickWelcomeWorkspace([entry("a:1", 1), entry("a:2", 2, "otra")]);
  assert.equal(withTaken.kind, "one", "a taken one does not force a choice");
  assert.equal(withTaken.kind === "one" && withTaken.entry.key, "a:1");
  const many = pickWelcomeWorkspace([entry("a:1", 1), entry("a:2", 2), entry("a:3", 3, "otra")]);
  assert.equal(many.kind, "many");
  assert.equal(many.kind === "many" && many.entries.length, 3, "the taken one is shown too");
  assert.equal(pickWelcomeWorkspace([entry("a:3", 3, "otra")]).kind, "taken");
});

test("support access and registry-only rows are not offered", () => {
  const support = entry("a:9", 9, null, { support: { level: "read", expires_at: "2026-12-01" } });
  assert.deepEqual(pickWelcomeWorkspace([support, entry("w:solo", null, "solo")]), { kind: "none" });
});

test("adopting creates the local workspace with the Danil name, links it and sets the account", async () => {
  const calls: string[] = [];
  const result = await adoptDanilWorkspace(entry("Norte MX", 476), "u_1", "Personal", {
    createWorkspace: async (name) => (calls.push(`create:${name}`), { id: "loc" }),
    link: async (id, danil, account) => void calls.push(`link:${id}:${danil}:${account}`),
    setAccount: async (id, account) => (calls.push(`account:${id}:${account}`), {}),
  });
  assert.deepEqual(result, { id: "loc", nombre: "Norte MX" });
  assert.deepEqual(calls, ["create:Norte MX", "link:loc:476:u_1", "account:loc:u_1"]);
});

test("a failed link keeps the local workspace in the error so a retry reuses it", async () => {
  await assert.rejects(
    adoptDanilWorkspace(entry("", 5), "u_1", "Personal", {
      createWorkspace: async () => ({ id: "loc" }),
      link: async () => {
        throw Object.assign(new Error("danil_workspace_taken"), { detail: "danil_workspace_taken" });
      },
      setAccount: async () => ({}),
    }),
    (e: { detail?: string; workspace?: unknown }) => e.detail === "danil_workspace_taken" && JSON.stringify(e.workspace) === JSON.stringify({ id: "loc", nombre: "Personal" }),
  );
  await assert.rejects(
    adoptDanilWorkspace(entry("X", 5), "u_1", "Personal", {
      createWorkspace: async () => ({ id: "loc" }),
      link: async () => {},
      setAccount: async () => ({ error: "workspace_id_taken" }),
    }),
    (e: { detail?: string }) => e.detail === "workspace_id_taken",
  );
});

test("downloads point at danil.ai/download with the stable names, this computer first", () => {
  assert.deepEqual(
    DESKTOP_DOWNLOADS.map((d) => d.url),
    [
      "https://danil.ai/download/Danil-macOS.dmg",
      "https://danil.ai/download/Danil-Windows-Setup.exe",
      "https://danil.ai/download/Danil-Linux-x86_64.AppImage",
    ],
  );
  assert.equal(platformOf("Mozilla/5.0 (Windows NT 10.0; Win64; x64)"), "windows");
  assert.equal(platformOf("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)"), "macos");
  assert.equal(platformOf("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"), null);
  assert.equal(platformOf("Mozilla/5.0 (Linux; Android 15)"), null);
  assert.equal(downloadsFor("Mozilla/5.0 (Windows NT 10.0)")[0].platform, "windows");
  assert.equal(downloadsFor("Mozilla/5.0 (iPhone)")[0].platform, "macos", "a phone keeps the default order");
});
