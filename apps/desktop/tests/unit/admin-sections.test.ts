import assert from "node:assert/strict";
import { test } from "node:test";
import { adminHref } from "../../src/features/settings/admin-href.ts";
import { accountKind, menuFor, type Section, visibleSections } from "../../src/web/admin/sections.ts";

const ALL = new Set<Section>(["general", "harness", "usage", "members", "support", "audit", "skills", "mcp", "agents", "rules", "workspaces", "plan", "identity"]);

test("only an explicit plan makes an account personal, so a missing plan never locks out an organization", () => {
  assert.equal(accountKind({ plan: "Enterprise" }), "enterprise");
  assert.equal(accountKind({ plan: "Teams" }), "teams");
  assert.equal(accountKind({ plan: "Personal" }), "personal");
  assert.equal(accountKind({ plan: null }), "teams");
});

test("the BFF saying a workspace has no organization makes it personal; a missing field does not", () => {
  assert.equal(accountKind({ plan: null, personal: true }), "personal");
  assert.equal(accountKind({ plan: null, personal: undefined }), "teams");
  assert.equal(accountKind({ plan: "Enterprise", personal: true }), "enterprise");
});

test("a personal account has no Harness", () => {
  assert.deepEqual(visibleSections("personal", true, ALL), []);
});

test("a member only reads usage and what governs their work", () => {
  assert.deepEqual(visibleSections("teams", false, ALL), ["harness", "usage", "skills", "mcp", "agents", "rules"]);
});

test("only enterprise reaches identity, and only when it exists", () => {
  assert.ok(!visibleSections("teams", true, ALL).includes("identity"));
  assert.ok(visibleSections("enterprise", true, ALL).includes("identity"));
  assert.ok(!visibleSections("enterprise", true, new Set(["general"])).includes("identity"));
});

test("real accounts today: only what has a source appears, and a member has nothing", () => {
  const live = new Set<Section>(["general", "support", "audit"]);
  assert.deepEqual(visibleSections("teams", true, live), ["general", "support", "audit"]);
  assert.deepEqual(visibleSections("teams", false, live), []);
});

test("the menu lists each section once and drops empty groups", () => {
  assert.deepEqual([...menuFor([...ALL]).flatMap((entry) => entry.sections)].sort(), [...ALL].sort());
  assert.deepEqual(menuFor(["general"]).map((entry) => entry.sections), [["general"]]);
});

test("the Harness link carries the active workspace so the organization is that one", () => {
  assert.equal(adminHref("/admin", "w-476"), "/admin?workspace=w-476");
  assert.equal(adminHref("/admin", null), "/admin");
  assert.equal(adminHref("/admin", "  "), "/admin");
  assert.equal(adminHref("/admin?demo=1", "w 1"), "/admin?demo=1&workspace=w+1");
  assert.equal(adminHref("https://alfa-app.danil.ai/admin", "w-542"), "https://alfa-app.danil.ai/admin?workspace=w-542");
});
