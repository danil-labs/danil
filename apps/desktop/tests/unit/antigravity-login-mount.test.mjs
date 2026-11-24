/**
 * Headless Antigravity login (`agy acp --login`) in Settings → AI Accounts:
 * when a `url` event arrives with `redirect_uri=https://antigravity.google/oauth-callback`,
 * the dialog exposes the browser link + copy button AND immediately renders the code / callback URL
 * input without waiting for a separate `code` event, suppresses confusing 127.0.0.1 loopback notices,
 * shows inline errors inside the modal on rejection, and trims & submits callback URLs/codes with
 * submitting/verifying feedback.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { sleep } from "../helpers/jsdom-app.mjs";
import { cerrarTodo, compilar, diferido, montar, motor, waitFor } from "../helpers/ai-providers-fixture.mjs";

let fixture;
test.before(async () => { fixture = await compilar(); });
test.afterEach(cerrarTodo);
test.after(() => fixture?.limpiar());

const AG_URL =
  "https://accounts.google.com/o/oauth2/v2/auth?client_id=test-client&redirect_uri=https%3A%2F%2Fantigravity.google%2Foauth-callback&response_type=code&scope=openid";

test("antigravity headless OAuth URL shows paste input immediately, handles inline error and callback URL submission", async () => {
  const m = motor();
  m.provs.antigravity = { cuentas: [], label: "Antigravity" };
  const s = await montar(fixture, "ag-code", m, ["antigravity"]);
  await waitFor(() => s.g.ultimo("antigravity")?.cuentas === 0, "0 accounts");

  s.g.agregar("antigravity");
  await waitFor(() => m.de("login_account").length === 1, "login_account called");
  const accountId = m.de("login_account")[0].args.id;

  // Engine emits ONLY `url` with Antigravity OOB redirect_uri (and a stray loopback notice).
  s.app.emit("account", { account: accountId, kind: "url", text: AG_URL });
  s.app.emit("account", { account: accountId, kind: "notice", text: "Waiting on http://127.0.0.1:1455/callback" });

  // Input must appear immediately without needing a separate `code` event.
  const input = await waitFor(
    () => s.app.w.document.querySelector("[data-login-code-input]"),
    "code/callback input visible immediately",
  );
  const dialog = input.closest('[role="dialog"]');
  assert.ok(dialog, "input lives inside the login dialog");
  assert.ok(dialog.textContent.includes("Abrir navegador"), "open browser button visible");
  assert.ok(dialog.textContent.includes("Copiar enlace"), "copy link button visible");
  assert.ok(!dialog.textContent.includes("127.0.0.1"), "loopback notice must not appear for Antigravity OOB URL");

  // Input must not have focus ring or primary outline classes.
  assert.ok(!/focus-visible:ring|focus:ring/.test(input.className), "no focus ring on input");

  // First submission fails: inline error must be shown INSIDE the dialog and input must remain usable.
  m.on.submit_login_code = () => Promise.reject({ what: "Código inválido", detail: "invalid_grant" });
  input.value = "bad-code";
  input.dispatchEvent(new s.app.w.Event("input", { bubbles: true }));
  input.closest("form").dispatchEvent(new s.app.w.Event("submit", { bubbles: true, cancelable: true }));

  const errEl = await waitFor(
    () => dialog.querySelector("[data-login-code-error]"),
    "inline error inside modal on rejected code",
  );
  assert.ok(errEl.textContent.includes("invalid_grant") || errEl.textContent.length > 0);
  assert.ok(dialog.querySelector("[data-login-code-input]"), "input remains visible for retry");

  // Second submission: full callback URL with surrounding whitespace; check submitting state and trimmed payload.
  const pausa = diferido();
  m.on.submit_login_code = () => pausa.promise;
  const callbackUrl = "  https://antigravity.google/oauth-callback?code=4/0Axyz&state=st1  ";
  input.value = callbackUrl;
  input.dispatchEvent(new s.app.w.Event("input", { bubbles: true }));
  input.closest("form").dispatchEvent(new s.app.w.Event("submit", { bubbles: true, cancelable: true }));

  await waitFor(() => m.de("submit_login_code").length === 2, "second submit_login_code called");
  assert.equal(m.de("submit_login_code")[1].args.code, callbackUrl.trim(), "code/callback URL trimmed before sending");
  assert.equal(input.disabled, true, "input disabled while submitting");

  pausa.resolve(null);
  await waitFor(() => dialog.querySelector("[data-login-code-sent]"), "verifying status shown after submit");

  m.publicar("antigravity", accountId);
  s.app.emit("account", { account: accountId, kind: "done", text: "" });
  await sleep(30);
  assert.equal(s.app.w.document.querySelector("[data-login-code-input]"), null, "dialog closes on done");
  assert.deepEqual(s.app.failures, []);
  s.cerrar();
});
