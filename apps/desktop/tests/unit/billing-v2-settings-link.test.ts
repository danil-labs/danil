import { strict as assert } from "node:assert";
import { test } from "node:test";
import { settingsLink } from "../../src/web/settings-link.ts";

test("the billing plan link preserves checkout and hash", () => {
  const url = "https://example.invalid/terminus/?settings=plan&checkout=bchk_123#section";
  assert.deepEqual(settingsLink(url), { target: "plan", clean: "/terminus/?checkout=bchk_123#section" });
});
test("existing settings links and URLs without settings keep their behavior", () => {
  assert.deepEqual(settingsLink("https://example.invalid/?settings=emails"), { target: "emails", clean: "/" });
  assert.deepEqual(settingsLink("https://example.invalid/?other=1"), { target: undefined, clean: null });
});
