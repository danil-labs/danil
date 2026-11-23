import assert from "node:assert/strict";
import test from "node:test";
import { unknownCommand } from "../../src/lib/errorCode.ts";

test("unknown command recognizes the pinned legacy transport literal only", () => {
  assert.equal(unknownCommand("service.error.command"), true);
  assert.equal(unknownCommand({ what: { clave: "shell.service.failed" }, detail: "service.error.command" }), true);
  assert.equal(unknownCommand({ detail: { code: "command", detail: "env_secrets_list" } }), true);
  for (const error of [
    "service.error.io",
    "command",
    "unsupported",
    "message mentions service.error.command",
    { detail: "io" },
    { detail: "permission_denied" },
  ]) {
    assert.equal(unknownCommand(error), false);
  }
});
