import assert from "node:assert/strict";
import { test } from "node:test";
import { machineToComputer, RelaySession, type SocketLike } from "@terminus/computers";
import { Fleet, type MachineInfo } from "@terminus/fleet";
import { cloudInfo, cloudLink } from "../../src/features/machines/cloud-machines.ts";

/**
 * La máquina de la organización apagada por inactividad, como la ve Desk: el relay no emite
 * ticket (`409 machine_unreachable`) hasta que su motor conecta, y el canal no enciende nada.
 * Un mensaje tiene que encenderla por `POST /v1/machines/{id}/start` y salir una vez.
 */
function stoppedCloudMachine() {
  let running = false;
  const starts: string[] = [];
  const delivered: string[] = [];
  const factory = (_url: string, protocols?: string[]): SocketLike => {
    const socket: SocketLike = {
      readyState: 0,
      protocol: protocols?.[0],
      send(data: string) {
        const frame = JSON.parse(data) as { type: string; id?: string; command?: string };
        if (frame.type !== "call") return;
        delivered.push(frame.command ?? "");
        setTimeout(() => socket.onmessage?.({ data: JSON.stringify({ type: "result", id: frame.id, value: "ok" }) }), 1);
      },
      close() { socket.readyState = 3; },
      onopen: null, onmessage: null, onclose: null, onerror: null,
    };
    setTimeout(() => {
      socket.readyState = 1;
      socket.onopen?.({});
      socket.onmessage?.({ data: JSON.stringify({ type: "state", state: "online" }) });
    }, 1);
    return socket;
  };
  const row = { machine_id: "mch_org", name: "Danil", state: "stopped", connection: "disconnected" };
  const relay = new RelaySession({
    endpoint: "https://edge.danil.ai/v1",
    computerId: row.machine_id,
    getAdmission: async () => {
      if (!running) throw new Error("error");
      return { url: "wss://connect.danil.ai/v1/machines/mch_org/session", ticket: "tkt", protocol: "danil.machine-session.v1", session_expires_at: null };
    },
  }, factory);
  const computer = machineToComputer(row);
  const info: MachineInfo = cloudInfo({ id: row.machine_id, name: "Danil", wakes: computer.wakeable === true });
  const fleet = new Fleet({
    self: "local",
    connect: () => cloudLink(relay, () => computer.state),
    wake: async (id) => {
      starts.push(id);
      running = true;
      return true;
    },
    deadlines: { intent: 3_000, action: 3_000, read: 3_000 },
  });
  fleet.setMachines([info]);
  return { fleet, starts, delivered, close: () => fleet.close() };
}

test("Desk: un mensaje a la máquina de la organización apagada la enciende por el plano de control y se entrega una vez", async () => {
  const m = stoppedCloudMachine();
  try {
    assert.equal(m.fleet.power("mch_org"), "off", "antes de que el canal diga nada vale su fila: apagada, no «encendida»");
    await m.fleet.call({ machine: "mch_org", workspace: "w", command: "send_message", args: { project: "p1", session: null } });
    assert.deepEqual(m.starts, ["mch_org"]);
    assert.deepEqual(m.delivered, ["send_message"]);
    assert.equal(m.fleet.power("mch_org"), "on");
  } finally {
    m.close();
  }
});
