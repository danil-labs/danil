import type { Machine as FleetMachine } from "../../../ui/src/lib/machine.ts";

/** What an engine announces in `status.service_features` for `get_turn`, `stop_turn_if` and its queue. */
export const QUEUE_FEATURE = "chat_queue_v1";
/** Only an engine with its queue dispatch switched on announces it. */
export const QUEUE_DISPATCH_FEATURE = "chat_queue_dispatch_v1";

export type Route = { headers: Record<string, string> } | undefined;
/** A task and the envelope of its machine (`conversationScope` in `App.tsx`). */
export type EngineScope = { project: string; session: string; route?: Route };
export type Machine = Pick<FleetMachine, "id" | "local" | "features">;
export type { QueueScope } from "../../../ui/src/lib/queue.ts";
