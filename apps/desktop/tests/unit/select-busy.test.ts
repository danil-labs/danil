/**
 * `busy` (danil-engine#507): el motor está ligando workspaces y no tuvo el turno para cambiar de
 * organización. Es transitorio: se reintenta un par de veces y, si sigue, se dice sin pantalla de error.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createPersonalOpener, openPersonal } from "../../src/features/shell/personal-open.ts";
import { edgeOrganizationSource } from "../../src/features/shell/organization-edge.ts";
import { createOrganizationSelection } from "../../../../packages/computers/src/organizations.ts";
import { isBusy, retryBusy } from "../../src/features/shell/select-busy.ts";

const none = async () => {};

test("busy is recognised as an error or as a reply, and nothing else is", () => {
  assert.equal(isBusy({ detail: "busy" }), true);
  assert.equal(isBusy({ code: "busy", status: 409 }), true);
  assert.equal(isBusy({ status: 409, body: { code: "busy" } }), true);
  assert.equal(isBusy("busy"), true, "the engine may reject with the bare code");
  assert.equal(isBusy({ status: 409, body: { code: "organization_auth_required" } }), false);
  assert.equal(isBusy({ status: 200, body: {} }), false);
  assert.equal(isBusy(null), false);
});

test("retryBusy tries again twice with a short wait, then gives up with busy", async () => {
  const waits: number[] = [];
  let calls = 0;
  const ok = await retryBusy(async () => { calls++; if (calls < 3) throw { detail: "busy" }; return "done"; }, { wait: async (ms) => void waits.push(ms) });
  assert.equal(ok, "done");
  assert.deepEqual(waits, [500, 1000]);
  calls = 0;
  await assert.rejects(retryBusy(async () => { calls++; throw { detail: "busy" }; }, { wait: none }), (e) => isBusy(e));
  assert.equal(calls, 3, "one try and two retries");
  calls = 0;
  await assert.rejects(retryBusy(async () => { calls++; throw { status: 404, code: "organization_not_found" }; }, { wait: none }));
  assert.equal(calls, 1, "anything else is not retried");
});

test("the organization picker retries busy with the same key, and still busy gives the busy code", async () => {
  const keys: (string | undefined)[] = [];
  let busy = 2;
  const fetch = async (_m: string, _p: string, _b?: unknown, key?: string) => {
    keys.push(key);
    return busy-- > 0 ? { status: 409, body: { code: "busy" } } : { status: 200, body: { organization: { id: "org_a" } } };
  };
  const source = edgeOrganizationSource(fetch, undefined, { wait: none });
  assert.deepEqual(await source.select("org_a", "k1"), { organization: { id: "org_a" } });
  assert.deepEqual(keys, ["k1", "k1", "k1"], "a busy select did not happen: the same key is safe");
  const always = edgeOrganizationSource(async () => ({ status: 409, body: { code: "busy" } }), undefined, { wait: none });
  await assert.rejects(always.select("org_a", "k2"), (e: { code?: string }) => e.code === "busy");
  // El selector real guarda `busy`: el menú dice que Danil está terminando de ligar, no «no se pudo».
  const selection = createOrganizationSelection({
    list: async () => ({ items: [{ id: "org_a", name: "A" }, { id: "org_b", name: "B" }], active_organization_id: "org_b" }),
    select: always.select,
  });
  await selection.load();
  await selection.choose("org_a");
  assert.equal((selection.state() as { error?: string }).error, "busy");
});

test("opening the personal org treats busy as transient: retried, then left for the background", async () => {
  const groups = [{ context_id: "ctx-danil", org: "org_danil", email: "ana@danil.ai" }];
  const me = { status: 200, body: { id: "p", organizations: [{ id: "org_personal", type: "personal" }] } };
  let selects = 0;
  const send = async (_c: string, method: string, path: string) => {
    if (method === "GET") return me;
    selects++;
    if (path === "/v1/identity/organizations/select") throw { detail: "busy" };
    return { status: 404 };
  };
  const logged: unknown[] = [];
  const outcome = await openPersonal(groups, send, async () => groups, (...a) => void logged.push(a), { wait: none });
  assert.deepEqual(outcome, { kind: "retry", cause: "busy" }, "not «later»: it is tried again");
  assert.equal(selects, 3);
  assert.deepEqual(logged, [], "busy is not an unexpected answer");
  // La vuelta a la organización activa tras adoptar también espera su turno.
  let restores = 0;
  const opener = createPersonalOpener({
    send: async (_c, method, path) => { if (method === "GET") return me; if (path === "/v1/identity/organizations/select") { restores++; return restores < 2 ? { status: 409, body: { code: "busy" } } : { status: 200, body: {} }; } return { status: 404 }; },
    reread: async () => [...groups, { context_id: "ctx-personal", org: "org_personal", email: "ana@danil.ai" }],
    defaultContext: () => "ctx-danil",
    groups: () => groups,
    log: () => {},
    wait: none,
  });
  assert.equal((await opener.open(groups)).kind, "open");
  restores = 0;
  await opener.adopted();
  assert.equal(restores, 2, "the restore retried busy once and went through");
});
