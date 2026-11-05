import assert from "node:assert/strict";
import { test } from "node:test";
import { linuxUserSlug, wslUserProblem } from "../../src/features/machines/wsl.ts";

test("linuxUserSlug turns what the person types into a Linux user", () => {
  assert.equal(linuxUserSlug("Tu Nombre"), "tu-nombre");
  assert.equal(linuxUserSlug("Ana López"), "ana-lopez");
  assert.equal(linuxUserSlug("mau_c"), "mau_c");
  assert.equal(linuxUserSlug("2mau"), "mau");
  assert.equal(linuxUserSlug("a".repeat(40)).length, 32);
});

test("wslUserProblem follows the Ubuntu rules", () => {
  assert.equal(wslUserProblem(""), "empty");
  assert.equal(wslUserProblem("root"), "reserved");
  assert.equal(wslUserProblem("Mau"), "format");
  assert.equal(wslUserProblem("tu-nombre"), null);
});
