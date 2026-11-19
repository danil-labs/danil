/**
 * Configuración › Proveedores de IA completa (T3,
 * `docs/testing/2026-11-19-proveedores-ia.md` § 3, P50–P67): bloque Danil
 * arriba, un solo «Agregar cuenta» con su selector, y solo los grupos con
 * cuentas, algo vivo o un fallo de lectura. Monta `dist/` con el motor simulado
 * por proveedor de `ai-providers-fixture.mjs`.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { boot, sleep } from "../helpers/jsdom-app.mjs";
import { cuenta, diferido, motor, waitFor } from "../helpers/ai-providers-fixture.mjs";

const sup = (id, label = id) => ({ id, provider: id, label, catalogo: "todo", usable: true, marca: null, porque: null });
const LABEL = { claude: "Claude Code", codex: "Codex (ChatGPT)", antigravity: "Gemini / Antigravity", grok: "Grok" };

/** Arranca la app con el motor y abre Proveedores de IA. `surfaces` puede ser una función. */
async function abrir(nombre, m, surfaces, extra = {}) {
  m.activo = true;
  // El Router IA gratis es un agente más de `list_providers`, el que no pide nada.
  m.provs["free-router-opencode"] ??= { cuentas: [], label: "Free Router · OpenCode" };
  const proveedores = m.responses.list_providers;
  const list_providers = (args) => proveedores(args).map((p) => ({ ...p, inferencia: p.id.startsWith("free-router") ? "sin_pedir_nada" : "con_cuenta" }));
  const app = await boot("listo", nombre, { ...m.responses, list_providers, list_surfaces: surfaces, ...extra });
  await sleep(600);
  app.w.dispatchEvent(new app.w.CustomEvent("harness:open-settings", { detail: "proveedores-ia" }));
  const panel = await waitFor(() => app.w.document.querySelector("#cfg-panel"), "el panel");
  const doc = app.w.document;
  const s = {
    app, doc, panel, m,
    texto: () => panel.textContent,
    hueco: (id) => panel.querySelector(`[data-provider-slot="${id}"]`),
    seVe: (id) => { const h = s.hueco(id); return !!h && !h.classList.contains("hidden"); },
    vistos: () => [...panel.querySelectorAll("[data-provider-slot]")].filter((h) => !h.classList.contains("hidden")).map((h) => h.dataset.providerSlot),
    disparador: () => panel.querySelector("[data-add-account]"),
    opciones: () => [...doc.querySelectorAll("[data-add-option]")],
    opcion: (id) => doc.querySelector(`[data-add-option="${id}"]`),
    boton: (el, texto) => [...(el?.querySelectorAll("button") ?? [])].find((b) => b.textContent.trim() === texto || b.getAttribute("aria-label") === texto),
    // El de Configuración es el primero; el login va en otro.
    login: () => [...doc.querySelectorAll('[role="dialog"]')].find((d) => !d.querySelector("#cfg-panel")),
    fin: () => { assert.deepEqual(app.failures, []); app.w.close(); },
  };
  return s;
}

async function abrirSelector(s) {
  s.disparador().dispatchEvent(new s.app.w.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
  return waitFor(() => s.opciones().length > 0 && s.opciones(), "el selector");
}
async function elegir(s, id) {
  await abrirSelector(s);
  s.opcion(id).dispatchEvent(new s.app.w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
}

test("P50: with no accounts the Danil block comes first, the screen says so once and offers a single Add account", async () => {
  const m = motor();
  for (const id of ["claude", "codex", "grok"]) m.provs[id] = { cuentas: [] };
  const s = await abrir("p50", m, [sup("claude"), sup("codex"), sup("grok")]);
  await waitFor(() => s.panel.querySelector("[data-no-accounts]"), "sin cuentas");
  const t = s.texto();
  assert.ok(t.indexOf("Danil Credits") < t.indexOf("Router IA gratis"), "Credits, luego el Router");
  assert.ok(t.indexOf("Router IA gratis") < t.indexOf("Todavía no hay cuentas"), "el bloque Danil va arriba");
  assert.equal(s.panel.querySelectorAll("[data-add-account]").length, 1);
  assert.equal([...s.panel.querySelectorAll("button")].filter((b) => b.textContent.includes("Agregar cuenta")).length, 1, "un solo Agregar cuenta");
  assert.deepEqual(s.vistos(), []);
  assert.doesNotMatch(t, /Conectar Claude|Conectar codex|Conectar grok/i);
  s.fin();
});

test("P51: while a provider has not answered there is no 'no accounts' text", async () => {
  const m = motor();
  m.provs.claude = { cuentas: [] };
  m.provs.codex = { cuentas: [] };
  const lenta = diferido();
  m.on.list_accounts = (args) => (args.provider === "claude" ? lenta.promise : { provider: args.provider, env_var: "", shared_credential: null, secret_note: null, active: null, accounts: [] });
  const s = await abrir("p51", m, [sup("claude"), sup("codex")]);
  await waitFor(() => m.de("list_accounts", "codex").length > 0, "codex contesta");
  await sleep(200);
  assert.equal(s.panel.querySelector("[data-no-accounts]"), null, "claude todavía no contestó");
  lenta.resolve({ provider: "claude", env_var: "", shared_credential: null, secret_note: null, active: null, accounts: [] });
  await waitFor(() => s.panel.querySelector("[data-no-accounts]"), "sin cuentas al contestar claude");
  s.fin();
});

test("P52: only providers with accounts show, in list_surfaces order, open, with their name and count", async () => {
  const m = motor();
  m.provs.claude = { cuentas: [1, 2, 3, 4].map((n) => cuenta(`c${n}`)), active: "c1" };
  m.provs.codex = { cuentas: [] };
  m.provs.grok = { cuentas: [cuenta("g1")], active: "g1" };
  const s = await abrir("p52", m, [sup("grok", "Grok"), sup("claude", "Claude Code"), sup("codex", "Codex")]);
  await waitFor(() => s.vistos().length === 2, "dos grupos");
  assert.deepEqual(s.vistos(), ["grok", "claude"]);
  for (const [id, nombre, conteo] of [["grok", "Grok", "1 cuenta"], ["claude", "Claude Code", "4 cuentas"]]) {
    const cabecera = s.hueco(id).querySelector("button[aria-expanded]");
    assert.equal(cabecera.getAttribute("aria-expanded"), "true", `${id} abierto al entrar`);
    assert.ok(cabecera.textContent.includes(nombre) && cabecera.textContent.includes(conteo), cabecera.textContent);
  }
  assert.equal(s.panel.querySelector("[data-no-accounts]"), null);
  s.fin();
});

test("P53: while list_surfaces has not answered the Danil block is up and Add account is disabled with its reason in text", async () => {
  const m = motor();
  const s = await abrir("p53", m, () => new Promise(() => {}));
  assert.ok(s.panel.querySelector('[data-ai-providers="loading"]'));
  assert.ok(s.texto().indexOf("Danil Credits") < s.texto().indexOf("Cargando…"));
  assert.equal(s.disparador().disabled, true);
  assert.ok(s.texto().includes("Podrás agregar una cuenta cuando la máquina diga qué proveedores tiene."));
  s.fin();
});

test("P54: a failed list_surfaces keeps Add account disabled until the retry brings the list", async () => {
  const m = motor();
  m.provs.claude = { cuentas: [cuenta("c1")], active: "c1" };
  let falla = true;
  const s = await abrir("p54", m, () => (falla ? Promise.reject({ what: "Encendiendo…", detail: "machine_starting" }) : [sup("claude", "Claude Code")]));
  await waitFor(() => s.panel.querySelector('[data-ai-providers="failed"]'), "el fallo");
  assert.equal(s.disparador().disabled, true);
  falla = false;
  s.boton(s.panel.querySelector('[data-ai-providers="failed"]'), "Reintentar").click();
  await waitFor(() => s.seVe("claude"), "el grupo tras reintentar");
  assert.equal(s.disparador().disabled, false);
  assert.equal(s.panel.querySelector("[data-ai-providers]"), null);
  s.fin();
});

test("P55: a refresh of list_surfaces that fails keeps the groups painted", async () => {
  const m = motor();
  m.provs.claude = { cuentas: [cuenta("c1")], active: "c1" };
  let falla = false;
  const s = await abrir("p55", m, () => (falla ? Promise.reject({ what: "caída", detail: "io" }) : [sup("claude", "Claude Code")]));
  await waitFor(() => s.seVe("claude"), "el grupo");
  const nodo = s.hueco("claude");
  falla = true;
  s.app.emit("account", { account: "c1", kind: "done", text: "" });
  await sleep(300);
  assert.equal(s.hueco("claude"), nodo);
  assert.ok(s.seVe("claude"));
  assert.equal(s.panel.querySelector('[data-ai-providers="failed"]'), null);
  s.fin();
});

test("P56: with no surfaces the picker offers exactly the agents Danil can install", async () => {
  const m = motor();
  for (const id of Object.keys(LABEL)) m.provs[id] = { cuentas: [] };
  const s = await abrir("p56", m, []);
  assert.ok(s.panel.querySelector('[data-ai-providers="supported"]'));
  const opciones = await abrirSelector(s);
  assert.deepEqual(opciones.map((o) => o.textContent.trim()), Object.values(LABEL));
  assert.doesNotMatch(s.doc.querySelector("[data-add-account-menu]").textContent, /Router IA gratis/);
  s.fin();
});

test("P57: choosing a hidden provider opens its group, adds once and the new account shows with its count", async () => {
  const m = motor();
  m.provs.claude = { cuentas: [cuenta("c1")], active: "c1" };
  m.provs.codex = { cuentas: [] };
  const s = await abrir("p57", m, [sup("claude", "Claude Code"), sup("codex", "Codex")]);
  await waitFor(() => s.seVe("claude") && s.panel.querySelector("[data-provider-slot='codex']"), "claude a la vista");
  assert.equal(s.seVe("codex"), false);
  await elegir(s, "codex");
  await waitFor(() => s.seVe("codex"), "codex aparece");
  await waitFor(() => s.opciones().length === 0, "el selector se cierra");
  assert.equal(s.hueco("codex").querySelector("button[aria-expanded]").getAttribute("aria-expanded"), "true");
  await waitFor(() => m.de("login_account", "codex").length === 1, "login");
  assert.equal(m.de("add_account", "codex").length, 1);
  assert.deepEqual(m.de("add_account", "codex")[0].args, { provider: "codex", label: "" });
  const id = m.de("login_account", "codex")[0].args.id;
  m.publicar("codex", id);
  s.app.emit("account", { account: id, kind: "done", text: "" });
  await waitFor(() => s.hueco("codex").querySelector("[data-account-count]")?.textContent.includes("1 cuenta"), "1 cuenta");
  assert.ok(s.hueco("codex").querySelector("[data-account-grid] > li"), "la tarjeta nueva");
  s.fin();
});

test("P58: a second account of a provider that shares its credential is disabled with its reason as visible text", async () => {
  const m = motor();
  m.provs.antigravity = { cuentas: [cuenta("a1")], active: "a1", shared_credential: "Antigravity guarda una sola sesión en esta computadora." };
  m.provs.claude = { cuentas: [] };
  const s = await abrir("p58", m, [sup("antigravity", "Gemini / Antigravity"), sup("claude", "Claude Code")]);
  await waitFor(() => s.seVe("antigravity"), "el grupo");
  await abrirSelector(s);
  const o = s.opcion("antigravity");
  assert.equal(o.getAttribute("aria-disabled"), "true");
  assert.ok(o.textContent.includes("Antigravity guarda una sola sesión en esta computadora."), o.textContent);
  assert.ok(o.textContent.includes("Para conectar otra cuenta, quita primero la que está."));
  assert.notEqual(s.opcion("claude").getAttribute("aria-disabled"), "true");
  s.fin();
});

test("P59: with a login under way its provider is busy in the picker and another stays available", async () => {
  const m = motor();
  m.provs.claude = { cuentas: [] };
  m.provs.codex = { cuentas: [] };
  const s = await abrir("p59", m, [sup("claude", "Claude Code"), sup("codex", "Codex")]);
  await waitFor(() => s.panel.querySelector("[data-no-accounts]"), "sin cuentas");
  await elegir(s, "claude");
  await waitFor(() => s.login(), "modal del login");
  await abrirSelector(s);
  assert.equal(s.opcion("claude").getAttribute("aria-disabled"), "true");
  assert.ok(s.opcion("claude").textContent.includes("Hay otra conexión a medias"));
  assert.notEqual(s.opcion("codex").getAttribute("aria-disabled"), "true");
  s.fin();
});

test("P60/P61: reordering or dropping providers in list_surfaces keeps the live login, the folded group and each node", async () => {
  const m = motor();
  m.provs.claude = { cuentas: [cuenta("c1")], active: "c1" };
  m.provs.codex = { cuentas: [], label: "Codex" };
  m.provs.grok = { cuentas: [cuenta("g1")], active: "g1" };
  let orden = ["claude", "codex", "grok"];
  const s = await abrir("p60", m, () => orden.map((id) => sup(id, LABEL[id])));
  await waitFor(() => s.seVe("claude") && s.seVe("grok"), "grupos");
  const grok = s.hueco("grok");
  grok.querySelector("button[aria-expanded]").click();
  assert.equal(grok.querySelector("button[aria-expanded]").getAttribute("aria-expanded"), "false");
  await elegir(s, "codex");
  await waitFor(() => s.login(), "modal de codex");
  const codex = s.hueco("codex");
  for (const nuevo of [["grok", "codex"], ["codex", "claude", "grok"]]) {
    orden = nuevo;
    s.app.emit("account", { account: "otra", kind: "url", text: "" });
    await waitFor(() => [...s.panel.querySelectorAll("[data-provider-slot]")].map((h) => h.dataset.providerSlot).join() === nuevo.join(), `orden ${nuevo}`);
    assert.ok(s.login()?.textContent.includes("Codex"), "el modal sigue siendo de codex");
    assert.equal(s.hueco("codex"), codex, "mismo nodo de codex");
    assert.equal(s.hueco("grok"), grok, "mismo nodo de grok");
    assert.equal(grok.querySelector("button[aria-expanded]").getAttribute("aria-expanded"), "false", "grok sigue plegado");
  }
  assert.equal(m.de("cancel_login").length, 0);
  s.fin();
});

test("P62: in a governed workspace this screen has no governance notice and Add account still works; Tools keeps its notice", async () => {
  const m = motor();
  m.provs.codex = { cuentas: [] };
  const governed = { workspace_id: "w", workspace_name: "Equipo", server: "x", mode: "managed", locked: ["models", "mcp_servers"], policy_revision: "1", expires_at: 9999999999, last_ok: 1 };
  const s = await abrir("p62", m, [sup("codex", "Codex")], { radiant_governance_status: { governed, stale: false, notice: null, summary: null } });
  s.app.w.dispatchEvent(new s.app.w.CustomEvent("harness:open-settings", { detail: "operation" }));
  await waitFor(() => s.app.w.document.querySelector("#cfg-panel")?.textContent.includes("Lo administra Danil Teams · workspace Equipo"), "el workspace está gobernado: Tools lo dice");
  s.app.w.dispatchEvent(new s.app.w.CustomEvent("harness:open-settings", { detail: "proveedores-ia" }));
  const panel = await waitFor(() => s.app.w.document.querySelector("[data-add-account]")?.closest("#cfg-panel"), "Proveedores de IA");
  assert.doesNotMatch(panel.textContent, /Lo administra Danil Teams/);
  assert.equal(panel.querySelector("[data-add-account]").disabled, false);
  assert.equal(panel.closest("fieldset[disabled]"), null);
  await elegir(s, "codex");
  await waitFor(() => m.de("add_account", "codex").length === 1, "el alta sale como hoy");
  s.fin();
});

test("P65: the free router row in the Danil block offers to turn it on with today's consent", async () => {
  const m = motor();
  const policy = { workspace_id: "w", version: 3, providers: ["kilo", "vercel", "reflection"], lines: [{ t: "Datos" }], acceptance_ref: "ref", enabled: true, terms: [], accepted: false };
  const gratis = { provider: "free-router-opencode", models: [{ id: "danil-free/reflection/beam-free", label: "Beam", gratis: true, note: null, efforts: [], default_effort: null }], fallback: false };
  const s = await abrir("p65", m, [sup("free-router-opencode", "Free Router · OpenCode")], { machine_list: [{ id: "m1", active: true }], list_models: gratis, workspaces_startup: { workspaces: [{ id: "w", name: "Danil", context_root: null }], active: "w", free_model_policy: policy } });
  const danil = await waitFor(() => s.panel.querySelector('section[aria-label="Danil"]'), "bloque Danil");
  const activar = await waitFor(() => { const b = s.boton(danil, "Activar modelos gratuitos"); return b && !b.disabled && b; }, "la fila del Router con Activar");
  assert.ok(danil.textContent.includes("Router IA gratis"));
  assert.ok(danil.querySelector('[aria-label="Danil Credits"]'), "y la de Credits");
  activar.click();
  const consentimiento = await waitFor(() => s.login(), "el diálogo de consentimiento de hoy");
  assert.ok(s.boton(consentimiento, "Activar") && s.boton(consentimiento, "Cancelar"), consentimiento.textContent);
  assert.equal(s.panel.querySelector('[data-provider-slot="free-router-opencode"]'), null, "el Router no es un grupo");
  s.fin();
});

test("the free router row is named 'Router IA gratis' even when the engine does not declare it, and its list failure sits under that name", async () => {
  const m = motor();
  m.provs.claude = { cuentas: [cuenta("c1")], active: "c1" };
  const base = m.responses.list_providers;
  const sinRouter = (args) => base(args).filter((p) => !p.id.startsWith("free-router"));
  m.on.list_accounts = (args) => (args.provider.startsWith("free-router") ? Promise.reject({ what: "caída", detail: "command" }) : { provider: args.provider, env_var: "", shared_credential: null, secret_note: null, active: "c1", accounts: [cuenta("c1")] });
  const s = await abrir("router-name", m, [sup("claude", "Claude Code")], { list_providers: sinRouter });
  const danil = await waitFor(() => s.panel.querySelector('section[aria-label="Danil"]'), "bloque Danil");
  const fila = await waitFor(() => [...danil.querySelectorAll("div")].find((d) => d.textContent.trim() === "Router IA gratis" && d.closest(".border-b")), "la fila del Router con nombre");
  assert.ok(fila.closest(".border-b").textContent.includes("Comprobar proveedor"), "el nombre va en la fila de su acción");
  const texto = await waitFor(() => danil.textContent.includes("No se pudieron leer las cuentas.") && danil.textContent, "el fallo del Router");
  assert.ok(texto.indexOf("Router IA gratis") < texto.indexOf("No se pudieron leer las cuentas."), "el fallo va bajo el nombre");
  s.fin();
});

test("P38/P39: removing the last account hides the group, even with tasks waiting, and focus returns to Add account", async () => {
  const m = motor();
  m.provs.claude = { cuentas: [cuenta("c1")], active: "c1", espera: [{ id: "t1" }] };
  m.provs.codex = { cuentas: [cuenta("x1")], active: "x1" };
  const s = await abrir("p39", m, [sup("claude", "Claude Code"), sup("codex", "Codex")]);
  await waitFor(() => s.seVe("claude"), "claude");
  const hueco = s.hueco("claude");
  const mas = await waitFor(() => [...hueco.querySelectorAll("button")].find((b) => b.getAttribute("aria-label")?.startsWith("Más acciones")), "Más acciones");
  mas.focus(); // Como con el ratón: el menú devuelve el foco a su disparador.
  mas.dispatchEvent(new s.app.w.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
  const item = await waitFor(() => [...s.doc.querySelectorAll('[role="menuitem"]')].find((e) => e.textContent.trim() === "Quitar esta cuenta"), "Quitar");
  item.dispatchEvent(new s.app.w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  // jsdom no anima: sin `animationend` el menú cerrado sigue montado y su foco de salida llega tarde.
  s.doc.querySelector('[role="menu"]')?.dispatchEvent(new s.app.w.Event("animationend", { bubbles: true }));
  await waitFor(() => !s.doc.querySelector('[role="menu"]'), "el menú se desmonta");
  const si = await waitFor(() => s.boton(hueco, "Sí, quitar"), "Sí, quitar");
  si.focus();
  si.click();
  await waitFor(() => !s.seVe("claude"), "el grupo se va");
  assert.equal(m.de("remove_account", "claude").length, 1);
  assert.ok(s.seVe("codex"));
  await waitFor(() => s.doc.activeElement === s.disparador(), "el foco en Agregar cuenta");
  assert.doesNotMatch(s.panel.textContent.replace(hueco.textContent, ""), /en espera|Reponer|sin cupo/);
  s.fin();
});

test("S6: a provider whose account list failed shows the failure with a retry that reads it again", async () => {
  const m = motor();
  m.provs.claude = { cuentas: [cuenta("c1")], active: "c1" };
  let falla = true;
  m.on.list_accounts = (args) => (falla ? Promise.reject({ what: "caída", detail: "command" }) : { provider: args.provider, env_var: "", shared_credential: null, secret_note: null, active: "c1", accounts: [cuenta("c1")] });
  const s = await abrir("s6", m, [sup("claude", "Claude Code")]);
  await waitFor(() => s.seVe("claude") && s.texto().includes("No se pudieron leer las cuentas."), "el fallo a la vista");
  falla = false;
  s.boton(s.hueco("claude"), "Reintentar").click();
  await waitFor(() => s.hueco("claude").querySelector("[data-account-grid] > li"), "la cuenta tras reintentar");
  assert.ok(!s.hueco("claude").textContent.includes("No se pudieron leer las cuentas."));
  s.fin();
});

test("P67: closing Configuration with a login open does not call cancel_login, as today", async () => {
  const m = motor();
  m.provs.codex = { cuentas: [] };
  const s = await abrir("p67", m, [sup("codex", "Codex")]);
  await waitFor(() => s.panel.querySelector("[data-no-accounts]"), "sin cuentas");
  await elegir(s, "codex");
  await waitFor(() => s.login(), "modal");
  const cerrar = [...s.doc.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === "Cerrar configuración (Esc)");
  cerrar.click();
  await waitFor(() => !s.doc.querySelector("#cfg-panel"), "Configuración cerrada");
  // Medido: `Accounts` no cancela al desmontarse; el motor cierra el login a medias (§ 9 de ingeniería).
  await sleep(300);
  assert.equal(m.de("cancel_login").length, 0);
  s.fin();
});
