import assert from "node:assert/strict";
import test from "node:test";

import { APP_ACTIONS, MODEL_REQUIRED_KEY, SESSION_MODEL_FEATURE, SESSION_MODEL_REFUSALS, isAppAction, savesSessionModel, sessionModelArgs } from "../src/index.ts";

test("set_session_model está en la lista cerrada como acción", () => {
  assert.ok((APP_ACTIONS as readonly string[]).includes("set_session_model"));
  assert.ok(isAppAction("set_session_model"));
});

test("solo un motor que anuncia session_model_v1 guarda la elección", () => {
  assert.equal(SESSION_MODEL_FEATURE, "session_model_v1");
  assert.equal(savesSessionModel(["provider_handoff_v1", "session_model_v1"]), true);
  assert.equal(savesSessionModel(["provider_handoff_v1"]), false);
  assert.equal(savesSessionModel(undefined), false);
  assert.equal(savesSessionModel(null), false);
});

test("modelo y esfuerzo viajan juntos; un esfuerzo sin modelo no", () => {
  assert.deepEqual(sessionModelArgs("p", "t", "gpt-5", "high"), { project: "p", id: "t", model: "gpt-5", effort: "high" });
  assert.deepEqual(sessionModelArgs("p", "t", "gpt-5", null), { project: "p", id: "t", model: "gpt-5", effort: null });
  assert.deepEqual(sessionModelArgs("p", "t", "gpt-5", ""), { project: "p", id: "t", model: "gpt-5", effort: null });
  assert.deepEqual(sessionModelArgs("p", "t", "", "high"), { project: "p", id: "t", model: null, effort: null });
  assert.deepEqual(sessionModelArgs("p", "t", null, "high"), { project: "p", id: "t", model: null, effort: null });
});

test("las claves de rechazo son las del motor", () => {
  assert.deepEqual([...SESSION_MODEL_REFUSALS], [
    "chat.session_model.not_offered",
    "chat.session_model.effort_not_offered",
    "chat.session_model.catalog_unavailable",
    "chat.session_model.agent_changed",
  ]);
  assert.equal(MODEL_REQUIRED_KEY, "cli.error.model_required");
});
