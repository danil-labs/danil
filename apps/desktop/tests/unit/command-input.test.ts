import assert from "node:assert/strict";
import test from "node:test";

import { pideClave as asksSecret } from "../../../../packages/features/chat/src/model/commandInput.ts";

test("a sudo prompt on the last line asks for a secret", () => {
  assert.equal(asksSecret("== Usuario ghrunner\nPassword:"), true);
  assert.equal(asksSecret("[sudo] password for ana: "), true);
  assert.equal(asksSecret("Enter passphrase for key '/Users/ana/.ssh/id_ed25519': "), true);
  assert.equal(asksSecret("\x1b[1mContraseña:\x1b[0m "), true);
});

test("an ordinary question or an earlier prompt does not hide what is typed", () => {
  assert.equal(asksSecret("Continue? [y/N] "), false);
  assert.equal(asksSecret("Password:\nok, logged in\nName: "), false);
  assert.equal(asksSecret("Password changed successfully"), false);
});
