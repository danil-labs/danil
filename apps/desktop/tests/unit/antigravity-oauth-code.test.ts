import assert from "node:assert/strict";
import { test } from "node:test";
import { isLoopbackNotice, needsManualCallbackCode } from "../../../../packages/ui/src/lib/account-auth.ts";

test("needsManualCallbackCode detects Antigravity OAuth callback and OOB flows without matching loopback", () => {
  const antigravityUrl =
    "https://accounts.google.com/o/oauth2/v2/auth?client_id=12345&redirect_uri=https%3A%2F%2Fantigravity.google%2Foauth-callback&response_type=code&scope=openid";
  assert.equal(needsManualCallbackCode(antigravityUrl), true);

  const oobUrl =
    "https://accounts.google.com/o/oauth2/v2/auth?client_id=12345&redirect_uri=urn%3Aietf%3Awg%3Aoauth%3A2.0%3Aoob&response_type=code";
  assert.equal(needsManualCallbackCode(oobUrl), true);

  const codexLoopback =
    "https://auth.openai.com/oauth/authorize?client_id=abc&redirect_uri=http%3A%2F%2F127.0.0.1%3A1455%2Fauth%2Fcallback";
  assert.equal(needsManualCallbackCode(codexLoopback), false);

  const localhostLoopback =
    "https://accounts.google.com/o/oauth2/v2/auth?redirect_uri=http%3A%2F%2Flocalhost%3A8085%2Foauth2callback";
  assert.equal(needsManualCallbackCode(localhostLoopback), false);

  assert.equal(needsManualCallbackCode(null), false);
  assert.equal(needsManualCallbackCode(""), false);
  assert.equal(needsManualCallbackCode("not-a-url"), false);
});

test("isLoopbackNotice flags loopback-only copy and leaves normal OOB notices alone", () => {
  assert.equal(isLoopbackNotice("Waiting for callback on http://127.0.0.1:1455/callback"), true);
  assert.equal(isLoopbackNotice("Redirecting to localhost:8080"), true);
  assert.equal(isLoopbackNotice("Paste the code shown by Google to continue."), false);
});
