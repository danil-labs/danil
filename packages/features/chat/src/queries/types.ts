// Lo que el chat recibe del shell por `deps` (R3): los puertos que declara el chat y los tipos compartidos de `packages/ui`.
import type { createThreadsStore } from "./threads-store.ts";

export type * from "../model/ports.ts";
export type { CarriedBase, CarryCheck } from "../../../../ui/src/lib/carry.ts";
export type { DefaultPermissionModeChange } from "../../../../ui/src/lib/default-permission-mode.ts";
export type { Draft } from "../../../../ui/src/lib/draft.ts";
export type { ConversationScope } from "../../../../ui/src/lib/handoff.ts";
export type { PickedAt } from "../../../../ui/src/lib/picked-at.ts";
export type { SearchFilter } from "../../../../ui/src/lib/search-filter.ts";
export type { ServicePage } from "../../../../ui/src/lib/service-page.ts";
export type { SessionRow } from "../../../../ui/src/lib/session-row.ts";
export type { InicioDeCarpeta } from "../../../../ui/src/lib/workdirKind.ts";
export type { Startup } from "../../../../ui/src/lib/workspace-startup.ts";
export type { createThreadsStore };
export type Hilo = ReturnType<ReturnType<typeof createThreadsStore>["current"]>;
export type MachineWait = ReturnType<ReturnType<typeof createThreadsStore>["machineWaits"]>[string];
export type ReadErrorToken = { readonly workspace: string | null; readonly generation: number; readonly wakeEpoch: number; readonly starting: boolean; readonly seq: number };
export type ScopedReadErrorSetter = import("solid-js").Setter<string | null> & { begin: () => ReadErrorToken; setFor: (token: ReadErrorToken, value: string | null) => void };
