import assert from "node:assert/strict";
import test from "node:test";
import { ACCOUNT_WELCOME_KEY, accountWelcomeAnswered, offerAccountWelcome, rememberAccountWelcome } from "../../src/features/onboarding/account-welcome.ts";
import { DESKTOP_DOWNLOADS, downloadsFor, platformOf } from "../../src/lib/downloads.ts";

function memory() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
}

test("the choice is remembered once per computer", () => {
  const store = memory();
  assert.equal(accountWelcomeAnswered(store), false);
  rememberAccountWelcome("local", store);
  assert.equal(store.data.get(ACCOUNT_WELCOME_KEY), "local");
  assert.equal(accountWelcomeAnswered(store), true);
  store.setItem(ACCOUNT_WELCOME_KEY, "otra cosa");
  assert.equal(accountWelcomeAnswered(store), false, "an unknown value asks again");
});

test("the screen is offered only on a first run without an answer", () => {
  assert.equal(offerAccountWelcome(true, false), true);
  assert.equal(offerAccountWelcome(true, true), false);
  assert.equal(offerAccountWelcome(false, false), false);
});

test("downloads point at danil.ai/download with the stable names, this computer first", () => {
  assert.deepEqual(
    DESKTOP_DOWNLOADS.map((d) => d.url),
    [
      "https://danil.ai/download/Danil-macOS.dmg",
      "https://danil.ai/download/Danil-Windows-Setup.exe",
      "https://danil.ai/download/Danil-Linux-x86_64.AppImage",
    ],
  );
  assert.equal(platformOf("Mozilla/5.0 (Windows NT 10.0; Win64; x64)"), "windows");
  assert.equal(platformOf("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)"), "macos");
  assert.equal(platformOf("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"), null);
  assert.equal(platformOf("Mozilla/5.0 (Linux; Android 15)"), null);
  assert.equal(downloadsFor("Mozilla/5.0 (Windows NT 10.0)")[0].platform, "windows");
  assert.equal(downloadsFor("Mozilla/5.0 (iPhone)")[0].platform, "macos", "a phone keeps the default order");
});
