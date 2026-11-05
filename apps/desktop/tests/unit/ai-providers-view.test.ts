import assert from "node:assert/strict";
import { test } from "node:test";
import "../helpers/catalog.ts";
import { elegirLengua, t } from "../../src/lib/i18n.ts";
import { aiProvidersView, SUPPORTED_AGENTS } from "../../src/features/settings/ai-providers-view.ts";

test("Cuentas de IA is never blank: loading, failed, the supported agents or the list", () => {
  const failed = { k: "failed" as const, f: { what: "x", detail: "" } };
  assert.equal(aiProvidersView({ k: "loading" }, 0), "loading");
  assert.equal(aiProvidersView(failed, 0), "failed");
  assert.equal(aiProvidersView({ k: "ready" }, 0), "supported");
  assert.equal(aiProvidersView({ k: "ready" }, 3), "list");
  assert.equal(aiProvidersView(failed, 3), "list", "a failed refresh keeps what is on screen");
});

test("the supported agents are Claude, ChatGPT, Gemini and Grok, named in both languages", () => {
  assert.deepEqual([...SUPPORTED_AGENTS], ["claude", "codex", "antigravity", "grok"]);
  for (const lang of ["es", "en"]) {
    elegirLengua(lang);
    for (const id of SUPPORTED_AGENTS) assert.notEqual(t(`settings.ai_providers.agent_${id}`), `settings.ai_providers.agent_${id}`);
  }
  elegirLengua("es");
});
