/**
 * Configuración › Máquinas › Linux en esta Mac (`features/machines/LimaMachine.tsx`):
 * las VMs de Lima con su estado y arquitectura, las de Colima aparte, Conectar
 * solo con la VM encendida, sin `limactl` el comando para copiar, y sin VMs
 * los comandos para crear una (Danil no la crea).
 * Monta `dist/` con el IPC simulado de la ventana.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { open, until } from "../helpers/desktop-account.mjs";

const guest = (id, state, extra = {}) => ({ channel: "lima", id, label: id, state, state_raw: state, arch: "aarch64", detail: "vz", default: false, system: false, ...extra });
const GUESTS = [guest("danil-test", "running"), guest("vieja", "stopped", { arch: "x86_64" }), guest("colima", "stopped", { system: true })];
const JOB = { id: "j1", channel: "lima", kind: "connect", target: "danil-test", label: "danil-test", user: null, step: "check", done: null, total: null, speed: null, paused: false, lines: [], error: null, finished: false, started_at: 1, mounts: 0 };

async function machines(name, extra, options = {}) {
  const opened = await open(name, { ...options, extra: { guest_channels: ["lima"], guest_children: [], guest_job: null, ...extra } });
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

const SIGNED_OUT = { status: { state: "disconnected" }, token: null };

test("Without a Danil account the block still shows: an old engine with one session", async () => {
  const { doc } = await machines("lima-machine-no-account-single", { guest_list: GUESTS }, SIGNED_OUT);
  assert.ok(await until(() => doc.querySelector('[data-lima="ok"]')), "Linux en esta Mac without signing in");
  assert.ok(doc.querySelector('[data-lima-guest="danil-test"]'));
});

test("Without a Danil account the block still shows: an engine with sessions and an unlinked workspace", async () => {
  const { doc } = await machines(
    "lima-machine-no-account-sessions",
    { guest_list: GUESTS, danil_sessions: [], danil_workspace_account: () => ({ account: null, email: null, signed_in: false, linked: false }) },
    SIGNED_OUT,
  );
  assert.ok(await until(() => doc.querySelector('[data-danil-account="workspace"]')), "the workspace panel");
  assert.ok(await until(() => doc.querySelector('[data-lima="ok"]')), "Linux en esta Mac without signing in");
});

test("A late guest_channels answer still paints the block in an open Configuración", async () => {
  let answer;
  const late = new Promise((resolve) => {
    answer = resolve;
  });
  const { doc } = await machines("lima-machine-late-channels", { guest_list: GUESTS, guest_channels: () => late });
  assert.ok(await until(() => doc.querySelector("[data-danil-account]")), "Configuración is open");
  assert.equal(doc.querySelector("[data-lima]"), null, "no block before the window answers");
  answer(["lima"]);
  assert.ok(await until(() => doc.querySelector('[data-lima="ok"]')), "the block appears with the answer");
});

test("With only Colima VMs the block says there are none and offers the commands to create one, without a create button", async () => {
  const { doc, native } = await machines("lima-machine-no-vms", { guest_list: [guest("colima", "stopped", { system: true })] });
  assert.ok(await until(() => doc.querySelector("[data-lima-empty]")), "the empty state");
  const commands = [...doc.querySelectorAll("[data-lima-empty] [data-lima-command]")].map((c) => c.textContent);
  assert.deepEqual(commands, ["limactl create --name=danil --mount-none --containerd=none template:ubuntu-lts", "limactl start danil"]);
  assert.equal(doc.querySelectorAll("[data-lima-empty] [data-lima-copy]").length, 2, "each one can be copied");
  assert.equal(doc.querySelector("[data-lima-create]"), null, "Danil does not create VMs");
  assert.equal(native("lima_create").length, 0);
  assert.ok(doc.querySelector("[data-lima-system]").textContent.includes("colima"));
});

test("A connected Lima VM says it is used from this Mac, not this PC", async () => {
  const child = { id: "lima:danil-test", channel: "lima", distro: "danil-test", name: "danil-test", user: "u", home: "/home/u", online: true, features: [], contract: null, version: "0.3.1" };
  const { doc } = await machines("lima-machine-box-scope", { guest_list: GUESTS, guest_children: [child], guest_call: ({ command }) => (command === "list_surfaces" ? [] : null) });
  assert.ok(await until(() => doc.querySelector('[data-wsl-box="danil-test"] [data-box-scope]')), "the connected box with «Más opciones»");
  const scope = doc.querySelector('[data-wsl-box="danil-test"] [data-box-scope]').textContent;
  assert.equal(scope, "Solo se usa desde esta Mac o pasando por ella.");
  assert.ok(!scope.includes("PC"), scope);
});
