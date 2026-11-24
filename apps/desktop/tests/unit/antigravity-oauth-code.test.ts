/**
 * Loopback OAuth callback detection (`agy_acp_server.par` on cloud/Web) and
 * engine error formatting for `submit_login_code`.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { hasLoopbackRedirect, loginCodeErrorText } from "../../../../packages/ui/src/lib/account-auth.ts";

test("hasLoopbackRedirect detects 127.0.0.1, localhost, and [::1] redirect_uri values only", () => {
  const agLoopback =
    "https://accounts.google.com/o/oauth2/v2/auth?client_id=abc&redirect_uri=http%3A%2F%2F127.0.0.1%3A41234%2F&response_type=code&state=st1";
  const localhostUrl =
    "https://accounts.google.com/o/oauth2/v2/auth?redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fauth%2Fcallback";
  const ipv6Loopback =
    "https://accounts.google.com/o/oauth2/v2/auth?redirect_uri=http%3A%2F%2F%5B%3A%3A1%5D%3A8085%2F";
  const remoteCallback =
    "https://console.anthropic.com/oauth/authorize?redirect_uri=https%3A%2F%2Fconsole.anthropic.com%2Foauth%2Fcode%2Fcallback";
  const oobUrl =
    "https://accounts.google.com/o/oauth2/v2/auth?redirect_uri=urn%3Aietf%3Awg%3Aoauth%3A2.0%3Aoob";

  assert.equal(hasLoopbackRedirect(agLoopback), true);
  assert.equal(hasLoopbackRedirect(localhostUrl), true);
  assert.equal(hasLoopbackRedirect(ipv6Loopback), true);
  assert.equal(hasLoopbackRedirect(remoteCallback), false);
  assert.equal(hasLoopbackRedirect(oobUrl), false);
  assert.equal(hasLoopbackRedirect(""), false);
  assert.equal(hasLoopbackRedirect(null), false);
  assert.equal(hasLoopbackRedirect("not a url"), false);
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
