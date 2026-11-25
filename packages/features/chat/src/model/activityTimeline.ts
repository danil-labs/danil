import { pasoDe, pasoDePermiso, type Paso } from "../../../../ui/src/lib/steps.ts";
import type { Msg, Razonamiento } from "./messageTypes.ts";

export type ActivityTimelineItem =
  | { kind: "steps"; pasos: Paso[] }
  | { kind: "reasoning"; bloques: Razonamiento[] };

function stepOfMessage(message: Msg): Paso | null {
  if (message.shell) return null;
  if (message.permission) {
    return pasoDePermiso(
      message.permission.tool,
      message.permission.target ?? null,
      message.permission.allow,
      message.encargado ?? message.fromTask?.title,
    );
  }
  if (message.paso) return message.paso;
  if (message.role === "system" && message.meta === "usó") return pasoDe(message.text);
  return null;
}

/**
 * Construye la secuencia cronológica real de pasos y razonamientos tal como
 * ocurrieron durante el turno, sin empujar todo el razonamiento al final.
 */
export function buildActivityTimeline(
  messages: readonly Msg[] | undefined,
  fallbackSteps: readonly Paso[],
  fallbackReasoning: readonly Razonamiento[] | undefined,
): ActivityTimelineItem[] {
  const items: ActivityTimelineItem[] = [];
  const pushStep = (paso: Paso) => {
    const last = items.at(-1);
    if (last?.kind === "steps") last.pasos.push(paso);
    else items.push({ kind: "steps", pasos: [paso] });
  };
  const pushReasoning = (bloques: readonly Razonamiento[]) => {
    if (!bloques.length) return;
    const last = items.at(-1);
    if (last?.kind === "reasoning") last.bloques.push(...bloques);
    else items.push({ kind: "reasoning", bloques: [...bloques] });
  };

  if (messages?.length) {
    for (const message of messages) {
      if (message.razonamiento?.length) pushReasoning(message.razonamiento);
      const step = stepOfMessage(message);
      if (step) pushStep(step);
    }
    if (items.length > 0) return items;
  }

  if (fallbackReasoning?.length) pushReasoning(fallbackReasoning);
  for (const step of fallbackSteps) pushStep(step);
  return items;
}
