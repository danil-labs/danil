/**
 * Configuración › Máquinas › Linux en esta Mac (`features/machines/LimaMachine.tsx`):
 * las VMs de Lima con su estado y arquitectura, las de Colima aparte, Conectar
 * solo con la VM encendida, y sin `limactl` el comando para copiar.
 * Monta `dist/` con el IPC simulado de la ventana.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { open, until } from "../helpers/desktop-account.mjs";

const guest = (id, state, extra = {}) => ({ channel: "lima", id, label: id, state, state_raw: state, arch: "aarch64", detail: "vz", default: false, system: false, ...extra });
const GUESTS = [guest("danil-test", "running"), guest("vieja", "stopped", { arch: "x86_64" }), guest("colima", "stopped", { system: true })];
const JOB = { id: "j1", channel: "lima", kind: "connect", target: "danil-test", label: "danil-test", user: null, step: "check", done: null, total: null, speed: null, paused: false, lines: [], error: null, finished: false, started_at: 1, mounts: 0 };

async function machines(name, extra) {
  const opened = await open(name, { extra: { guest_channels: ["lima"], guest_children: [], guest_job: null, ...extra } });
  const w = opened.app.w;
  w.dispatchEvent(new w.CustomEvent("harness:open-settings", { detail: "machines" }));
  return opened;
}

test("Linux en esta Mac lists the Lima VMs, keeps Colima aside and connects only a running VM", async () => {
  const connects = [];
  const { doc, native } = await machines("lima-machine-list", {
    guest_list: GUESTS,
    guest_connect: (args) => {
      connects.push(args);
      return JOB;
    },
  });
  assert.ok(await until(() => doc.querySelector('[data-lima="ok"]')), "the block reads the list");
  assert.equal(native("guest_list")[0]?.args?.channel, "lima");
  const running = doc.querySelector('[data-lima-guest="danil-test"]');
  assert.ok(running.textContent.includes("En ejecución") && running.textContent.includes("aarch64"), running.textContent);
  const stopped = doc.querySelector('[data-lima-guest="vieja"]');
  assert.equal(stopped.querySelector("[data-lima-connect]"), null, "a stopped VM is not connected");
  assert.ok(stopped.textContent.includes("Enciéndela para conectarla"), stopped.textContent);
  assert.equal(doc.querySelector('[data-lima-guest="colima"]'), null, "Colima is not offered");
  assert.ok(doc.querySelector("[data-lima-system]").textContent.includes("colima"));

  running.querySelector('[data-lima-connect="danil-test"]').click();
  assert.ok(await until(() => connects.length === 1));
  assert.equal(connects[0].channel, "lima");
  assert.equal(connects[0].guest, "danil-test");
  assert.ok(await until(() => doc.querySelector('[data-lima-job="check"]')), "the job shows its progress");
  assert.ok(doc.querySelector('[data-lima-mounts="0"]').textContent.includes("no ve carpetas"));
});

test("Without limactl the block offers the brew command to copy, inside the block", async () => {
  const { doc } = await machines("lima-machine-missing", { guest_list: () => Promise.reject({ code: "lima_missing", detail: "limactl" }) });
  assert.ok(await until(() => doc.querySelector('[data-lima="missing"]')), "lima_missing becomes its own card");
  const card = doc.querySelector("[data-lima-missing]");
  assert.ok(card.textContent.includes("brew install lima"), card.textContent);
  assert.ok(card.querySelector("[data-lima-copy]"), "the command can be copied");
});

test("A connection that stops at an enrolled engine says so in the block", async () => {
  const failed = { ...JOB, finished: true, step: "check", error: { code: "enrolled", detail: "machines status: Some(0)" } };
  const { doc } = await machines("lima-machine-enrolled", { guest_list: GUESTS, guest_job: failed });
  assert.ok(await until(() => doc.querySelector('[data-lima-failure="enrolled"]')));
  assert.ok(doc.querySelector('[data-lima-problem="enrolled"]').textContent.includes("conectado a una cuenta"));
});
