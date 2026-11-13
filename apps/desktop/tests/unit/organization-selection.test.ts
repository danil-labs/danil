import assert from "node:assert/strict";
import test from "node:test";
import {
  announcesOrganizations,
  hasActiveOrganization,
  createOrganizationSelection,
  isOrganizationSelectionRequired,
  type OrganizationSource,
} from "../../src/features/shell/organization-selection.ts";

const DANIL = { id: "org_01M62PT11XGX8R8J883NZVYHR6", name: "Danil", plan: "enterprise", role: "owner" };
const OTRA = { id: "org_otra", name: "Otra", plan: "team", role: "member", extra: { ignorado: true } };

const CAPS = { contract: "mvp-v1", items: [{ name: "identity.organizations", version: 1, status: "available" }] };

/** Un reloj a mano: los reintentos se ven, no se esperan. */
function clock() {
  const timers: { at: number; run: () => void }[] = [];
  return {
    timers,
    schedule: (run: () => void, ms: number) => {
      timers.push({ at: ms, run });
      return () => {
        const i = timers.findIndex((x) => x.run === run);
        if (i >= 0) timers.splice(i, 1);
      };
    },
    fire: async () => {
      const next = timers.shift();
      next?.run();
      await new Promise((r) => setTimeout(r, 0));
    },
  };
}

const problem = (status: number, code: string) => Object.assign(new Error(code), { status, code });

test("404 de organizations: el selector queda oculto y se reintenta solo con backoff hasta que aparece", async () => {
  const c = clock();
  let calls = 0;
  const source: OrganizationSource = {
    list: async () => {
      calls++;
      if (calls < 3) throw problem(calls === 1 ? 404 : 501, "not_found");
      return { items: [DANIL], next_cursor: null, active_organization_id: DANIL.id, nuevo: 1 };
    },
    select: async () => ({ organization: DANIL, workspace: null }),
  };
  const sel = createOrganizationSelection(source, { schedule: c.schedule, key: () => "k" });
  await sel.load();
  assert.equal(sel.state().kind, "hidden");
  assert.equal(sel.visible(), false);
  assert.equal(c.timers.length, 1, "un reintento programado");
  const first = c.timers[0].at;
  await c.fire();
  assert.equal(sel.state().kind, "hidden");
  assert.ok(c.timers[0].at > first, "la espera crece");
  await c.fire();
  const s = sel.state();
  assert.equal(s.kind, "ready");
  assert.deepEqual(s.kind === "ready" && s.items.map((o) => o.id), [DANIL.id]);
  assert.equal(s.kind === "ready" && s.active, DANIL.id);
  assert.equal(sel.visible(), true);
  assert.equal(c.timers.length, 0, "sin reintentos cuando ya funciona");
});

test("el error de Desk `not_available_yet` (Rust ya reintentó) también oculta y reintenta", async () => {
  const c = clock();
  const sel = createOrganizationSelection(
    { list: async () => { throw { detail: "not_available_yet", retry_after_ms: 30_000 }; }, select: async () => null },
    { schedule: c.schedule },
  );
  await sel.load();
  assert.equal(sel.state().kind, "hidden");
  assert.ok(c.timers[0].at >= 30_000, "respeta la espera sugerida");
});

test("capacidad ausente o de otra versión en /v1/capabilities: oculto, sin llamar a la ruta, y se relee después", async () => {
  const c = clock();
  let listed = 0;
  let caps: unknown = { contract: "mvp-v1", items: [{ name: "workspaces", version: 1, status: "available" }] };
  const sel = createOrganizationSelection(
    {
      capabilities: async () => caps,
      list: async () => { listed++; return { items: [DANIL, OTRA], next_cursor: null, active_organization_id: DANIL.id }; },
      select: async () => null,
    },
    { schedule: c.schedule },
  );
  await sel.load();
  assert.equal(sel.state().kind, "hidden");
  assert.equal(listed, 0);
  caps = { items: [{ name: "identity.organizations", version: 2, status: "available" }] };
  await c.fire();
  assert.equal(sel.state().kind, "hidden", "una versión mayor desconocida es no disponible");
  caps = { items: [{ name: "identity.organizations", version: 1, status: "degraded" }] };
  await c.fire();
  assert.equal(sel.state().kind, "hidden", "degraded es no disponible (edge.openapi Capability)");
  assert.equal(listed, 0);
  caps = { items: [{ name: "identity.organizations", version: 1, status: "available", otro: 1 }] };
  await c.fire();
  assert.equal(sel.state().kind, "ready");
  assert.equal(listed, 1);
});

test("200 con varias: lista, campos desconocidos ignorados y `select` cambia la organización y refresca workspaces y máquinas", async () => {
  const sent: { id: string; key: string }[] = [];
  const refreshed: string[] = [];
  let active = DANIL.id;
  const sel = createOrganizationSelection(
    {
      list: async () => ({ items: [DANIL, OTRA, { id: 7 }], next_cursor: null, active_organization_id: active }),
      select: async (id, key) => { sent.push({ id, key }); active = id; return { organization: OTRA, workspace: null }; },
    },
    {
      key: () => "clave-1",
      onSelected: async (org, workspace) => {
        refreshed.push(`workspaces:${org.id}:${workspace}`);
        refreshed.push(`machines:${org.id}`);
      },
    },
  );
  await sel.load();
  const s = sel.state();
  assert.equal(s.kind, "ready");
  assert.deepEqual(s.kind === "ready" && s.items.map((o) => o.name), ["Danil", "Otra"], "la fila inválida se descarta");
  await sel.choose(OTRA.id);
  assert.deepEqual(sent, [{ id: OTRA.id, key: "clave-1" }]);
  const after = sel.state();
  assert.equal(after.kind === "ready" && after.active, OTRA.id);
  assert.deepEqual(refreshed, [`workspaces:${OTRA.id}:null`, `machines:${OTRA.id}`]);
  await sel.choose(OTRA.id);
  assert.equal(sent.length, 1, "elegir la activa no vuelve a escribir");
});

test("un `select` que falla con 404 deja la organización anterior y no refresca", async () => {
  let refreshed = 0;
  const sel = createOrganizationSelection(
    {
      list: async () => ({ items: [DANIL, OTRA], next_cursor: null, active_organization_id: DANIL.id }),
      select: async () => { throw problem(404, "organization_not_found"); },
    },
    { onSelected: () => { refreshed++; } },
  );
  await sel.load();
  await sel.choose(OTRA.id);
  const s = sel.state();
  assert.equal(s.kind === "ready" && s.active, DANIL.id);
  assert.equal(s.kind === "ready" && s.error, "organization_not_found");
  assert.equal(refreshed, 0);
});

test("403 organization_selection_required de otra ruta abre el selector; elegir lo cierra", async () => {
  const sel = createOrganizationSelection(
    {
      list: async () => ({ items: [DANIL, OTRA], next_cursor: null, active_organization_id: null }),
      select: async () => ({ organization: DANIL, workspace: null }),
    },
    { key: () => "k" },
  );
  await sel.load();
  assert.equal(sel.needed(), true, "sin activa y con varias, se pide elegir");
  await sel.choose(DANIL.id);
  assert.equal(sel.needed(), false);
  const problem403 = { type: "urn:danil:problem:organization_selection_required", status: 403, code: "organization_selection_required" };
  assert.equal(isOrganizationSelectionRequired(problem403), true);
  assert.equal(isOrganizationSelectionRequired({ detail: "organization_selection_required" }), true, "forma de error de Desk");
  assert.equal(isOrganizationSelectionRequired(problem(403, "workspace_forbidden")), false);
  assert.equal(sel.report(problem403), true);
  assert.equal(sel.needed(), true);
});

test("sin activa y una sola organización: `select` directo, sin abrir el selector", async () => {
  const sent: string[] = [];
  const sel = createOrganizationSelection({
    list: async () => ({ items: [DANIL], next_cursor: null, active_organization_id: null }),
    select: async (id) => { sent.push(id); return { organization: DANIL, workspace: "12" }; },
  });
  await sel.load();
  assert.deepEqual(sent, [DANIL.id]);
  assert.equal(sel.needed(), false);
  const s = sel.state();
  assert.equal(s.kind === "ready" && s.active, DANIL.id);
});

test("lista vacía: el selector no se muestra (sin organizaciones con plan)", async () => {
  const sel = createOrganizationSelection({ list: async () => ({ items: [], next_cursor: null }), select: async () => null });
  await sel.load();
  const s = sel.state();
  assert.equal(s.kind === "ready" && s.items.length, 0);
  assert.equal(sel.visible(), false);
});

test("Idempotency-Key: una clave por intento lógico de `select`, reutilizada en sus reintentos hasta llegar a danil_edge_fetch", async () => {
  const { edgeOrganizationSource } = await import("../../src/features/shell/organization-edge.ts");
  const calls: { method: string; path: string; body?: unknown; key?: string }[] = [];
  let lose = 2;
  const edgeFetch = async (method: "GET" | "POST", path: string, body?: unknown, key?: string) => {
    calls.push({ method, path, body, key });
    if (path === "/v1/capabilities") return { status: 200, body: CAPS };
    if (method === "GET") return { status: 200, body: { items: [DANIL, OTRA], next_cursor: null, active_organization_id: DANIL.id } };
    if (lose-- > 0) return lose === 1 ? { status: 503, body: { code: "unavailable" }, retry_after_ms: 10 } : Promise.reject({ detail: "unavailable" });
    return { status: 200, body: { organization: OTRA, workspace: null } };
  };
  let n = 0;
  const sel = createOrganizationSelection(edgeOrganizationSource(edgeFetch), { key: () => `clave-${++n}` });
  await sel.load();
  await sel.choose(OTRA.id); // 503
  await sel.choose(OTRA.id); // sin red: la respuesta pudo perderse
  await sel.choose(OTRA.id); // 200
  const posts = calls.filter((c) => c.method === "POST");
  assert.equal(posts.length, 3);
  assert.deepEqual(posts.map((c) => c.key), ["clave-1", "clave-1", "clave-1"]);
  assert.deepEqual(posts[0].body, { organization_id: OTRA.id });
  assert.equal(posts[0].path, "/v1/identity/organizations/select");
  const s = sel.state();
  assert.equal(s.kind === "ready" && s.active, OTRA.id);
  // Otra intención, otra clave.
  await sel.choose(DANIL.id);
  assert.equal(calls.filter((c) => c.method === "POST").at(-1)?.key, "clave-2");
});

test("adaptador del borde: 404/501 → oculto y reintento; 403 organization_selection_required se reconoce", async () => {
  const { edgeOrganizationSource } = await import("../../src/features/shell/organization-edge.ts");
  const c = clock();
  let status = 404;
  const source = edgeOrganizationSource(async (_m, path) =>
    path === "/v1/capabilities" ? { status: 200, body: CAPS }
    : status === 200
      ? { status, body: { items: [DANIL], next_cursor: null, active_organization_id: DANIL.id } }
      : { status, body: { type: "urn:danil:problem:not_found", status, code: "not_found" } },
  );
  const sel = createOrganizationSelection(source, { schedule: c.schedule });
  await sel.load();
  assert.equal(sel.state().kind, "hidden");
  status = 501;
  await c.fire();
  assert.equal(sel.state().kind, "hidden");
  status = 200;
  await c.fire();
  assert.equal(sel.visible(), true);
  assert.equal(isOrganizationSelectionRequired({ detail: "organization_selection_required", status: 403, body: {} }), true);
});

test("adaptador del borde: lee /v1/capabilities; sin `identity.organizations` no pide la ruta", async () => {
  const { edgeOrganizationSource } = await import("../../src/features/shell/organization-edge.ts");
  const c = clock();
  const paths: string[] = [];
  let caps: unknown = { contract: "mvp-v1", items: [{ name: "machines", version: 1, status: "available" }] };
  const sel = createOrganizationSelection(
    edgeOrganizationSource(async (_m, path) => {
      paths.push(path);
      if (path === "/v1/capabilities") return { status: 200, body: caps };
      return { status: 200, body: { items: [DANIL], next_cursor: null, active_organization_id: DANIL.id } };
    }),
    { schedule: c.schedule },
  );
  await sel.load();
  assert.deepEqual(paths, ["/v1/capabilities"]);
  assert.equal(sel.visible(), false);
  caps = { contract: "mvp-v1", items: [{ name: "identity.organizations", version: 1, status: "available" }] };
  await c.fire();
  assert.deepEqual(paths, ["/v1/capabilities", "/v1/capabilities", "/v1/identity/organizations"]);
  assert.equal(sel.visible(), true);
});

test("report: solo `organization_selection_required` abre el selector; otro 403 del borde (license_required, workspace_forbidden) se ignora", async () => {
  const sel = createOrganizationSelection({
    list: async () => ({ items: [DANIL, OTRA], next_cursor: null, active_organization_id: DANIL.id }),
    select: async () => null,
  });
  await sel.load();
  let changes = 0;
  sel.subscribe(() => changes++);
  for (const code of ["license_required", "workspace_forbidden", "csrf_failed"]) {
    assert.equal(sel.report({ detail: code, status: 403, body: { code } }), false, code);
  }
  assert.equal(sel.report({ detail: "organization_selection_required", status: 404, body: {} }), false, "solo con 403");
  assert.equal(sel.needed(), false);
  assert.equal(changes, 0, "ni siquiera avisa");
  assert.equal(sel.report({ detail: "organization_selection_required", status: 403, body: { code: "organization_selection_required" } }), true);
  assert.equal(sel.needed(), true);
});

test("organizaciones `degraded` en /v1/capabilities es «no disponible», como en la web y en Machines (edge.openapi Capability)", () => {
  assert.equal(announcesOrganizations({ contract: "mvp-v1", items: [{ name: "identity.organizations", version: 1, status: "degraded" }] }), false);
  assert.equal(announcesOrganizations({ contract: "mvp-v1", items: [{ name: "identity.organizations", version: 1, status: "available" }] }), true);
});


test("promo requires a settled active organization in the current membership list", () => {
  assert.equal(hasActiveOrganization({ kind: "hidden" }), false);
  const ready = { kind: "ready" as const, items: [DANIL], active: DANIL.id, busy: false, error: null };
  assert.equal(hasActiveOrganization(ready), true);
  assert.equal(hasActiveOrganization({ ...ready, active: null }), false);
  assert.equal(hasActiveOrganization({ ...ready, active: "org_removed" }), false);
  assert.equal(hasActiveOrganization({ ...ready, items: [] }), false);
  assert.equal(hasActiveOrganization({ ...ready, busy: true }), false);
  assert.equal(hasActiveOrganization({ ...ready, error: "forbidden" }), false);
});

test('a Desk selection refusal retains its detail without inventing an HTTP status', async () => {
  let selections = 0;
  const sel = createOrganizationSelection({
    list: async () => ({ items: [DANIL, OTRA], active_organization_id: DANIL.id }),
    select: async () => { selections++; throw { detail: 'organization_not_found' }; },
  });
  await sel.load();
  await sel.choose(OTRA.id);
  const state = sel.state();
  assert.equal(state.kind === 'ready' && state.error, 'organization_not_found');
  assert.equal(state.kind === 'ready' && state.errorStatus, undefined);
  assert.equal(state.kind === 'ready' && state.active, DANIL.id);
  assert.equal(selections, 1);
});

for (const [status, refused] of [[403, true], [404, true], [409, true], [408, false], [429, false], [503, false]] as const) {
  test(`the selector publishes its selection refusal decision for HTTP ${status}`, async () => {
    const sel = createOrganizationSelection({
      list: async () => ({ items: [DANIL, OTRA], active_organization_id: DANIL.id }),
      select: async () => { throw problem(status, 'selection_failure'); },
    });
    await sel.load();
    await sel.choose(OTRA.id);
    const state = sel.state();
    assert.equal(state.kind === 'ready' && state.errorStatus, status);
    assert.equal(state.kind === 'ready' && state.refused, refused);
    assert.equal(state.kind === 'ready' && state.active, DANIL.id);
  });
}

test('a definitive automatic selection refusal is not sent again by later loads; only the person retries it', async () => {
  const c = clock();
  const keys: string[] = [];
  const sel = createOrganizationSelection({
    list: async () => ({ items: [DANIL], active_organization_id: null }),
    select: async (_id, key) => { keys.push(key); throw problem(403, 'organization_forbidden'); },
  }, { schedule: c.schedule, key: () => `key-${keys.length}` });
  await sel.load();
  await sel.load();
  assert.equal(sel.report(problem(403, 'organization_selection_required')), true);
  await c.fire();
  const state = sel.state();
  assert.equal(keys.length, 1, 'reloading the list must not repeat a refused selection');
  assert.equal(state.kind === 'ready' && state.refused, true);
  assert.equal(state.kind === 'ready' && state.error, 'organization_forbidden');
  assert.equal(state.kind === 'ready' && state.errorStatus, 403);
  assert.equal(hasActiveOrganization(state), false);
  await sel.choose(DANIL.id);
  assert.deepEqual(keys, ['key-0', 'key-1'], 'an explicit choice is a new intention with a new key');
});

test('a refused organization that the directory later reports active clears the refusal', async () => {
  let active: string | null = null;
  let selections = 0;
  const sel = createOrganizationSelection({
    list: async () => ({ items: [DANIL], active_organization_id: active }),
    select: async () => { selections++; throw problem(409, 'organization_conflict'); },
  });
  await sel.load();
  active = DANIL.id;
  await sel.load();
  const state = sel.state();
  assert.equal(selections, 1);
  assert.equal(state.kind === 'ready' && state.refused, false);
  assert.equal(hasActiveOrganization(state), true);
});
