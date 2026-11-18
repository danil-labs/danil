/**
 * En una máquina de organización el camino de la cuenta (`github_account_*`) no
 * llega por el relay: esos códigos no se pintan como error del panel, y lo que sí
 * se pinta dice qué falló en vez del código a secas.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import "../helpers/catalog.ts";
import { accountPathDown, githubAccountFailureOf } from "../../src/features/settings/github-account/failures.ts";

test("account-path codes from the relay fall back to the local connection", () => {
  for (const code of ["unsupported", "command_failed", "not_linked", "unavailable"]) {
    assert.equal(accountPathDown({ detail: code }), true, code);
    assert.equal(accountPathDown({ detail: `credentials.error.${code}` }), true, code);
  }
  assert.equal(accountPathDown({ detail: "credentials.error.license_required" }), false);
  assert.equal(accountPathDown({ detail: "credentials.error.github_unavailable" }), false);
});

test("an unknown code is shown with the operation's sentence, keeping the code as detail", () => {
  const f = githubAccountFailureOf({ detail: "command_failed" }, "Could not read") as { what: unknown; detail: string };
  assert.equal(f.what, "Could not read");
  assert.equal(f.detail, "credentials.error.command_failed");
  const g = githubAccountFailureOf({ detail: "command_failed" }) as { what: unknown };
  assert.equal(typeof g.what, "string");
  assert.notEqual(g.what, "command_failed");
});
