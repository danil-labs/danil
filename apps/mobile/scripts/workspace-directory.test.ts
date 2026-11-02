/**
 * El directorio de la cuenta (`GET /v1/me/workspaces`) cruzado con las máquinas
 * del teléfono (`src/lib/workspaceDirectory.ts`): el que tiene máquina se abre,
 * el que no se queda como «necesita una máquina», y fijar no da acceso.
 *
 *   node --test apps/mobile/scripts/workspace-directory.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { DirectoryEntry } from "@terminus/computers";
import { directoryRole, directoryRows, pinKeys, pinnedFirst, withPins } from "../src/lib/workspaceDirectory.ts";

const entry = (key: string, patch: Partial<DirectoryEntry> = {}): DirectoryEntry => ({
  key,
  workspace_id: null,
  danil_workspace_id: null,
  name: key,
  kind: "personal",
  organization: null,
  role: "owner",
  owner: false,
  support: null,
  capabilities: { agents: true, terminus: false },
  pin: null,
  ...patch,
});

test("un workspace con máquina en el teléfono se abre; el que no la tiene, no", () => {
  const rows = directoryRows(
    [
      entry("w:uno", { workspace_id: "uno", kind: "terminus_only" }),
      entry("w:dos", { workspace_id: "dos", kind: "terminus_only" }),
      entry("a:3"),
    ],
    [
      { id: "uno", hosts: ["cmp_vm", "cmp_mac"] },
      // La máquina contestó que ya no lo tiene: el registro lo menciona, pero no hay dónde abrirlo.
      { id: "dos", hosts: [] },
    ],
    [
      { id: "cmp_vm", linked: new Set(["uno"]) },
      { id: "cmp_mac", linked: new Set(["uno"]) },
    ],
  );
  assert.deepEqual(rows.map((row) => [row.entry.key, row.machines, row.openable]), [
    ["w:uno", ["cmp_vm", "cmp_mac"], true],
    ["w:dos", [], false],
    ["a:3", [], false],
  ]);
});

test("una máquina que el plano de control dice que lo tiene basta, aunque esté apagada y no haya contestado", () => {
  const [row] = directoryRows(
    [entry("w:uno", { workspace_id: "uno", kind: "terminus_only" })],
    [],
    [{ id: "cmp_vm", linked: new Set(["uno"]) }],
  );
  assert.deepEqual([row.machines, row.openable], [["cmp_vm"], true]);
  const [unknown] = directoryRows([entry("w:uno", { workspace_id: "uno" })], [], [{ id: "cmp_vm", linked: null }]);
  assert.equal(unknown.openable, false, "sin el dato, no se inventa la máquina");
});

test("la ausencia del workspace en el teléfono es «necesita una máquina», aunque el directorio lo traiga", () => {
  const [row] = directoryRows([entry("a:9", { workspace_id: "nueve" })], []);
  assert.equal(row.openable, false);
  assert.deepEqual(row.machines, []);
});

test("el rol se lee del directorio y el acceso de soporte manda", () => {
  assert.equal(directoryRole(entry("a:1", { role: "OWNER" })), "owner");
  assert.equal(directoryRole(entry("a:1", { role: "admin" })), "admin");
  assert.equal(directoryRole(entry("a:1", { role: "member" })), "member");
  assert.equal(directoryRole(entry("a:1", { role: null })), null);
  assert.equal(directoryRole(entry("a:1", { role: "viewer" })), null);
  assert.equal(directoryRole(entry("a:1", { role: "owner", support: { level: "read", expires_at: "x" } })), "support");
});

test("fijar agrega la clave al final y quitar la saca; no toca las demás", () => {
  const list = [entry("a:1", { pin: 0 }), entry("a:2"), entry("a:3", { pin: 1 })];
  assert.deepEqual(pinKeys(list, list[1]), ["a:1", "a:3", "a:2"]);
  assert.deepEqual(pinKeys(list, list[0]), ["a:3"]);
});

test("con los fijados que contestó el plano de control, el lugar lo da el orden", () => {
  const list = [entry("a:1"), entry("a:2"), entry("a:3")];
  assert.deepEqual(withPins(list, ["a:3", "a:1"]).map((item) => [item.key, item.pin]), [
    ["a:1", 1],
    ["a:2", null],
    ["a:3", 0],
  ]);
});

test("los fijados van primero, en el orden de la barra; lo demás conserva su orden", () => {
  const pinned = pinnedFirst([entry("a:1", { pin: null }), entry("a:2", { pin: 1 }), entry("a:3", { pin: null }), entry("a:4", { pin: 0 })]);
  assert.deepEqual(pinned.map((item) => item.key), ["a:4", "a:2", "a:1", "a:3"]);
});
