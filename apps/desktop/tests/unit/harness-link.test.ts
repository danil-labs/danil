/**
 * «Administrar organización» abre Harness solo para owner y admin, en beta, y
 * nunca para la cuenta personal.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { harnessAdminUrl } from "../../src/lib/harness-link.ts";

test("owner y admin de una organización en beta van a Harness con su organización", () => {
  for (const role of ["owner", "admin"]) {
    assert.equal(
      harnessAdminUrl("beta.danil.ai", { org: "org_1", role, plan: "team" }),
      "https://harness.danil.ai/auth/identity/login?organization=org_1",
    );
  }
});

test("un miembro, un rol desconocido o la cuenta personal no ven el enlace", () => {
  assert.equal(harnessAdminUrl("beta.danil.ai", { org: "org_1", role: "member", plan: "team" }), null);
  assert.equal(harnessAdminUrl("beta.danil.ai", { org: "org_1", role: null, plan: "team" }), null);
  assert.equal(harnessAdminUrl("beta.danil.ai", { org: "org_1", role: "owner", plan: "free" }), null);
});

test("fuera de beta no hay portal que abrir", () => {
  assert.equal(harnessAdminUrl("alfa-app.danil.ai", { org: "org_1", role: "owner", plan: "team" }), null);
  assert.equal(harnessAdminUrl("localhost", { org: "org_1", role: "owner", plan: "team" }), null);
});
