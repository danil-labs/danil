import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

test("the legacy billing guard finds absolute URLs and templates in the app and packages", async (t) => {
  const { legacyBillingRoutes } = await import("../../scripts/guards/no-legacy-billing.mjs");
  const root = mkdtempSync(join(tmpdir(), "danil-legacy-billing-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const sources = {
    "apps/desktop/src/relative.ts": 'fetch("/auth/account/business/summary")',
    "apps/desktop/alpha-entry/absolute.ts": 'fetch("https://beta.danil.ai/auth/account/business/status")',
    "packages/computers/src/template.ts": 'fetch(`${base}/auth/account/business/${id}`)',
    "packages/computers/src/tail.ts": 'fetch(`${base}/auth/account/business`)',
    "packages/computers/src/comments.ts": '// fetch("/auth/account/business/summary")\n/* "/auth/account/business/" */',
    "packages/computers/node_modules/ignored.ts": 'fetch("/auth/account/business/summary")',
  };
  for (const [name, source] of Object.entries(sources)) {
    mkdirSync(join(root, name, ".."), { recursive: true });
    writeFileSync(join(root, name), source);
  }
  assert.deepEqual(legacyBillingRoutes(root).sort(), Object.keys(sources).slice(0, 4).sort());
});
