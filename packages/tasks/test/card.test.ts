import assert from "node:assert/strict";
import { test } from "node:test";
import { taskCard } from "../src/index.ts";

const row = { id: "t1", title: "Tarea", esperando: false, folder: "p1", agent: "Ada", last_message: "¿Borro la rama?" };

test("si te necesita lo dice su estado; la tarjeta no lleva lo que pide", () => {
  const card = taskCard({ ...row, esperando: true }, { live: [], approving: [] });
  assert.equal(card.state, "asked");
  assert.equal(card.needsYou, true);
  assert.equal("request" in card, false);
});

test("una fallida te necesita; una que detuviste tiene su propio estado y no te necesita", () => {
  const failed = taskCard({ ...row, outcome: "failed" as const }, { live: [], approving: [] });
  assert.equal(failed.state, "failed");
  assert.equal(failed.needsYou, true);
  const stopped = taskCard({ ...row, outcome: "interrupted" as const, sin_ver: true }, { live: [], approving: [] });
  assert.equal(stopped.state, "interrupted", "detenida va antes que sin ver");
  assert.equal(stopped.needsYou, false);
  assert.equal(stopped.delivered, false);
});

test("si no, proveedor, carpeta, máquina y agente; el chat del agente no repite su cara", () => {
  const card = taskCard({ ...row, provider: "claude", machine: "Mac", machine_on: false }, { live: ["t1"], approving: [] });
  assert.equal(card.provider, "claude");
  assert.equal(taskCard(row, { live: [], approving: [] }).machine, null);
  assert.equal(card.state, "working");
  assert.equal(card.folder, "p1");
  assert.equal(card.agent, "Ada");
  assert.deepEqual(card.machine, { id: "Mac", on: false });
  assert.equal(taskCard({ ...row, chat_de_agente: true }, { live: [], approving: [] }).agent, null);
  assert.equal(taskCard(row, { live: [], approving: [], hideFolder: true }).folder, null);
});

test("aprobar gana a todo y una entregada sin estado lleva su marca", () => {
  assert.equal(taskCard({ ...row, esperando: true }, { live: ["t1"], approving: ["t1"] }).state, "approving");
  const delivered = taskCard({ ...row, outcome: "delivered" as const }, { live: [], approving: [] });
  assert.equal(delivered.state, null);
  assert.equal(delivered.delivered, true);
  assert.equal(taskCard({ ...row, chat_de_agente: true }, { live: [], approving: [] }).pinned, true);
});

test("group headers hide exactly the metadata they name, including folder loose rows", async () => {
  const { groupCardOptions } = await import("../src/index.ts");
  const cases = [
    [{ kind: "section", key: "active" }, false, false],
    [{ kind: "agent", key: "Ada" }, false, false],
    [{ kind: "status", key: "draft" }, false, false],
    [{ kind: "machine", key: "vm" }, false, true],
    [{ kind: "folder", key: "p1" }, true, false],
    [{ kind: "folder", key: "p1", machine: "vm" }, true, true],
    [{ kind: "folder", key: "" }, false, false],
  ] as const;
  for (const [group, hideFolder, hideMachine] of cases) {
    const options = groupCardOptions(group);
    assert.deepEqual(options, { hideFolder, hideMachine });
    const card = taskCard({ ...row, provider: "claude", machine: "vm" }, { live: [row.id], approving: [], ...options });
    assert.equal(card.folder, hideFolder ? null : "p1");
    assert.equal(card.machine?.id ?? null, hideMachine ? null : "vm");
    assert.equal(card.provider, "claude");
    assert.equal(card.state, "working");
  }
});
