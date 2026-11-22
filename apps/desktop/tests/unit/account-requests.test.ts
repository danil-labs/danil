import assert from "node:assert/strict";
import { test } from "node:test";
import { createAccountRequests, listOrgs } from "../../src/features/shell/account-requests.ts";
import type { ContextGroup } from "../../src/features/shell/session-context-types.ts";

const acme: ContextGroup = { context_id: "c-acme", org: "org_acme", org_name: "Acme", plan: "pro", role: "admin", family: "f", email: "a@example.com" };

test("orgs.list includes the role and distinguishes organizations with the same name", () => {
  const twin = { ...acme, org: "org_twin", email: "b@example.com", role: "member" };
  assert.deepEqual(listOrgs([acme, twin]), [
    { org: "org_acme", name: "Acme", role: "admin", email: "a@example.com" },
    { org: "org_twin", name: "Acme", role: "member", email: "b@example.com" },
  ]);
});

test("the app settles CLI requests without creating a workspace", async () => {
  let queue = [{ request_id: "create", op: "workspace.create", key: "create" }, { request_id: "list", op: "orgs.list", key: "list" }];
  const settled: unknown[] = [];
  const invoke = async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
    if (command === "account_request_take") { const rows = queue; queue = []; return rows as T; }
    assert.equal(command, "account_request_settle");
    settled.push(args);
    return undefined as T;
  };
  const requests = createAccountRequests(invoke, { groups: () => [acme] });
  await Promise.all([requests.pump(), requests.pump()]);
  assert.deepEqual(settled, [
    { requestId: "create", error: { code: "unavailable" } },
    { requestId: "list", result: [{ org: "org_acme", name: "Acme", role: "admin" }] },
  ]);
});
