import { strict as assert } from "node:assert";
import { test } from "node:test";
import { settingsLink } from "../../src/web/settings-link.ts";

test("the billing plan link is enabled only when billing v2 is on", () => {
  const url = "https://example.invalid/terminus/?settings=plan&checkout=bchk_123#section";
  assert.deepEqual(settingsLink(url, true), { target: "plan", clean: "/terminus/?checkout=bchk_123#section" });
  assert.deepEqual(settingsLink(url, false), { target: undefined, clean: "/terminus/?checkout=bchk_123#section" });
});
test("existing settings links and URLs without settings keep their behavior", () => {
  assert.deepEqual(settingsLink("https://example.invalid/?settings=emails", false), { target: "emails", clean: "/" });
  assert.deepEqual(settingsLink("https://example.invalid/?other=1", false), { target: undefined, clean: null });
});
