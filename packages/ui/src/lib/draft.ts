import type { Recipient } from "./recipients.ts";
import type { TaskMention } from "./taskMentions";

export type HandoverPending = { from: string; to: string };

export type HistoryEntry = { text: string; task_mentions?: TaskMention[]; recipients?: Recipient[] };
export type DraftConfiguration = { agent: string; surface: string; model: string; effort: string; mode?: string };
export type Draft = {
  input: string;
  task_mentions?: TaskMention[];
  recipients?: Recipient[];
  mentionHistory?: HistoryEntry[];
  mentionFuture?: HistoryEntry[];
  sourceIds: string[];
  excludedSourceIds: string[];
  archivos: string[];
  configuration?: DraftConfiguration;
  provider?: HandoverPending;
};
