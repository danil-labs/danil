import assert from "node:assert/strict";
import test from "node:test";
import { createOrganizationSelection, type OrganizationSource } from "@terminus/computers";
import { groupByOrganization, openInOrganization, pinnedTarget } from "../../src/features/shell/web-organization-open.ts";
import type { PickerRow } from "../../src/web/workspace-picker.ts";

/** Alberto: la organización Danil (activa) y su organización personal, con la misma cuenta. */
const DANIL = { id: "org_danil", name: "Danil" };
const PERSONAL = { id: "org_personal", name: "Cuenta de Alberto Ceballos" };
const ME = "user_alberto";
const row = (account_id: string, org: string, name: string, sub = ME): PickerRow =>
  ({ account_id, org, name, sub, engine_workspace_id: "engine_" + account_id, context: "ctx_" + org, session: "s1", organization: org, email: "alberto@example.test" });
const ROWS = [row("1", DANIL.id, "Danil"), row("2", PERSONAL.id, "Danil Workspace"), row("3", DANIL.id, "Maayataan")];

async function fixture(select: OrganizationSource["select"] = async (id) => ({ organization: [DANIL, PERSONAL].find((o) => o.id === id), workspace: null })) {
  const calls: string[] = [];
  const reloads: string[] = [];
  const selection = createOrganizationSelection({
    list: async () => ({ items: [DANIL, PERSONAL], active_organization_id: DANIL.id }),
    select: async (id, key) => { calls.push(`organizations/select ${id}`); return select(id, key); },
  }, { onSelected: (org) => { reloads.push(org.id); } });
  await selection.load();
  const picker = {
    catalog: async () => ({ rows: ROWS, organizations: [], partial: false }),
    add: async (r: PickerRow) => { calls.push(`workspaces/select ${r.account_id} in ${r.context}`); },
  };
  let reauth = 0;
  const deps = { me: ME, picker, organizations: async () => selection, reauth: () => { reauth++; } };
  return { calls, reloads, selection, deps, reauths: () => reauth };
}

test("clicking a workspace of the person's other organization selects it there first, then switches the organization", async () => {
  const f = await fixture();
  assert.equal(await openInOrganization({ account_id: "2", org: PERSONAL.id }, f.deps), "opening");
  assert.deepEqual(f.calls, ["workspaces/select 2 in ctx_org_personal", "organizations/select org_personal"],
    "the workspace is chosen inside its own organization's context before the page switches, so the reload lands on it");
  assert.deepEqual(f.reloads, [PERSONAL.id], "the organization change reloads the page once");
});

test("a pinned rail row carries its picker row and skips the catalog read", async () => {
  const f = await fixture();
  let catalogReads = 0;
  const picker = { ...f.deps.picker, catalog: async () => { catalogReads++; return f.deps.picker.catalog(); } };
  assert.equal(await openInOrganization({ account_id: "2", org: PERSONAL.id, row: ROWS[1] }, { ...f.deps, picker }), "opening");
  assert.equal(catalogReads, 0);
  assert.deepEqual(f.calls, ["workspaces/select 2 in ctx_org_personal", "organizations/select org_personal"]);
});

test("an organization that asks for a new login sends the person to it instead of a dead button", async () => {
  const f = await fixture(async () => { throw { status: 409, code: "organization_auth_required" }; });
  assert.equal(await openInOrganization({ account_id: "2", org: PERSONAL.id }, f.deps), "signing_in");
  assert.equal(f.reauths(), 1);
  assert.deepEqual(f.reloads, []);
});

test("a failed switch rejects so the caller shows a notice, and the active organization stays", async () => {
  const f = await fixture(async () => { throw { status: 503, code: "unavailable" }; });
  await assert.rejects(openInOrganization({ account_id: "2", org: PERSONAL.id }, f.deps), /unavailable/);
  const state = f.selection.state();
  assert.equal(state.kind === "ready" && state.active, DANIL.id);
  assert.deepEqual(f.reloads, []);
});

test("without the organization selector there is nothing to switch with", async () => {
  const f = await fixture();
  await assert.rejects(openInOrganization({ account_id: "2", org: PERSONAL.id }, { ...f.deps, organizations: undefined }), /organization_selection_unavailable/);
  assert.deepEqual(f.calls, []);
});

test("pinned rail rows: here, another organization of the same person, or another account", () => {
  assert.equal(pinnedTarget(ROWS[0], ME, DANIL.id), "here");
  assert.equal(pinnedTarget(ROWS[1], ME, DANIL.id), "organization");
  assert.equal(pinnedTarget(row("9", DANIL.id, "Ajeno", "user_other"), ME, DANIL.id), "account");
});

test("the account menu groups workspaces by organization, the active one first", () => {
  const rows = [{ id: "2", org: PERSONAL.id, name: "Danil Workspace" }, { id: "1", org: DANIL.id, name: "Danil" }, { id: "3", org: DANIL.id, name: "Maayataan" }];
  assert.deepEqual(groupByOrganization(rows, DANIL.id).map((g) => [g.org, g.rows.map((r) => r.id)]), [[DANIL.id, ["1", "3"]], [PERSONAL.id, ["2"]]]);
  assert.deepEqual(groupByOrganization(rows, null).map((g) => g.org), [PERSONAL.id, DANIL.id], "without an active organization, the order of the list");
});
