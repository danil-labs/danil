import assert from "node:assert/strict";
import test from "node:test";
import {
  governedSectionFor,
  resolveSettingsWorkspaces,
  settingsScopeBadge,
  workspaceMetadataLabel,
} from "../../../../packages/features/settings/src/model/settings-workspaces.ts";

const META_LABELS = {
  personal: "Personal",
  local: "Local",
  expired: "Sesión caducada",
  planFree: "Free",
  planBusiness: "Business",
};

const SCOPE_LABELS = {
  orgPolicy: "Política de organización",
  organization: "Organización",
  workspace: "Workspace",
};

test("falls back to engine workspaces when no session groups exist (Desk local)", () => {
  const { options, active } = resolveSettingsWorkspaces({
    activeId: "w2",
    activeContext: null,
    engineWorkspaces: [
      { id: "w1", name: "Acme", logo: null },
      { id: "w2", name: "Beta", logo: "logo.png" },
    ],
    groups: null,
  });

  assert.equal(options.length, 2);
  assert.equal(active?.id, "w2");
  assert.equal(active?.logo, "logo.png");
  assert.equal(active?.context, null);
  assert.equal(active?.isOrg, false);
  assert.equal(workspaceMetadataLabel(active!, META_LABELS), "Local");
});

test("merges session groups across organizations and enriches logo from engine workspaces", () => {
  const { options, active } = resolveSettingsWorkspaces({
    activeId: "ws-eng",
    activeContext: "ctx-acme",
    engineWorkspaces: [{ id: "ws-eng", name: "Ingeniería local", logo: "eng.png" }],
    groups: [
      {
        context_id: "ctx-acme",
        org: "org_acme",
        org_name: "Acme Corp",
        plan: "business",
        email: "ana@acme.test",
        family: "f1",
        added: new Set(["ws-eng"]),
        available: [
          { id: "ws-eng", name: "Ingeniería" },
          { id: "ws-hidden", name: "No agregado" },
        ],
      },
      {
        context_id: "ctx-free",
        org: "org_personal",
        org_name: null,
        plan: "free",
        email: "ana@personal.test",
        family: "f1",
        added: new Set(["ws-home"]),
        available: [{ id: "ws-home", name: "Personal" }],
      },
    ],
  });

  assert.deepEqual(
    options.map((o) => [o.id, o.context, o.active]),
    [
      ["ws-eng", "ctx-acme", true],
      ["ws-home", "ctx-free", false],
    ],
  );
  assert.equal(active?.name, "Ingeniería");
  assert.equal(active?.logo, "eng.png");
  assert.equal(active?.isOrg, true);
  assert.equal(workspaceMetadataLabel(active!, META_LABELS), "Acme Corp · Business");
  assert.equal(workspaceMetadataLabel(options[1], META_LABELS), "Personal · Free");
});

test("handles single workspace in Web cleanly without extra entries", () => {
  const { options, active } = resolveSettingsWorkspaces({
    activeId: "ws-only",
    activeContext: "ctx-1",
    engineWorkspaces: [],
    groups: [
      {
        context_id: "ctx-1",
        org: "org_1",
        org_name: "Danil Labs",
        plan: "business",
        email: "ada@danil.ai",
        family: "f1",
        added: new Set(["ws-only"]),
        available: [{ id: "ws-only", name: "Danil", logo: null }],
      },
    ],
    otherAccounts: [],
  });

  assert.equal(options.length, 1);
  assert.equal(active?.id, "ws-only");
  assert.equal(active?.active, true);
  assert.equal(workspaceMetadataLabel(active!, META_LABELS), "Danil Labs · Business");
});

test("includes other browser accounts on Web with signed-in and expired metadata", () => {
  const loader = async () => "data:image/png;base64,abc";
  const { options } = resolveSettingsWorkspaces({
    activeId: "ws-1",
    activeContext: "ctx-1",
    engineWorkspaces: [{ id: "ws-1", name: "Principal" }],
    groups: null,
    otherAccounts: [
      {
        user_id: "u2",
        email: "otra@danil.ai",
        signedIn: true,
        workspaces: [{ id: "ws-2", name: "Secundario", logo: loader }],
      },
      {
        user_id: "u3",
        email: "vieja@danil.ai",
        signedIn: false,
        workspaces: [{ id: "ws-3", name: "Caducado", logo: loader }],
      },
    ],
  });

  assert.equal(options.length, 3);
  assert.equal(options[1].otherAccount?.signedIn, true);
  assert.equal(workspaceMetadataLabel(options[1], META_LABELS), "otra@danil.ai");
  assert.equal(options[2].otherAccount?.signedIn, false);
  assert.equal(workspaceMetadataLabel(options[2], META_LABELS), "vieja@danil.ai · Sesión caducada");
});

test("computes governed sections and discrete scope badges", () => {
  assert.equal(governedSectionFor("general", "general"), "context_sources");
  assert.equal(governedSectionFor("appearance", "appearance"), null);
  assert.equal(governedSectionFor("ai-accounts", "proveedores-ia"), "models");
  assert.equal(governedSectionFor("agents-skills", "agentes"), "agents");
  assert.equal(governedSectionFor("agents-skills", "skills"), "skills");
  assert.equal(governedSectionFor("connections", "operation"), "mcp_servers");

  assert.deepEqual(
    settingsScopeBadge({
      entryId: "agents-skills",
      workspace: { isOrg: true },
      governed: true,
      labels: SCOPE_LABELS,
    }),
    { kind: "policy", tone: "info", label: "Política de organización" },
  );

  assert.deepEqual(
    settingsScopeBadge({
      entryId: "billing",
      workspace: { isOrg: true },
      governed: false,
      labels: SCOPE_LABELS,
    }),
    { kind: "org", tone: "info", label: "Organización" },
  );

  assert.deepEqual(
    settingsScopeBadge({
      entryId: "general",
      workspace: { isOrg: false },
      governed: false,
      labels: SCOPE_LABELS,
    }),
    { kind: "workspace", tone: "neutral", label: "Workspace" },
  );

  assert.equal(
    settingsScopeBadge({
      entryId: "security",
      workspace: { isOrg: false },
      governed: false,
      labels: SCOPE_LABELS,
    }),
    null,
  );
});
