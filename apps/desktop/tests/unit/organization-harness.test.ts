import assert from "node:assert/strict";
import test from "node:test";
import {
  canOpenOrganizationHarness,
  HARNESS_URL,
  isHarnessAdminRole,
  isOrganizationScope,
  type HarnessGroup,
} from "../../../../packages/shell/src/shell/organization-harness.ts";

const group = (overrides: Partial<HarnessGroup> = {}): HarnessGroup => ({
  context_id: "ctx-org",
  org: "org-acme",
  plan: "business",
  role: "owner",
  added: new Set(["ws-org"]),
  available: [{ id: "ws-org" }],
  ...overrides,
});

test("HARNESS_URL points to the organization Harness", () => {
  assert.equal(HARNESS_URL, "https://harness.danil.ai/");
});

test("isHarnessAdminRole accepts only owner and admin", () => {
  assert.equal(isHarnessAdminRole("owner"), true);
  assert.equal(isHarnessAdminRole("admin"), true);
  assert.equal(isHarnessAdminRole("  OWNER "), true);
  assert.equal(isHarnessAdminRole("Admin"), true);
  assert.equal(isHarnessAdminRole("member"), false);
  assert.equal(isHarnessAdminRole("guest"), false);
  assert.equal(isHarnessAdminRole("viewer"), false);
  assert.equal(isHarnessAdminRole(""), false);
  assert.equal(isHarnessAdminRole(null), false);
  assert.equal(isHarnessAdminRole(undefined), false);
});

test("isOrganizationScope excludes personal and local scopes, and honors explicit type/personal flags", () => {
  assert.equal(isOrganizationScope({ org: "org_p", personal: true, plan: "free" }), false);
  assert.equal(isOrganizationScope({ org: "org_p", personal: true, plan: "pro" }), false);
  assert.equal(isOrganizationScope({ org: "org_p", type: "personal", plan: "pro" }), false);
  assert.equal(isOrganizationScope({ org: "org_free", plan: "free" }), false);
  assert.equal(isOrganizationScope({ org: "org_unknown", plan: null }), false);
  assert.equal(isOrganizationScope({ org: "", plan: "enterprise" }), false);

  assert.equal(isOrganizationScope({ org: "org_acme", type: "organization", plan: "free" }), true);
  assert.equal(isOrganizationScope({ org: "org_team", type: "team", plan: "free" }), true);
  assert.equal(isOrganizationScope({ org: "org_acme", personal: false, plan: "free" }), true);
  assert.equal(isOrganizationScope({ org: "org_acme", plan: "pro" }), true);
  assert.equal(isOrganizationScope({ org: "org_acme", plan: "enterprise" }), true);
});

test("canOpenOrganizationHarness shows for owner/admin on an organization workspace and hides for member, personal, and local workspaces", () => {
  const orgOwner = group({ context_id: "ctx-owner", org: "org-acme", role: "owner", plan: "business", added: new Set(["ws-acme"]), available: [{ id: "ws-acme" }] });
  const orgAdmin = group({ context_id: "ctx-admin", org: "org-beta", role: "admin", plan: "pro", added: new Set(["ws-beta"]), available: [{ id: "ws-beta" }] });
  const orgMember = group({ context_id: "ctx-member", org: "org-gamma", role: "member", plan: "enterprise", added: new Set(["ws-gamma"]), available: [{ id: "ws-gamma" }] });
  const personal = group({ context_id: "ctx-personal", org: "org-personal", role: "owner", plan: "free", personal: true, org_type: "personal", added: new Set(["ws-personal"]), available: [{ id: "ws-personal" }] });
  const freeOrg = group({ context_id: "ctx-free-org", org: "org-free-team", role: "admin", plan: "free", org_type: "organization", added: new Set(["ws-free-org"]), available: [{ id: "ws-free-org" }] });
  const groups = [orgOwner, orgAdmin, orgMember, personal, freeOrg];

  assert.equal(canOpenOrganizationHarness({ workspace: "ws-acme", context: "ctx-owner", groups }), true);
  assert.equal(canOpenOrganizationHarness({ workspace: "ws-beta", context: "ctx-admin", groups }), true);
  assert.equal(canOpenOrganizationHarness({ workspace: "ws-acme", context: null, groups }), true, "matches unique workspace without explicit context");
  assert.equal(canOpenOrganizationHarness({ workspace: "ws-free-org", context: "ctx-free-org", groups }), true, "explicit organization type wins over free plan");

  assert.equal(canOpenOrganizationHarness({ workspace: "ws-gamma", context: "ctx-member", groups }), false, "member never sees Harness");
  assert.equal(canOpenOrganizationHarness({ workspace: "ws-personal", context: "ctx-personal", groups }), false, "personal workspace never sees Harness");
  assert.equal(canOpenOrganizationHarness({ workspace: "ws-local", context: null, groups }), false, "local workspace outside groups never sees Harness");
  assert.equal(canOpenOrganizationHarness({ workspace: null, context: "ctx-owner", groups }), false, "no open workspace");
  assert.equal(
    canOpenOrganizationHarness({
      workspace: "ws-acme",
      context: "ctx-owner",
      groups: [{ ...orgOwner, empty_reason: "organization_access_denied" }],
    }),
    false,
  );
});

test("canOpenOrganizationHarness supports webGroup fallback and legacy organizations fallback strictly", () => {
  assert.equal(
    canOpenOrganizationHarness({
      workspace: "ws-1",
      context: "ctx-1",
      groups: null,
      webGroup: { context: "ctx-1", org: "org-1", plan: "enterprise", role: "owner", personal: false },
    }),
    true,
  );
  assert.equal(
    canOpenOrganizationHarness({
      workspace: "ws-1",
      context: "ctx-1",
      groups: null,
      webGroup: { context: "ctx-1", org: "org-p", plan: "free", role: "owner", personal: true },
    }),
    false,
  );
  assert.equal(
    canOpenOrganizationHarness({
      workspace: "ws-1",
      context: "ctx-1",
      groups: null,
      webGroup: { context: "ctx-1", org: "org-1", plan: "enterprise", role: "member", personal: false },
    }),
    false,
  );
  assert.equal(
    canOpenOrganizationHarness({
      workspace: "ws-1",
      groups: null,
      organizations: [
        { id: "org-1", plan: "business", role: "admin", type: "organization" },
        { id: "org-p", plan: "free", role: "owner", type: "personal" },
      ],
      activeOrganizationId: "org-1",
    }),
    true,
  );
  assert.equal(
    canOpenOrganizationHarness({
      workspace: "ws-1",
      groups: null,
      organizations: [{ id: "org-p", plan: "free", role: "owner", type: "personal" }],
      activeOrganizationId: "org-p",
    }),
    false,
  );
  assert.equal(
    canOpenOrganizationHarness({
      workspace: "ws-1",
      groups: [],
      organizations: [{ id: "org-1", plan: "business", role: "admin", type: "organization" }],
      activeOrganizationId: "org-1",
    }),
    false,
    "empty group-accounts session list does not fall back to legacy organizations",
  );
});
