import { listen } from "../../../../host/src/serviceEvents.ts";
import { createEffect, createSignal, onCleanup } from "solid-js";
import { invoke } from "../../../../engine-client/src/client.ts";
import type { HandlerStatus, HandlerStatusRow } from "../../../../ui/src/lib/model";

type PresenceCacheEntry = {
  rows: () => HandlerStatusRow[];
  setRows: (r: HandlerStatusRow[]) => void;
  refs: number;
};
const cache = new Map<string, PresenceCacheEntry>();
let listenerAttached = false;

async function reload(project: string) {
  const entry = cache.get(project);
  if (!entry) return;
  try {
    entry.setRows(await invoke<HandlerStatusRow[]>("list_agent_status", { project }));
  } catch {
  }
}

function ensureListener() {
  if (listenerAttached) return;
  listenerAttached = true;
  void listen<{ kind: string }>("chat", (e) => {
    if (e.payload.kind !== "presence") return;
    for (const project of cache.keys()) void reload(project);
  });
}

export function watchHandlerStatuses(project: string) {
  ensureListener();
  let entry = cache.get(project);
  if (!entry) {
    const [rows, setRows] = createSignal<HandlerStatusRow[]>([]);
    entry = { rows, setRows, refs: 0 };
    cache.set(project, entry);
    void reload(project);
  }
  entry.refs++;
  const retained = entry;
  onCleanup(() => {
    retained.refs--;
    if (retained.refs <= 0) cache.delete(project);
  });
  return entry.rows;
}

export function watchHandlerStatus(
  selectedHandler: () => { project: string; name: string } | null,
): () => HandlerStatus {
  const [status, setStatus] = createSignal<HandlerStatus>("asleep");
  createEffect(() => {
    const q = selectedHandler();
    if (!q) {
      setStatus("asleep");
      return;
    }
    // Crear la suscripción en este efecto permite soltar el proyecto al cambiar de agente.
    const rows = watchHandlerStatuses(q.project);
    createEffect(() =>
      setStatus(rows().find((r) => r.name === q.name)?.status ?? "asleep"),
    );
  });
  return status;
}
