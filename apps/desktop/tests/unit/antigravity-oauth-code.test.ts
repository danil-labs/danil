/**
 * Dual Antigravity OAuth detection:
 * 1. Primary (`agy acp --login`): hosted HTTPS `redirect_uri` (e.g. `https://antigravity.google/oauth-callback`)
 *    or headless code `notice` -> `"hosted_code"`.
 * 2. Fallback (`agy_acp_server.par` on cloud/Web): loopback `redirect_uri` (`127.0.0.1`/`localhost`/`[::1]`)
 *    -> `"callback_url"` (only opens manual input when engine emits explicit `code` event).
 * 3. Concrete engine error formatting for `submit_login_code`.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  hasHostedOAuthRedirect,
  hasLoopbackRedirect,
  isHeadlessCodeNotice,
  loginCodeErrorText,
  manualLoginMode,
  shouldOpenManualCodeInput,
} from "../../../../packages/ui/src/lib/account-auth.ts";

const AG_HOSTED_URL =
  "https://accounts.google.com/o/oauth2/v2/auth?client_id=abc&redirect_uri=https%3A%2F%2Fantigravity.google%2Foauth-callback&response_type=code&state=st1";
const AG_LOOPBACK_URL =
  "https://accounts.google.com/o/oauth2/v2/auth?client_id=abc&redirect_uri=http%3A%2F%2F127.0.0.1%3A41234%2F&response_type=code&state=st1";
const LOCALHOST_URL =
  "https://accounts.google.com/o/oauth2/v2/auth?redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fauth%2Fcallback";
const IPV6_LOOPBACK_URL =
  "https://accounts.google.com/o/oauth2/v2/auth?redirect_uri=http%3A%2F%2F%5B%3A%3A1%5D%3A8085%2F";
const CLAUDE_HOSTED_URL =
  "https://claude.ai/oauth/authorize?redirect_uri=https%3A%2F%2Fconsole.anthropic.com%2Foauth%2Fcode%2Fcallback";
const OOB_URL =
  "https://accounts.google.com/o/oauth2/v2/auth?redirect_uri=urn%3Aietf%3Awg%3Aoauth%3A2.0%3Aoob";

test("hasLoopbackRedirect detects 127.0.0.1, localhost, and [::1] redirect_uri values only", () => {
  assert.equal(hasLoopbackRedirect(AG_LOOPBACK_URL), true);
  assert.equal(hasLoopbackRedirect(LOCALHOST_URL), true);
  assert.equal(hasLoopbackRedirect(IPV6_LOOPBACK_URL), true);
  assert.equal(hasLoopbackRedirect(AG_HOSTED_URL), false);
  assert.equal(hasLoopbackRedirect(CLAUDE_HOSTED_URL), false);
  assert.equal(hasLoopbackRedirect(OOB_URL), false);
  assert.equal(hasLoopbackRedirect(""), false);
  assert.equal(hasLoopbackRedirect(null), false);
  assert.equal(hasLoopbackRedirect("not a url"), false);
});

test("hasHostedOAuthRedirect detects hosted HTTPS callbacks and OOB, excluding loopback", () => {
  assert.equal(hasHostedOAuthRedirect(AG_HOSTED_URL), true);
  assert.equal(hasHostedOAuthRedirect(CLAUDE_HOSTED_URL), true);
  assert.equal(hasHostedOAuthRedirect(OOB_URL), true);
  assert.equal(hasHostedOAuthRedirect(AG_LOOPBACK_URL), false);
  assert.equal(hasHostedOAuthRedirect(LOCALHOST_URL), false);
  assert.equal(hasHostedOAuthRedirect("https://claude.example/login"), false);
});

test("isHeadlessCodeNotice matches manual code prompts without matching device codes or progress notices", () => {
  assert.equal(isHeadlessCodeNotice("Paste the authorization code here:"), true);
  assert.equal(isHeadlessCodeNotice("Enter authorization code or callback URL"), true);
  assert.equal(isHeadlessCodeNotice("Pega el código de autorización que muestra la página"), true);
  assert.equal(isHeadlessCodeNotice("Enter this code in your browser: ABCD-1234"), false);
  assert.equal(isHeadlessCodeNotice("Exchanging authorization code…"), false);
  assert.equal(isHeadlessCodeNotice("Waiting on loopback relay"), false);
});

test("shouldOpenManualCodeInput auto-opens for hosted Antigravity/OOB/headless notices, never for loopback alone", () => {
  assert.equal(shouldOpenManualCodeInput(AG_HOSTED_URL), true);
  assert.equal(shouldOpenManualCodeInput(OOB_URL), true);
  assert.equal(shouldOpenManualCodeInput("https://accounts.google.com/o/oauth2/v2/auth", "Enter authorization code:"), true);
  // Loopback must wait for explicit `code` event so Desktop local relay is never interrupted.
  assert.equal(shouldOpenManualCodeInput(AG_LOOPBACK_URL), false);
  assert.equal(shouldOpenManualCodeInput(AG_LOOPBACK_URL, "Paste the authorization code"), false);
  assert.equal(shouldOpenManualCodeInput("https://claude.example/login", null), false);
});

test("manualLoginMode classifies callback_url, hosted_code, and code cleanly", () => {
  assert.equal(manualLoginMode(AG_LOOPBACK_URL), "callback_url");
  assert.equal(manualLoginMode(AG_LOOPBACK_URL, "Paste the authorization code"), "callback_url");
  assert.equal(manualLoginMode(AG_HOSTED_URL), "hosted_code");
  assert.equal(manualLoginMode(OOB_URL), "hosted_code");
  assert.equal(manualLoginMode("https://accounts.google.com/o/oauth2/v2/auth", "Paste the authorization code"), "hosted_code");
  assert.equal(manualLoginMode("https://claude.example/login", null), "code");
});

test("loginCodeErrorText surfaces concrete engine errors without appending generic noise", () => {
  assert.equal(
    loginCodeErrorText({ message: "La URL no incluye el parámetro code" }, "Fallback"),
    "La URL no incluye el parámetro code",
  );
  assert.equal(
    loginCodeErrorText(
      { detail: { reason: "El inicio de sesión venció", recovery: "Vuelve a iniciar sesión e intenta de nuevo" } },
      "Fallback",
    ),
    "El inicio de sesión venció\nVuelve a iniciar sesión e intenta de nuevo",
  );
  assert.equal(
    loginCodeErrorText({ what: "URL inválida", detail: "Falta el parámetro state en la URL" }, "Fallback"),
    "URL inválida\nFalta el parámetro state en la URL",
  );
  assert.equal(loginCodeErrorText("El puerto no coincide", "Fallback"), "El puerto no coincide");
  assert.equal(loginCodeErrorText(new Error("Expired state token"), "Fallback"), "Expired state token");
});
