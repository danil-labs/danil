import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { getPriority } from "node:os";
import { test } from "node:test";

import { LOW_PRIORITY, lowerPriority } from "../../scripts/priority.mjs";

test("un chequeo local baja a niceness 10", { skip: process.platform === "win32" && "Windows usa clases de prioridad" }, (t) => {
  const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 5000)"], { stdio: "ignore" });
  t.after(() => child.kill());
  lowerPriority(child.pid);
  assert.ok(getPriority(child.pid) >= LOW_PRIORITY);
});

test("no sube la prioridad de un proceso que ya va más bajo", () => {
  const calls = [];
  lowerPriority(123, { getPriority: () => 15, setPriority: (...args) => calls.push(args) });
  assert.deepEqual(calls, []);
});

test("si el sistema no deja cambiarla, sigue sin avisar", () => {
  const fail = () => {
    throw Object.assign(new Error("EACCES"), { code: "EACCES" });
  };
  assert.doesNotThrow(() => lowerPriority(123, { getPriority: () => 0, setPriority: fail }));
  assert.doesNotThrow(() => lowerPriority(123, { getPriority: fail, setPriority: fail }));
  assert.doesNotThrow(() => lowerPriority(undefined));
});
