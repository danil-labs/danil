import assert from "node:assert/strict";
import test from "node:test";
import {
  deskBillingUrl,
  isPlanAdminRole,
  planLabelKey,
  resolveAccountGroup,
  resolveAccountPlan,
  type AccountPlanGroup,
} from "../../../../packages/features/settings/src/model/account-plan.ts";

const group = (overrides: Partial<AccountPlanGroup>): AccountPlanGroup => ({
  context_id: "ctx-1",
  org: "org-1",
  org_name: "Acme",
  plan: "business",
  role: "admin",
  email: "admin@example.com",
  family: "fam-1",
  added: new Set(["ws-1"]),
  available: [{ id: "ws-1", name: "Main" }],
  ...overrides,
});

test("isPlanAdminRole allows only admin and owner (case-insensitive)", () => {
  assert.equal(isPlanAdminRole("owner"), true);
  assert.equal(isPlanAdminRole("admin"), true);
  assert.equal(isPlanAdminRole("  OWNER "), true);
  assert.equal(isPlanAdminRole("Admin"), true);
  assert.equal(isPlanAdminRole("member"), false);
  assert.equal(isPlanAdminRole("guest"), false);
  assert.equal(isPlanAdminRole("viewer"), false);
  assert.equal(isPlanAdminRole(""), false);
  assert.equal(isPlanAdminRole(null), false);
  assert.equal(isPlanAdminRole(undefined), false);
});

test("resolveAccountGroup prefers matching context, then workspace, and never guesses across multiple groups", () => {
  const adminGroup = group({
    context_id: "ctx-admin",
    org: "org-admin",
    org_name: "Admin Org",
    role: "owner",
    plan: "business",
    added: new Set(["ws-admin"]),
    available: [{ id: "ws-admin", name: "Admin WS" }],
  });
  const memberGroup = group({
    context_id: "ctx-member",
    org: "org-member",
    org_name: "Member Org",
    role: "member",
    plan: "pro",
    added: new Set(["ws-member"]),
    available: [{ id: "ws-member", name: "Member WS" }],
  });

  assert.equal(
    resolveAccountGroup([adminGroup, memberGroup], { workspace: "ws-member", context: "ctx-admin" })?.org,
    "org-admin",
  );
  assert.equal(
    resolveAccountGroup([adminGroup, memberGroup], { workspace: "ws-member", context: null })?.org,
    "org-member",
  );
  assert.equal(
    resolveAccountGroup([adminGroup, memberGroup], { workspace: "ws-unknown", context: null }),
    null,
  );
  assert.equal(
    resolveAccountGroup([adminGroup], { workspace: null, context: null })?.org,
    "org-admin",
  );
});

test("resolveAccountPlan resolves from rail groups, enriches from organizations, and falls back to webGroup or active org", () => {
  const rail = [
    group({ context_id: "ctx-a", org: "org-a", org_name: "Alpha", plan: null, role: null, added: new Set(["ws-a"]) }),
    group({ context_id: "ctx-b", org: "org-b", org_name: "Beta", plan: "free", role: "member", added: new Set(["ws-b"]) }),
  ];
  const orgs = [
    { id: "org-a", name: "Alpha", plan: "business", role: "owner" },
    { id: "org-b", name: "Beta", plan: "free", role: "member" },
  ];

  assert.deepEqual(
    resolveAccountPlan({ workspace: "ws-a", context: "ctx-a", groups: rail, organizations: orgs }),
    { org: "org-a", orgName: "Alpha", plan: "business", role: "owner" },
  );
  assert.deepEqual(
    resolveAccountPlan({ workspace: "ws-b", context: "ctx-b", groups: rail, organizations: orgs }),
    { org: "org-b", orgName: "Beta", plan: "free", role: "member" },
  );
  assert.deepEqual(
    resolveAccountPlan({
      workspace: null,
      groups: [],
      webGroup: { context: "ctx-w", org: "org-w", name: "Web Org", plan: "pro", role: "admin" },
    }),
    { org: "org-w", orgName: "Web Org", plan: "pro", role: "admin" },
  );
  assert.deepEqual(
    resolveAccountPlan({
      workspace: null,
      groups: null,
      organizations: orgs,
      activeOrganizationId: "org-a",
    }),
    { org: "org-a", orgName: "Alpha", plan: "business", role: "owner" },
  );
});

test("deskBillingUrl and planLabelKey produce expected Desk URL and translation keys", () => {
  assert.equal(
    deskBillingUrl("org_123", "https://beta.danil.ai"),
    "https://beta.danil.ai/billing?org=org_123&return=desk",
  );
  assert.equal(planLabelKey("free"), "settings.account.plan_free");
  assert.equal(planLabelKey("Pro"), "settings.account.plan_pro");
  assert.equal(planLabelKey("BUSINESS"), "settings.account.plan_business");
  assert.equal(planLabelKey("custom-tier"), null);
  assert.equal(planLabelKey(null), null);
});
