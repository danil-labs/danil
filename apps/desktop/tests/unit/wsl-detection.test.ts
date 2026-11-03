import assert from "node:assert/strict";
import { test } from "node:test";
import { WSL_INSTALL, WSL_INSTALL_UBUNTU, wslFailureCode, wslState } from "../../src/features/machines/wsl.ts";

test("wslState reads English and Spanish states", () => {
  assert.deepEqual(wslState("Running"), { state: "running", tone: "success" });
  assert.deepEqual(wslState("En ejecución"), { state: "running", tone: "success" });
  assert.deepEqual(wslState("Stopped"), { state: "stopped", tone: "off" });
  assert.deepEqual(wslState("Detenida"), { state: "stopped", tone: "off" });
  assert.deepEqual(wslState("Installing"), { state: "installing", tone: "working" });
  assert.deepEqual(wslState(""), { state: "unknown", tone: "neutral" });
  assert.deepEqual(wslState("Converting"), { state: "other", tone: "neutral" });
});

test("wslFailureCode keeps known codes and falls back", () => {
  for (const code of ["wsl_missing", "wsl_timeout", "wsl_failed", "unsupported", "io"]) {
    assert.equal(wslFailureCode(code), code);
  }
  assert.equal(wslFailureCode({ detail: "wsl_missing" }), "wsl_missing");
  assert.equal(wslFailureCode({ code: "wsl_timeout" }), "wsl_timeout");
  assert.equal(wslFailureCode({ detail: { code: "unsupported" } }), "unsupported");
  assert.equal(wslFailureCode("something else"), "wsl_failed");
  assert.equal(wslFailureCode(null), "wsl_failed");
});

test("the WSL commands stay literal", () => {
  assert.equal(WSL_INSTALL, "wsl --install");
  assert.equal(WSL_INSTALL_UBUNTU, "wsl --install -d Ubuntu");
});
