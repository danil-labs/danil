/**
 * «Mandar ahora» negado y la cola de cada tarea (`src/lib/steer.ts`), como la
 * ventana (`apps/desktop/tests/unit/chat-steer-refused.test.mjs`).
 *
 *   node --test apps/mobile/scripts/steer.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { HostError } from "../src/lib/hosts.ts";
import { ACCEPTANCE_UNKNOWN, QueueMemory, SteerMemory, promote, steerNotice, steerRefusal } from "../src/lib/steer.ts";

const failure = (what: unknown, detail?: string) => new HostError("command_failed", { what, detail });

test("el rechazo de OpenCode no se dice crudo: la clave del ejecutor da la frase del catálogo", () => {
  // OpenCode 2.x rechaza el segundo prompt: el ejecutor no sabe si entró.
  assert.equal(steerRefusal(new HostError("command_failed", ACCEPTANCE_UNKNOWN)), "unconfirmed");
  assert.equal(steerRefusal(failure("chat.steer.failed", ACCEPTANCE_UNKNOWN)), "unconfirmed");
  assert.equal(steerRefusal(failure({ clave: "chat.steer.unsupported" })), "unsupported");
  assert.equal(steerNotice("unconfirmed"), "chat.steer.unconfirmed");
  assert.equal(steerNotice("unsupported"), "chat.steer.unsupported");
  // Las dos frases existen en el catálogo compartido: `w()` no deja la clave en pantalla.
  const words = readFileSync(new URL("../../../packages/design/src/words.ts", import.meta.url), "utf8");
  for (const key of ["chat.steer.unsupported", "chat.steer.unconfirmed", "chat.queue.stop_and_send", "chat.failure.retry"]) {
    assert.equal(words.split(`"${key}":`).length - 1, 2, `${key} en es y en`);
  }
});

test("el turno que cierra deja el mensaje en la cola; el ya entregado sale de ella; lo demás es un fallo", () => {
  assert.equal(steerRefusal(failure({ clave: "chat.steer.not_running" })), "later");
  assert.equal(steerRefusal(failure("chat.steer.stopping")), "later");
  assert.equal(steerRefusal(failure({ clave: "chat.steer.delivered" })), "delivered");
  assert.equal(steerRefusal(new HostError("machine_timeout", "VM")), null);
  assert.equal(steerRefusal(new Error("boom")), null);
});

test("negado una vez, no se vuelve a ofrecer «Mandar ahora» con ese agente en esa máquina ni se repite el aviso", () => {
  const memory = new SteerMemory();
  assert.equal(memory.refuses("mac", "opencode-zen"), false);
  assert.equal(memory.refuse("mac", "opencode-zen"), true);
  assert.equal(memory.refuse("mac", "opencode-zen"), false);
  assert.equal(memory.refuses("mac", "opencode-zen"), true);
  // Otra máquina puede tener otro CLI; otro agente sí recibe a medias.
  assert.equal(memory.refuses("vm", "opencode-zen"), false);
  assert.equal(memory.refuses("mac", "claude"), false);
  assert.equal(memory.refuses(null, "opencode-zen"), false);
});

test("la cola de una tarea sobrevive a salir de la pantalla mientras la app corre", () => {
  const memory = new QueueMemory();
  const key = QueueMemory.key("mac", "w1", "t1");
  assert.equal(key, "mac/w1/t1");
  assert.equal(QueueMemory.key("mac", "w1", null), null);
  const items = [{ id: "a", text: "uno", attachments: [] }, { id: "b", text: "dos", attachments: ["/x.png"] }];
  memory.set(key, items);
  assert.deepEqual(memory.get(key), items);
  assert.deepEqual(memory.get(QueueMemory.key("mac", "w1", "t2")), []);
  memory.set(key, []);
  assert.deepEqual(memory.get(key), []);
  // Sin tarea (la tarea nueva) no se guarda nada.
  memory.set(null, items);
  assert.deepEqual(memory.get(null), []);
});

test("«Detener y enviar» pone el elegido primero y el resto conserva su orden", () => {
  const items = [{ id: "a", text: "1", attachments: [] }, { id: "b", text: "2", attachments: [] }, { id: "c", text: "3", attachments: [] }];
  assert.deepEqual(promote(items, "c").map((q) => q.id), ["c", "a", "b"]);
  assert.deepEqual(promote(items, "zz").map((q) => q.id), ["a", "b", "c"]);
});
