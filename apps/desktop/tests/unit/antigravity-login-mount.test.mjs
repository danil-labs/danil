/**
 * Antigravity (`agy_acp_server.par`) loopback OAuth login in cloud / Web:
 * 1. Engine emits `url` with `redirect_uri=http://127.0.0.1:<port>/`, `notice`, and `code` (`""`).
 * 2. Dialog renders clear instructions explaining the browser's connection error page is expected
 *    and asks the user to paste the full address-bar URL (`http://127.0.0.1:…`), NOT the confusing
 *    "Pega el código que te muestra la página" copy, with no focus rings.
 * 3. `submit_login_code` routes to the cloud machine via `machineOf(id)` (`x-terminus-machine`).
 * 4. Concrete engine errors (e.g. incomplete/expired URL) render inline inside the modal without
 *    closing it or losing the user's input, and correcting + resubmitting succeeds cleanly.
 * 5. Non-loopback code flows keep the standard code copy and button label.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { sleep } from "../helpers/jsdom-app.mjs";
import { cerrarTodo, compilar, cuenta, diferido, montar, motor, waitFor } from "../helpers/ai-providers-fixture.mjs";

let fixture;
test.before(async () => { fixture = await compilar(); });
test.afterEach(cerrarTodo);
test.after(() => fixture?.limpiar());

const AG_LOOPBACK_URL =
  "https://accounts.google.com/o/oauth2/v2/auth?client_id=test-client&redirect_uri=http%3A%2F%2F127.0.0.1%3A41234%2F&response_type=code&scope=openid&state=st1";

const CLAUDE_CODE_URL =
  "https://claude.ai/oauth/authorize?client_id=test-client&redirect_uri=https%3A%2F%2Fconsole.anthropic.com%2Foauth%2Fcode%2Fcallback&response_type=code";

test("antigravity loopback OAuth login shows address-bar URL copy, routes via machineOf, and handles inline errors", async () => {
  const m = motor();
  m.provs.antigravity = { cuentas: [], label: "Antigravity" };
  m.on.add_account = ({ provider }) => {
    const a = cuenta(`cmp_cloud~${provider}-1`, { identity: null, authenticated_at: null, pendiente: true });
    m.provs[provider].cuentas.push(a);
    return structuredClone(a);
  };
  const machineOf = (id) => {
    const sep = id?.indexOf("~") ?? -1;
    return sep > 0 ? { headers: { "x-terminus-machine": id.slice(0, sep) } } : undefined;
  };

  const s = await montar(fixture, "ag-loopback", m, ["antigravity"], { machineOf });
  await waitFor(() => s.g.ultimo("antigravity")?.cuentas === 0, "0 accounts");

  s.g.agregar("antigravity");
  await waitFor(() => m.de("login_account").length === 1, "login_account called");
  const loginCall = m.de("login_account")[0];
  const accountId = loginCall.args.id;
  assert.equal(accountId, "cmp_cloud~antigravity-1");
  assert.equal(loginCall.options?.headers?.["x-terminus-machine"], "cmp_cloud", "login_account routed to cloud machine");

  // Engine (agy_acp_server.par in cloud) emits url (loopback), notice, and code("").
  s.app.emit("account", { account: accountId, kind: "url", text: AG_LOOPBACK_URL });
  s.app.emit("account", { account: accountId, kind: "notice", text: "Waiting on loopback relay" });
  s.app.emit("account", { account: accountId, kind: "code", text: "" });

  const input = await waitFor(
    () => s.app.w.document.querySelector("[data-login-code-input]"),
    "callback URL input visible",
  );
  const dialog = input.closest('[role="dialog"]');
  assert.ok(dialog, "input lives inside the login dialog");
  assert.equal(dialog.querySelector("[data-login-code-mode]")?.getAttribute("data-login-code-mode"), "callback_url");
  assert.ok(dialog.textContent.includes("Abrir navegador"), "open browser button visible");
  assert.ok(dialog.textContent.includes("Copiar enlace"), "copy link button visible");

  // Clear instructions for loopback connection-error page, NOT generic code copy.
  assert.ok(!dialog.textContent.includes("Pega el código que te muestra la página"), "must not show confusing code-only title");
  assert.ok(dialog.textContent.includes("Pega la URL de la última página"), "shows callback URL title");
  const hint = dialog.querySelector("[data-login-loopback-hint]");
  assert.ok(hint, "shows dedicated loopback hint");
  assert.ok(hint.textContent.includes("127.0.0.1"), "hint mentions 127.0.0.1 address-bar URL");
  assert.ok(input.placeholder.includes("127.0.0.1"), "placeholder shows loopback URL shape");
  assert.ok(dialog.textContent.includes("Completar inicio de sesión"), "submit button matches callback URL flow");

  // UI rule: no focus rings or primary outlines on the input.
  assert.ok(!/focus-visible:ring|focus:ring|outline-primary/.test(input.className), "no focus ring on input");

  // First submission fails with concrete engine error: stays inside modal and preserves user input for correction.
  m.on.submit_login_code = () => Promise.reject({ message: "La URL está incompleta: falta el parámetro code" });
  input.value = "http://127.0.0.1:41234/?state=st1";
  input.dispatchEvent(new s.app.w.Event("input", { bubbles: true }));
  input.closest("form").dispatchEvent(new s.app.w.Event("submit", { bubbles: true, cancelable: true }));

  const errEl = await waitFor(
    () => dialog.querySelector("[data-login-code-error]"),
    "inline error inside modal on rejected URL",
  );
  assert.ok(errEl.textContent.includes("falta el parámetro code"), "concrete engine error shown inline");
  assert.equal(m.de("submit_login_code")[0].options?.headers?.["x-terminus-machine"], "cmp_cloud", "submit_login_code routed to cloud machine");
  assert.ok(dialog.querySelector("[data-login-code-input]"), "input remains open in modal for retry");
  assert.equal(input.value, "http://127.0.0.1:41234/?state=st1", "user input preserved for editing");

  // Second submission: user pastes full callback URL (even without http://) with surrounding spaces.
  const pausa = diferido();
  m.on.submit_login_code = () => pausa.promise;
  const callbackUrl = "  127.0.0.1:41234/?state=st1&code=4/0Axyz  ";
  input.value = callbackUrl;
  input.dispatchEvent(new s.app.w.Event("input", { bubbles: true }));
  assert.equal(dialog.querySelector("[data-login-code-error]"), null, "inline error clears when editing");
  input.closest("form").dispatchEvent(new s.app.w.Event("submit", { bubbles: true, cancelable: true }));

  await waitFor(() => m.de("submit_login_code").length === 2, "second submit_login_code called");
  const second = m.de("submit_login_code")[1];
  assert.equal(second.args.code, callbackUrl.trim(), "callback URL trimmed before sending");
  assert.equal(second.options?.headers?.["x-terminus-machine"], "cmp_cloud", "second submit_login_code routed to cloud machine");
  assert.equal(input.disabled, true, "input disabled while submitting");

  pausa.resolve(null);
  const sentEl = await waitFor(() => dialog.querySelector("[data-login-code-sent]"), "verifying status shown after submit");
  assert.ok(sentEl.textContent.includes("Completando inicio de sesión"), "verifying status matches callback URL flow");

  m.publicar("antigravity", accountId);
  s.app.emit("account", { account: accountId, kind: "done", text: "" });
  await sleep(30);
  assert.equal(s.app.w.document.querySelector("[data-login-code-input]"), null, "dialog closes on done");
  assert.deepEqual(s.app.failures, []);
  s.cerrar();
});

test("non-loopback OAuth login keeps standard code copy and button", async () => {
  const m = motor();
  m.provs.claude = { cuentas: [], label: "Claude" };
  const s = await montar(fixture, "claude-code", m, ["claude"]);
  await waitFor(() => s.g.ultimo("claude")?.cuentas === 0, "0 accounts");

  s.g.agregar("claude");
  await waitFor(() => m.de("login_account").length === 1, "login_account called");
  const accountId = m.de("login_account")[0].args.id;

  s.app.emit("account", { account: accountId, kind: "url", text: CLAUDE_CODE_URL });
  s.app.emit("account", { account: accountId, kind: "code", text: "" });

  const input = await waitFor(
    () => s.app.w.document.querySelector("[data-login-code-input]"),
    "code input visible",
  );
  const dialog = input.closest('[role="dialog"]');
  assert.equal(dialog.querySelector("[data-login-code-mode]")?.getAttribute("data-login-code-mode"), "code");
  assert.ok(dialog.textContent.includes("Pega el código que te muestra la página"));
  assert.ok(dialog.textContent.includes("Enviar el código"));
  assert.equal(dialog.querySelector("[data-login-loopback-hint]"), null);
  assert.deepEqual(s.app.failures, []);
  s.cerrar();
});
