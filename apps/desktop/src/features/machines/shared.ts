/**
 * Máquinas de la organización en el menú «Ejecutar en». Viven aparte de
 * `machines()`: esa lista es el destino de las tareas, y una compartida no lo es.
 * El encendido se pide al plano de control; la fila no se elige.
 */
import { type Answer, listSharedComputers, type SharedComputer, startSharedComputer } from "@terminus/computers";
import { createRoot, createSignal } from "solid-js";
import { invoke } from "../../lib/invoke";
import { capabilities } from "../../lib/platform";

const [sharedMachines, setSharedMachines] = createRoot(() => createSignal<SharedComputer[]>([]));
const [sharedNotice, setSharedNotice] = createRoot(() => createSignal<string | null>(null));
const [sharedBusy, setSharedBusy] = createRoot(() => createSignal<string | null>(null));

export { sharedBusy, sharedMachines, sharedNotice };

function desktopSource(): NonNullable<ReturnType<typeof capabilities>["sharedComputers"]> | null {
  if (!capabilities().danilAccount) return null;
  return {
    list: async () => {
      const client = await invoke<{ token: string; endpoint: string }>("account_relay_token", {}).catch(() => null);
      return client ? listSharedComputers(client.endpoint, client.token) : { kind: "error", status: null };
    },
    start: async (id) => {
      const client = await invoke<{ token: string; endpoint: string }>("account_relay_token", {}).catch(() => null);
      return client ? startSharedComputer(client.endpoint, client.token, id) : { kind: "error", status: null };
    },
  };
}

function source() {
  return capabilities().sharedComputers ?? desktopSource();
}

let generation = 0;

/** Vuelve a leer el encendido. Un fallo de red deja la lista anterior. */
export async function refetchSharedMachines() {
  const turn = ++generation;
  const client = source();
  if (!client) {
    if (turn === generation) setSharedMachines([]);
    return;
  }
  const answer = await client.list().catch(() => ({ kind: "error", status: null }) as Answer<SharedComputer[]>);
  if (turn !== generation) return;
  if (answer.kind === "ok") setSharedMachines(answer.value);
  else if (answer.kind === "unauthorized" || answer.kind === "no_account") setSharedMachines([]);
}

function replace(id: string, next: SharedComputer) {
  setSharedMachines((rows) => rows.map((row) => (row.computer_id === id ? next : row)));
}

/** Enciende una compartida. El menú sigue abierto para mostrar el estado nuevo. */
export async function startSharedMachine(id: string, notice: { license: string; denied: string; stopping: string; failed: string }) {
  const client = source();
  if (!client || sharedBusy()) return;
  const turn = ++generation;
  setSharedBusy(id);
  setSharedNotice(null);
  try {
    const answer = await client.start(id).catch(() => ({ kind: "error", status: null }) as Answer<SharedComputer>);
    if (turn !== generation) return;
    if (answer.kind === "ok") {
      replace(id, answer.value);
      return;
    }
    if (answer.kind === "missing") {
      setSharedMachines((rows) => rows.filter((row) => row.computer_id !== id));
      return;
    }
    if (answer.kind === "license") {
      setSharedNotice(notice.license);
      return;
    }
    if (answer.kind === "error" && answer.code === "access_denied") {
      setSharedNotice(notice.denied);
      return;
    }
    if (answer.kind === "error" && answer.code === "computer_stopping") {
      setSharedMachines((rows) => rows.map((row) => (row.computer_id === id ? { ...row, power: "stopping" } : row)));
      setSharedNotice(notice.stopping);
      return;
    }
    setSharedNotice(notice.failed);
  } finally {
    setSharedBusy(null);
  }
}
