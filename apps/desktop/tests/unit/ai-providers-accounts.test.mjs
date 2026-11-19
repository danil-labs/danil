/**
 * `Accounts` para Configuración › Proveedores de IA (T2,
 * `docs/testing/2026-11-19-proveedores-ia.md` § 2): cada instancia avisa
 * cuántas cuentas pinta, si hay algo vivo y por qué no deja agregar; el selector
 * usa el mismo `agregar()`; ocultar, plegar o reordenar no desmonta nada, y la
 * cabecera dice el conteo abierta y plegada. Monta los grupos sobre `dist/`.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { sleep } from "../helpers/jsdom-app.mjs";
import { compilar, cuenta, diferido, montar, motor, waitFor } from "../helpers/ai-providers-fixture.mjs";

let fixture;
test.before(async () => { fixture = await compilar(); });
test.after(() => fixture?.limpiar());

const RESET = Date.now() + 3 * 3_600_000;
const conteo = (s, id) => s.grupo(id)?.querySelector("[data-account-count]")?.textContent ?? null;
const tarjetas = (s, id) => s.grupo(id)?.querySelectorAll("[data-account-grid] > li").length ?? 0;
// La cabecera es el botón que pliega; su texto también lleva el conteo.
const cabecera = (s, id) => s.grupo(id).querySelector("button[aria-expanded]");
// Un `detail: "io"` lo reintenta `lib/invoke.ts` durante segundos; esto es un fallo que no se repite.
const ILEGIBLE = { what: "lectura", detail: "disco ilegible" };
const sinFallos = (s) => { assert.deepEqual(s.app.failures, []); s.cerrar(); };

test("P20: the header counts the painted cards, not one per machine, open and collapsed", async () => {
  const m = motor();
  // Con la cuenta Danil cada cuenta trae sus máquinas; c1 está en dos.
  const en = (id, ...machines) => cuenta(id, { credential_group: "pro", machines: machines.map((machine, i) => ({ machine, id: i ? `${id}-${machine}` : id, on: true })) });
  m.provs.claude = { cuentas: [en("c1", "m1", "m2"), en("c2", "m1"), en("c3", "m1"), en("c4", "m2")], active: "c1" };
  const s = await montar(fixture, "p20", m, ["claude"]);
  await waitFor(() => tarjetas(s, "claude") === 4, "4 tarjetas");
  assert.equal(conteo(s, "claude"), "· 4 cuentas");
  assert.equal(s.g.ultimo("claude").cuentas, 4);
  // Cada celda lleva su tarjeta y lo que cuelga de ella, no hermanos sueltos.
  for (const li of s.grupo("claude").querySelectorAll("[data-account-grid] > li")) assert.ok(li.firstElementChild, "celda vacía");
  cabecera(s, "claude").click();
  await sleep(30);
  assert.equal(cabecera(s, "claude").getAttribute("aria-expanded"), "false");
  assert.equal(conteo(s, "claude"), "· 4 cuentas", "plegada también");
  sinFallos(s);
});

test("P21: each window of account_limits paints its progress bar with what is left and when it resets", async () => {
  const m = motor();
  m.provs.claude = { cuentas: [cuenta("c1")], active: "c1", limites: { c1: [{ label: "últimas 5 horas", used_pct: 40, resets_at: RESET }, { label: "esta semana", used_pct: 40, resets_at: RESET }] } };
  const s = await montar(fixture, "p21", m, ["claude"]);
  const barras = await waitFor(() => { const b = s.grupo("claude").querySelectorAll('[role="progressbar"]'); return b.length === 2 && b; }, "dos barras");
  for (const b of barras) {
    assert.equal(b.getAttribute("aria-valuenow"), "60");
    assert.match(b.getAttribute("aria-label") ?? "", /60/);
  }
  assert.match(s.texto("claude"), /60 %|60%/);
  assert.match(s.texto("claude"), /3 h/);
  sinFallos(s);
});

const PORQUE = "Antigravity guarda una sola sesión en esta computadora.";
const celda = (s, id, quien) => [...(s.grupo(id)?.querySelectorAll("[data-account-grid] > li") ?? [])].find((li) => li.textContent.includes(quien));
const botones = (el) => [...(el?.querySelectorAll("button") ?? [])].map((b) => b.textContent.trim() || b.getAttribute("aria-label"));

test("P22: a dropped account and an unverified one still count; one offers Reconnect, the other Retry and Reconnect", async () => {
  const m = motor();
  m.provs.claude = { limits: false, cuentas: [cuenta("c1"), cuenta("c2")], active: "c1", status: { c1: { id: "c1", authenticated: false, detail: "" } } };
  m.on.account_status = ({ id }) => id === "c2" ? Promise.reject({ what: "plazo", detail: "timeout" }) : { id, authenticated: false, detail: "" };
  const s = await montar(fixture, "p22", m, ["claude"]);
  await waitFor(() => botones(celda(s, "claude", "c2@")).includes("Reintentar"), "c2 con Reintentar");
  assert.equal(s.g.ultimo("claude").cuentas, 2);
  const c1 = botones(celda(s, "claude", "c1@"));
  assert.ok(c1.includes("Reconectar") && !c1.includes("Reintentar"), c1.join("|"));
  assert.ok(botones(celda(s, "claude", "c2@")).includes("Reconectar"));
  sinFallos(s);
});

test("P23: account-rejected asks that account again and its card turns to Reconnect, still counted", async () => {
  const m = motor();
  m.provs.claude = { limits: false, cuentas: [cuenta("c1")], active: "c1" };
  const s = await montar(fixture, "p23", m, ["claude"]);
  await waitFor(() => m.de("account_status").length === 1, "primera comprobación");
  m.provs.claude.status = { c1: { id: "c1", authenticated: false, detail: "" } };
  s.app.emit("account-rejected", "c1");
  await waitFor(() => botones(celda(s, "claude", "c1@")).includes("Reconectar"), "Reconectar");
  assert.equal(m.de("account_status").length, 2);
  assert.equal(s.g.ultimo("claude").cuentas, 1);
  sinFallos(s);
});

test("P24: list_accounts failing on entry is unknown, not zero, and says why", async () => {
  const m = motor();
  m.provs.claude = { cuentas: [] };
  m.on.list_accounts = () => Promise.reject(ILEGIBLE);
  const s = await montar(fixture, "p24", m, ["claude"]);
  await waitFor(() => s.g.ultimo("claude")?.falloDeLectura, "falloDeLectura");
  assert.equal(s.g.ultimo("claude").cuentas, null);
  assert.ok(s.texto("claude").includes("No se pudieron leer las cuentas."), s.texto("claude"));
  assert.ok(s.texto("claude").includes("disco ilegible"));
  assert.ok(!/sin cuentas/i.test(s.texto("claude")), "no dice «sin cuentas»");
  assert.ok(!s.texto("claude").includes("Conectar claude"), "no ofrece la primera cuenta como si hubiera 0");
  sinFallos(s);
});

test("P25: a later list_accounts failure with cards painted reports a read failure, not an empty group", async () => {
  const m = motor();
  m.provs.claude = { cuentas: [cuenta("c1"), cuenta("c2")], active: "c1" };
  const s = await montar(fixture, "p25", m, ["claude"]);
  await waitFor(() => tarjetas(s, "claude") === 2, "2 tarjetas");
  m.on.list_accounts = () => Promise.reject(ILEGIBLE);
  [...celda(s, "claude", "c2@").querySelectorAll("button")].find((b) => b.textContent.trim() === "Usar esta").click();
  await waitFor(() => s.g.ultimo("claude")?.falloDeLectura, "falloDeLectura");
  assert.equal(s.g.ultimo("claude").cuentas, null);
  assert.ok(s.texto("claude").includes("No se pudieron leer las cuentas."));
  sinFallos(s);
});

test("P26: the picker's control is the same add: alive before add_account answers, with the same arguments as the button", async () => {
  const m = motor();
  m.provs.codex = { cuentas: [] };
  const pausa = diferido();
  m.on.add_account = () => pausa.promise;
  const s = await montar(fixture, "p26", m, ["codex"], { sinAgregar: true });
  await waitFor(() => s.g.ultimo("codex")?.cuentas === 0, "0 cuentas");
  assert.deepEqual(s.g.ultimo("codex"), { cuentas: 0, vivo: false, bloqueoAlta: null, falloDeLectura: false });
  assert.equal(botones(s.grupo("codex")).filter((b) => b === "+ Agregar cuenta").length, 0, "sinAgregar: sin botón propio");
  s.g.agregar("codex");
  await sleep(0);
  assert.equal(s.g.ultimo("codex").vivo, true, "vivo antes de que conteste");
  assert.deepEqual(s.g.ultimo("codex").bloqueoAlta, { k: "ocupado" });
  assert.deepEqual(m.de("add_account").map((c) => c.args), [{ provider: "codex", label: "" }]);
  pausa.resolve({ id: "x1", label: "", created_at: 1, identity: null, authenticated_at: null });
  await waitFor(() => m.de("login_account").length === 1, "login_account");
  sinFallos(s);
});

test("P27: two picks in a row create one account", async () => {
  const m = motor();
  m.provs.codex = { cuentas: [] };
  const pausa = diferido();
  m.on.add_account = () => pausa.promise;
  const s = await montar(fixture, "p27", m, ["codex"]);
  await waitFor(() => s.g.ultimo("codex")?.cuentas === 0, "0 cuentas");
  s.g.agregar("codex");
  s.g.agregar("codex");
  await sleep(50);
  assert.equal(m.de("add_account").length, 1);
  pausa.resolve({ id: "x1", label: "", created_at: 1, identity: null, authenticated_at: null });
  await waitFor(() => m.de("login_account").length === 1, "login_account");
  s.g.agregar("codex");
  await sleep(50);
  assert.equal(m.de("add_account").length, 1, "con el login en curso tampoco");
  sinFallos(s);
});

test("P28: add_account rejected keeps the group alive with the error, and adding is available again", async () => {
  const m = motor();
  m.provs.codex = { cuentas: [] };
  m.on.add_account = () => Promise.reject({ what: "red", detail: "ECONNRESET" });
  const s = await montar(fixture, "p28", m, ["codex"]);
  await waitFor(() => s.g.ultimo("codex")?.cuentas === 0, "0 cuentas");
  s.g.agregar("codex");
  await waitFor(() => s.texto("codex").includes("No se pudo crear la cuenta."), "error.create");
  assert.equal(s.g.ultimo("codex").vivo, true);
  assert.equal(s.g.ultimo("codex").bloqueoAlta, null);
  sinFallos(s);
});

test("P33: with one account sharing its credential there is no own button, the reason shows, and the control does not add", async () => {
  const m = motor();
  m.provs.antigravity = { shared_credential: PORQUE, cuentas: [cuenta("a1")], active: "a1" };
  const s = await montar(fixture, "p33", m, ["antigravity"], { sinAgregar: true });
  await waitFor(() => s.g.ultimo("antigravity")?.cuentas === 1, "1 cuenta");
  assert.deepEqual(s.g.ultimo("antigravity").bloqueoAlta, { k: "segunda", porque: PORQUE });
  assert.ok(!botones(s.grupo("antigravity")).includes("+ Agregar cuenta"));
  assert.ok(s.grupo("antigravity").querySelector("[data-shared-credential]").textContent.includes(PORQUE));
  s.g.agregar("antigravity");
  await sleep(50);
  assert.equal(m.de("add_account").length, 0, "agregar() revisa la segunda cuenta");
  sinFallos(s);
});

test("the add block has one order: busy before second account before external install", async () => {
  const m = motor();
  m.provs.antigravity = { limits: false, shared_credential: PORQUE, external: "https://antigravity.example/descarga", available: false, cuentas: [cuenta("a1")], active: "a1", status: { a1: { id: "a1", authenticated: false, detail: "" } } };
  const s = await montar(fixture, "orden", m, ["antigravity"]);
  await waitFor(() => s.g.ultimo("antigravity")?.cuentas === 1, "1 cuenta");
  assert.deepEqual(s.g.ultimo("antigravity").bloqueoAlta, { k: "segunda", porque: PORQUE }, "segunda > externo");
  m.provs.antigravity.available = true;
  s.app.emit("providers", null);
  await waitFor(() => !s.texto("antigravity").includes("oficial"), "instalado");
  [...celda(s, "antigravity", "a1@").querySelectorAll("button")].find((b) => b.textContent.trim() === "Reconectar").click();
  await waitFor(() => s.g.ultimo("antigravity").bloqueoAlta?.k === "ocupado", "ocupado > segunda");
  m.provs.antigravity.available = false;
  s.app.emit("providers", null);
  await waitFor(() => m.de("list_providers").length >= 3, "list_providers releído");
  await sleep(50);
  assert.deepEqual(s.g.ultimo("antigravity").bloqueoAlta, { k: "ocupado" }, "ocupado > externo");
  sinFallos(s);
});

test("P48: in the row variant the active card keeps More actions with Remove, an inactive one Use, a dropped one Reconnect", async () => {
  const m = motor();
  m.provs.claude = { limits: false, cuentas: [cuenta("c1"), cuenta("c2"), cuenta("c3")], active: "c1", status: { c3: { id: "c3", authenticated: false, detail: "" } } };
  const s = await montar(fixture, "p48", m, ["claude"]);
  await waitFor(() => botones(celda(s, "claude", "c3@")).includes("Reconectar"), "c3 caída");
  assert.ok(botones(celda(s, "claude", "c2@")).includes("Usar esta"));
  assert.ok(!botones(celda(s, "claude", "c1@")).includes("Usar esta"));
  const mas = [...celda(s, "claude", "c1@").querySelectorAll("button")].find((b) => b.getAttribute("aria-label")?.startsWith("Más acciones"));
  mas.dispatchEvent(new s.app.w.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
  const quitar = await waitFor(() => [...s.app.w.document.querySelectorAll('[role="menuitem"]')].find((e) => e.textContent.trim() === "Quitar esta cuenta"), "Quitar en el menú");
  quitar.dispatchEvent(new s.app.w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await waitFor(() => botones(celda(s, "claude", "c1@")).includes("Sí, quitar"), "confirmación");
  sinFallos(s);
});

// § 6 (LIM-1, LIM-2): el escalón de `account_limits` sigue por proveedor y nada del grupo lo repite.
test("P42/P43: one account_limits per account, inactive ones of a provider 200 ms apart, and no gesture asks again", async () => {
  const m = motor();
  m.provs.claude = { cuentas: ["c1", "c2", "c3", "c4"].map((id) => cuenta(id)), active: "c1" };
  m.provs.codex = { cuentas: ["k1", "k2", "k3"].map((id) => cuenta(id)), active: "k1" };
  const s = await montar(fixture, "p42", m, ["claude", "codex"]);
  await waitFor(() => m.de("account_limits").length === 7, "7 lecturas", 5000);
  for (const [prov, activa, inactivas] of [["claude", "c1", ["c2", "c3", "c4"]], ["codex", "k1", ["k2", "k3"]]]) {
    const ll = m.de("account_limits", prov);
    assert.deepEqual(ll.map((c) => c.args.id).sort(), [activa, ...inactivas].sort(), `${prov}: una por cuenta`);
    const t = ll.filter((c) => c.args.id !== activa).map((c) => c.t).sort((a, b) => a - b);
    for (let i = 1; i < t.length; i++) assert.ok(t[i] - t[i - 1] >= 150, `${prov}: ${t[i] - t[i - 1]} ms entre inactivas`);
  }
  cabecera(s, "claude").click(); await sleep(20);
  cabecera(s, "claude").click(); await sleep(20);
  const nodo = s.cuerpo("codex");
  s.g.ocultar("codex", true); await sleep(20);
  s.g.ocultar("codex", false);
  s.g.reordenar(["codex", "claude"]); await sleep(20);
  s.g.reordenar(["claude", "codex"]);
  await sleep(1000);
  assert.equal(m.de("account_limits").length, 7, "plegar, ocultar y reordenar no vuelven a preguntar");
  assert.equal(s.cuerpo("codex"), nodo, "el cuerpo del grupo es el mismo nodo");
  sinFallos(s);
});
