import type { TurnActivity } from "./turnActivity.ts";
export type ActivityObservationKind = "step" | "thinking" | "responding" | "delegated";

export type ObservedTurnActivity<Message> = TurnActivity<Message> & {
  readonly observation?: { readonly kind: ActivityObservationKind; readonly message: Message } | null;
};

type ObservableActivityMessage = {
  role: "user" | "agent" | "system";
  text: string;
  shell?: unknown;
  paso?: unknown;
  meta?: string;
  fromTask?: { task: string; title: string } | null;
  razonamiento?: readonly { text: string }[];
};

/** Inspect semantic deltas, so a late update to an old native ID can be the newest action. */
export function observedActivityUpdate(message: ObservableActivityMessage, previous?: ObservableActivityMessage): ActivityObservationKind | null {
  if (message.shell || message.role === "user") return null;
  if (message.paso) return !previous || message.paso !== previous.paso ? "step" : null;
  if (message.meta === "task_launched") return !previous || message.fromTask?.task !== previous.fromTask?.task ? "delegated" : null;
  if (message.role === "system") return message.meta === "usó" && (!previous || message.text !== previous.text) ? "step" : null;
  const reasoningChanged = message.razonamiento?.some((block, index) => block.text !== previous?.razonamiento?.[index]?.text);
  if (reasoningChanged && (previous || !message.text)) return "thinking";
  return message.text && message.text !== previous?.text ? "responding" : null;
}

/** A recovered message has no locally observed delta; its type can only be a fallback. */
export function activityMessageKind(message: ObservableActivityMessage): ActivityObservationKind | null {
  return observedActivityUpdate(message);
}

