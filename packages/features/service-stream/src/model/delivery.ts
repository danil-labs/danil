import type { JournalEvent } from "../../../../../apps/desktop/src/lib/serviceEvents";
import type { PushedBatch } from "../queries/store.ts";

type StreamPayload = { session?: string; kind?: string; workspace?: string };

const REPUESTO = new Set(["delta", "reasoning", "tool", "tool_done", "command_output", "command_running", "shell_started", "shell_output", "image", "retry", "notice", "task_launched", "segment_saved"]);
/** One journal delivery policy for native catchup and relayed replay. */
export function createBatchDelivery(deps: { resync: (session: string) => void; replay: (session: string, workspace?: string | null, replayId?: string) => void; deliver: (events: readonly JournalEvent[]) => void }) {
function applyPushed(batches: PushedBatch[]) {
    for (const lote of batches) {
      if (lote.replay) {
        const sessions = new Set((lote.events ?? []).flatMap(event => {
          const payload = event.payload as StreamPayload | null;
          return event.name === "chat" && payload?.session && REPUESTO.has(payload.kind ?? "") ? [payload.session] : [];
        }));
        applyPushed([...sessions].map(catchup => ({ catchup, events: lote.events, replayId: lote.replayId })));
        continue;
      }
      if (lote.resync) {
        deps.resync(lote.resync);
        continue;
      }
      if (lote.catchup) {
        const session = lote.catchup;
        const events = (lote.events ?? []).filter((e) => {
          const payload = e.payload as StreamPayload | null;
          return e.name === "chat" && payload?.session === session && REPUESTO.has(payload.kind ?? "");
        });
        const workspace = (events[0]?.payload as StreamPayload | undefined)?.workspace;
        // Reemplaza lo vivo de la tarea, salvo lo que escribió la persona: el motor no lo repite.
        deps.replay(session, workspace, lote.replayId);
        deps.deliver(events);
        continue;
      }
      // Al mismo oyente y uno a uno, como llegaban de Tauri: lo que agrupa el pintado es del oyente.
      deps.deliver(lote.events ?? []);
    }
  }
  return applyPushed;
}
