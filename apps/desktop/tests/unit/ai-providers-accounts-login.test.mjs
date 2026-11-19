/**
 * Las altas y logins de un grupo de Proveedores de IA (T2,
 * `docs/testing/2026-11-19-proveedores-ia.md` § 2): mientras hay algo que la
 * persona tiene que ver (alta, instalación, fallo del alta o del login)
 * el grupo avisa `vivo`, y plegarlo, ocultarlo o reordenarlo no corta el login.
 * Monta los grupos sobre `dist/`.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { sleep } from "../helpers/jsdom-app.mjs";
import { compilar, cuenta, diferido, montar, motor, waitFor } from "../helpers/ai-providers-fixture.mjs";

let fixture;
test.before(async () => { fixture = await compilar(); });
test.after(() => fixture?.limpiar());

const dialogo = (s) => s.app.w.document.querySelector('[role="dialog"]');
const enDialogo = (s, texto) => [...(dialogo(s)?.querySelectorAll("button") ?? [])].find((b) => b.textContent.trim() === texto);
const boton = (el, texto) => [...(el?.querySelectorAll("button") ?? [])].find((b) => b.textContent.trim() === texto || b.getAttribute("aria-label") === texto);
const cabecera = (s, id) => s.grupo(id).querySelector("button[aria-expanded]");
const vivo = (s, id) => s.g.ultimo(id)?.vivo;
const sinFallos = (s) => { assert.deepEqual(s.app.failures, []); s.cerrar(); };

/** Pide el alta con el control y espera el modal del login. Devuelve el id de la cuenta a medias. */
async function altaConModal(s, m, id) {
  await waitFor(() => s.g.ultimo(id)?.cuentas === 0, "0 cuentas");
  s.g.agregar(id);
  await waitFor(() => m.de("login_account").length === 1 && dialogo(s), "modal del login");
  return m.de("add_account")[0] && m.provs[id].cuentas.at(-1).id;
}

test("P29: a login that ends badly keeps the panel with its output, Retry and Terminal, and discards the half account once", async () => {
  const m = motor();
  m.provs.codex = { cuentas: [] };
  const s = await montar(fixture, "p29", m, ["codex"]);
  const id = await altaConModal(s, m, "codex");
  s.app.emit("account", { account: id, kind: "done", text: "login failed: 1" });
  await waitFor(() => m.de("discard_account").length === 1, "discard_account");
  await waitFor(() => s.texto("codex").includes("login failed: 1"), "salida del login");
  assert.ok(boton(s.grupo("codex"), "Reintentar") && boton(s.grupo("codex"), "Abrir en la Terminal"));
  assert.equal(s.g.ultimo("codex").cuentas, 0);
  assert.equal(vivo(s, "codex"), true, "con 0 cuentas el grupo sigue vivo");
  sinFallos(s);
});

test("P47: Open in Terminal from the failure panel starts the login in terminal mode", async () => {
  const m = motor();
  m.provs.codex = { cuentas: [] };
  const s = await montar(fixture, "p47", m, ["codex"]);
  const id = await altaConModal(s, m, "codex");
  s.app.emit("account", { account: id, kind: "done", text: "login failed: 1" });
  (await waitFor(() => boton(s.grupo("codex"), "Abrir en la Terminal"), "Terminal")).click();
  await waitFor(() => m.de("login_account").length === 2, "segundo login");
  assert.deepEqual(m.de("login_account")[1].args, { provider: "codex", id, mode: "terminal" });
  sinFallos(s);
});

test("P30: install_provider failing keeps the group alive with the install failure", async () => {
  const m = motor();
  m.provs.grok = { cuentas: [], available: false };
  m.on.install_provider = () => Promise.reject({ what: "disco", detail: "ENOSPC" });
  const s = await montar(fixture, "p30", m, ["grok"]);
  await waitFor(() => s.g.ultimo("grok")?.cuentas === 0, "0 cuentas");
  s.g.agregar("grok");
  await waitFor(() => m.de("install_provider").length === 1, "install_provider");
  await waitFor(() => /No se pudo instalar|espacio/i.test(s.texto("grok")), "fallo de instalación");
  assert.equal(vivo(s, "grok"), true);
  sinFallos(s);
});

test("P31: while the CLI installs the group is alive and says so; when it lands the login starts", async () => {
  const m = motor();
  m.provs.grok = { cuentas: [], available: false };
  const pausa = diferido();
  m.on.install_provider = () => pausa.promise;
  const s = await montar(fixture, "p31", m, ["grok"]);
  await waitFor(() => s.g.ultimo("grok")?.cuentas === 0, "0 cuentas");
  s.g.agregar("grok");
  await waitFor(() => m.de("install_provider").length === 1, "install_provider");
  assert.equal(vivo(s, "grok"), true);
  assert.ok(s.app.w.document.body.textContent.includes("Instalando grok…"));
  assert.equal(m.de("login_account").length, 0);
  m.provs.grok.available = true;
  pausa.resolve(null);
  await waitFor(() => m.de("login_account").length === 1, "login_account");
  sinFallos(s);
});

test("P32: an external download is not an add: the control adds nothing and the group offers the download and the check", async () => {
  const m = motor();
  m.provs.zcode = { cuentas: [], available: false, external: "https://zcode.example/descarga" };
  const s = await montar(fixture, "p32", m, ["zcode"]);
  await waitFor(() => s.g.ultimo("zcode")?.cuentas === 0, "0 cuentas");
  assert.deepEqual(s.g.ultimo("zcode").bloqueoAlta, { k: "externo" });
  assert.equal(vivo(s, "zcode"), false);
  s.g.agregar("zcode");
  await sleep(50);
  assert.equal(m.de("add_account").length, 0);
  assert.ok(boton(s.grupo("zcode"), "Descargar zcode oficial") && boton(s.grupo("zcode"), "Ya la instalé · Comprobar"));
  boton(s.grupo("zcode"), "Descargar zcode oficial").click();
  await waitFor(() => vivo(s, "zcode"), "vivo hasta «Ya la instalé»");
  assert.deepEqual(m.de("open_external").map((c) => c.args), [{ target: "https://zcode.example/descarga" }]);
  sinFallos(s);
});

test("P34: collapsing the group with the login open keeps the modal, cancels nothing and keeps the node", async () => {
  const m = motor();
  m.provs.claude = { cuentas: [] };
  const s = await montar(fixture, "p34", m, ["claude"]);
  await altaConModal(s, m, "claude");
  const nodo = s.grupo("claude");
  cabecera(s, "claude").click();
  await sleep(50);
  assert.equal(cabecera(s, "claude").getAttribute("aria-expanded"), "false");
  assert.ok(dialogo(s), "el modal sigue");
  assert.equal(m.de("cancel_login").length, 0);
  assert.equal(s.grupo("claude"), nodo);
  sinFallos(s);
});

for (const antes of [true, false]) {
  test(`P35: hiding and reordering while add_account is pending does not cut the login (answer ${antes ? "before" : "after"} the change)`, async () => {
    const m = motor();
    m.provs.claude = { cuentas: [cuenta("c1")], active: "c1" };
    m.provs.codex = { cuentas: [] };
    const pausa = diferido();
    m.on.add_account = (args) => pausa.promise.then(() => { m.on.add_account = undefined; return m.responses.add_account(args); });
    const s = await montar(fixture, `p35-${antes}`, m, ["claude", "codex"]);
    await waitFor(() => s.g.ultimo("codex")?.cuentas === 0, "0 cuentas");
    const nodo = s.grupo("codex");
    s.g.agregar("codex");
    if (antes) pausa.resolve();
    s.g.ocultar("codex", true);
    s.g.reordenar(["codex", "claude"]);
    if (!antes) pausa.resolve();
    await waitFor(() => m.de("login_account", "codex").length === 1 && dialogo(s), "login y modal");
    assert.equal(m.de("cancel_login").length, 0);
    assert.equal(s.grupo("codex"), nodo, "mismo nodo");
    assert.ok(dialogo(s).textContent.includes("codex"), "el modal es del mismo proveedor");
    sinFallos(s);
  });
}

test("P36: cancel in the modal sends one cancel_login with the id and closes it; nothing is left alive", async () => {
  const m = motor();
  m.provs.claude = { cuentas: [] };
  const s = await montar(fixture, "p36", m, ["claude"]);
  const id = await altaConModal(s, m, "claude");
  enDialogo(s, "cancelar").click();
  await waitFor(() => !dialogo(s), "modal cerrado");
  assert.deepEqual(m.de("cancel_login").map((c) => c.args), [{ id }]);
  await waitFor(() => vivo(s, "claude") === false, "nada vivo");
  assert.equal(s.g.ultimo("claude").cuentas, 0);
  sinFallos(s);
});

test("P37: cancelling the key prompt discards the half account once and leaves the provider with nothing alive", async () => {
  const m = motor();
  m.provs.deepseek = { cuentas: [], api_key: "https://deepseek.example/keys" };
  const s = await montar(fixture, "p37", m, ["deepseek"]);
  await waitFor(() => s.g.ultimo("deepseek")?.cuentas === 0, "0 cuentas");
  s.g.agregar("deepseek");
  await waitFor(() => enDialogo(s, "cancelar"), "pide la clave");
  enDialogo(s, "cancelar").click();
  await waitFor(() => m.de("discard_account").length === 1, "discard_account");
  await waitFor(() => vivo(s, "deepseek") === false && s.g.ultimo("deepseek").cuentas === 0, "0 cuentas y nada vivo");
  sinFallos(s);
});

async function quitarCuenta(s, quien) {
  const li = () => [...s.root.querySelectorAll("[data-account-grid] > li")].find((x) => x.textContent.includes(quien));
  boton(li(), `Más acciones de ${quien}`).dispatchEvent(new s.app.w.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
  const item = await waitFor(() => [...s.app.w.document.querySelectorAll('[role="menuitem"]')].find((e) => e.textContent.trim() === "Quitar esta cuenta"), "Quitar");
  item.dispatchEvent(new s.app.w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  return waitFor(() => boton(li(), "Sí, quitar"), "Sí, quitar");
}

test("P38: removing the only account leaves the provider at 0 with nothing alive (the focus waits for Q1)", async () => {
  const m = motor();
  m.provs.claude = { cuentas: [cuenta("c1")], active: "c1" };
  const s = await montar(fixture, "p38", m, ["claude"]);
  await waitFor(() => s.g.ultimo("claude")?.cuentas === 1, "1 cuenta");
  (await quitarCuenta(s, "c1@ejemplo.test")).click();
  await waitFor(() => s.g.ultimo("claude").cuentas === 0, "0 cuentas");
  assert.equal(m.de("remove_account").length, 1);
  assert.equal(vivo(s, "claude"), false);
  sinFallos(s);
});

// Decisión de Alberto (2026-11-19): las tareas en espera no sostienen un grupo sin cuentas.
test("P39: removing the last account leaves the provider with nothing alive even with tasks waiting for quota", async () => {
  const m = motor();
  m.provs.claude = { cuentas: [cuenta("c1")], active: "c1", espera: [{ project: "p", session: "t1", title: "T1", account: "c1" }] };
  const s = await montar(fixture, "p39", m, ["claude"]);
  await waitFor(() => s.g.ultimo("claude")?.cuentas === 1 && s.texto("claude").includes("1 tarea se quedó sin cupo"), "1 cuenta y la espera");
  (await quitarCuenta(s, "c1@ejemplo.test")).click();
  await waitFor(() => s.g.ultimo("claude").cuentas === 0, "0 cuentas");
  assert.equal(vivo(s, "claude"), false, "la espera no mantiene el grupo");
  sinFallos(s);
});

test("P40: the first remove click only asks; the second removes and the header says 2 accounts", async () => {
  const m = motor();
  m.provs.claude = { cuentas: [cuenta("c1"), cuenta("c2"), cuenta("c3")], active: "c1" };
  const s = await montar(fixture, "p40", m, ["claude"]);
  await waitFor(() => s.g.ultimo("claude")?.cuentas === 3, "3 cuentas");
  const si = await quitarCuenta(s, "c2@ejemplo.test");
  assert.ok(boton(si.parentElement, "Conservar"));
  assert.equal(m.de("remove_account").length, 0);
  assert.equal(s.g.ultimo("claude").cuentas, 3);
  si.click();
  await waitFor(() => s.g.ultimo("claude").cuentas === 2, "2 cuentas");
  assert.equal(s.grupo("claude").querySelector("[data-account-count]").textContent, "· 2 cuentas");
  sinFallos(s);
});

test("P41: with accounts, Resume sends one resume_awaiting_quota and says how many resumed", async () => {
  const m = motor();
  m.provs.claude = { cuentas: [cuenta("c1")], active: "c1", espera: [{ project: "p", session: "t1", title: "T1", account: null }, { project: "p", session: "t2", title: "T2", account: null }] };
  const s = await montar(fixture, "p41", m, ["claude"]);
  (await waitFor(() => boton(s.grupo("claude"), "reanudarlas"), "Reanudar")).click();
  await waitFor(() => s.texto("claude").includes("Se reanudaron 2 tareas."), "repuestas");
  assert.equal(m.de("resume_awaiting_quota").length, 1);
  assert.equal(vivo(s, "claude"), false, "reanudar no es algo vivo");
  assert.equal(s.g.ultimo("claude").cuentas, 1);
  sinFallos(s);
});

test("P46: the modal follows url, confirm and code events of its own login", async () => {
  const m = motor();
  m.provs.claude = { cuentas: [] };
  const s = await montar(fixture, "p46", m, ["claude"]);
  const id = await altaConModal(s, m, "claude");
  s.app.emit("account", { account: id, kind: "url", text: "https://claude.example/login" });
  s.app.emit("account", { account: id, kind: "confirm", text: "ABCD-1234" });
  s.app.emit("account", { account: id, kind: "code", text: "" });
  await waitFor(() => dialogo(s).querySelector("input"), "campo del código");
  assert.ok(dialogo(s).textContent.includes("ABCD-1234"));
  assert.deepEqual(m.de("open_external").map((c) => c.args), [{ target: "https://claude.example/login" }]);
  const input = dialogo(s).querySelector("input");
  input.value = "codigo-123";
  input.dispatchEvent(new s.app.w.InputEvent("input", { bubbles: true }));
  (await waitFor(() => { const b = enDialogo(s, "Enviar el código"); return b && !b.disabled && b; }, "Enviar habilitado")).click();
  await waitFor(() => m.de("submit_login_code").length === 1, "submit_login_code");
  assert.deepEqual(m.de("submit_login_code")[0].args, { id, code: "codigo-123" });
  sinFallos(s);
});
