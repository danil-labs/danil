import { activityMessageKind, type ActivityObservationKind } from "./activityObservation.ts";
import { narrateStep, reasoningHeadline, withEllipsis } from "./activityNarration.ts";
import { t } from "../../../../ui/src/lib/i18n.ts";
import { pasoDe, rotuloDeFila, type Paso } from "../../../../ui/src/lib/steps.ts";
import type { Msg, Razonamiento } from "./messageTypes.ts";
import type { TurnOutcome } from "./turnActivity.ts";

export type ActivityAction =
  | { kind: "step"; step: Paso }
  | { kind: "thinking"; detail?: string }
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
    case "thinking": {
      const detail = reasoningHeadline(message.razonamiento, { latest: true, allowSentence: true });
      return detail ? { kind, detail } : { kind };
    }
    case "responding": return { kind };
    default: return null;
  }
}

export function presentActivity(input: {
  active: boolean;
  outcome?: TurnOutcome;
  stopping?: boolean;
  blocked?: boolean;
  paused?: boolean;
  duration?: string | null;
  action?: ActivityAction | null;
  reasoning?: readonly Razonamiento[];
  runningSteps?: number;
  label?: string;
}): { label: string; animate: boolean } {
  if (!input.active) {
    if (input.outcome === "failed") return { label: t("chat.activity.before_error"), animate: false };
    if (input.outcome === "interrupted") return { label: t("chat.work.title"), animate: false };
    return { label: input.duration ? t("chat.work.duration", { duration: input.duration }) : t("chat.work.title"), animate: false };
  }
  if (input.stopping) return { label: t("chat.turn.stopping"), animate: false };
  const animate = !input.blocked && !input.paused;
  if (input.blocked) return { label: t("chat.activity.title"), animate: false };
  const action = input.action;
  if (!action) return { label: input.label ?? t("chat.activity.preparing"), animate };
  const thinkingLabel = (detail?: string) => {
    const headline = detail ?? reasoningHeadline(input.reasoning, { latest: true, allowSentence: true });
    return headline ? withEllipsis(headline) : t("chat.reasoning.thinking");
  };
  switch (action.kind) {
    case "step": {
      if (!action.step.corriendo) return { label: thinkingLabel(), animate };
      const narrated = narrateStep(action.step, { live: true });
      const base = narrated ?? (() => {
        const row = rotuloDeFila({ clase: action.step.clase, pasos: [action.step] });
        return [row.verbo, row.sujeto].filter(Boolean).join(" ");
      })();
      const extra = (input.runningSteps ?? 0) > 1 ? ` (+${input.runningSteps! - 1})` : "";
      return { label: `${base}${extra}`, animate };
    }
    case "thinking": return { label: thinkingLabel(action.detail), animate };
    case "responding": return { label: t("chat.activity.responding"), animate };
    case "delegated": return { label: t("chat.activity.delegated", { title: action.title }), animate };
  }
}
