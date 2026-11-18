import { activityMessageKind, type ActivityObservationKind } from "../../lib/activityObservation.ts";
import { t } from "../../lib/i18n.ts";
import { pasoDe, rotuloDeFila, type Paso } from "../../lib/steps.ts";
import type { Msg } from "./messageTypes.ts";

export type ActivityAction =
  | { kind: "step"; step: Paso }
  | { kind: "thinking" }
  | { kind: "responding" }
  | { kind: "delegated"; title: string };

/** Tool completion returns to model work; a parallel tool still running takes precedence. */
export function currentActivityAction(latest: ActivityAction | null | undefined, steps: readonly Paso[]): ActivityAction | null {
  if (latest?.kind !== "step" || latest.step.corriendo) return latest ?? null;
  for (let index = steps.length - 1; index >= 0; index--) {
    const step = steps[index];
    if (step?.corriendo) return { kind: "step", step };
  }
  return { kind: "thinking" };
}

/** The projection supplies the actual last update, including edits to older native messages. */
export function observedActivityAction(message: Msg | null | undefined, observedKind?: ActivityObservationKind | null): ActivityAction | null {
  if (!message) return null;
  const kind = observedKind ?? activityMessageKind(message);
  switch (kind) {
    case "step": return { kind, step: message.paso ?? pasoDe(message.text) };
    case "delegated": return message.fromTask ? { kind, title: message.fromTask.title } : null;
    case "thinking": return { kind };
    case "responding": return { kind };
    default: return null;
  }
}

export function presentActivity(input: {
  active: boolean;
  stopping?: boolean;
  blocked?: boolean;
  paused?: boolean;
  duration?: string | null;
  action?: ActivityAction | null;
  label?: string;
}): { label: string; animate: boolean } {
  if (!input.active) return { label: input.duration ? t("chat.work.duration", { duration: input.duration }) : t("chat.work.title"), animate: false };
  if (input.stopping) return { label: t("chat.work.title"), animate: false };
  const animate = !input.blocked && !input.paused;
  if (input.blocked) return { label: t("chat.activity.title"), animate: false };
  const action = input.action;
  if (!action) return { label: input.label ?? t("chat.activity.preparing"), animate };
  switch (action.kind) {
    case "step": {
      if (!action.step.corriendo) return { label: t("chat.reasoning.thinking"), animate };
      const row = rotuloDeFila({ clase: action.step.clase, pasos: [action.step] });
      return { label: [row.verbo, row.sujeto].filter(Boolean).join(" "), animate };
    }
    case "thinking": return { label: t("chat.reasoning.thinking"), animate };
    case "responding": return { label: t("chat.activity.responding"), animate };
    case "delegated": return { label: t("chat.activity.delegated", { title: action.title }), animate };
  }
}
