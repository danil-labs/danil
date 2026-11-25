import { savedActivityTurn } from "./activityAnchor.ts";
import type { Msg, Razonamiento } from "./messageTypes.ts";

/**
 * Reconciliación no destructiva al cerrar un turno (`done` → `load_session`).
 *
 * El disco no persiste `detalle` de herramientas (stdout/diffs) y algunos
 * proveedores no persisten `pieces` intermedios ni todo el razonamiento.
 * Al sellar el turno, conservamos esa información ya observada en vivo sobre
 * la cola recién persistida, sin duplicar nada cuando el disco ya la trae.
 */
export function sealLiveIntoBase(
  previousBase: readonly Msg[],
  previousLive: readonly Msg[],
  incomingBase: readonly Msg[],
): Msg[] {
  if (!previousLive.length || !incomingBase.length) return [...incomingBase];

  const knownTurns = new Set(
    previousBase.map(savedActivityTurn).filter((id): id is string => Boolean(id)),
  );
  let tailStart = incomingBase.length;
  for (let i = incomingBase.length - 1; i >= 0; i--) {
    const id = savedActivityTurn(incomingBase[i]);
    if (id && knownTurns.has(id)) break;
    tailStart = i;
  }
  if (tailStart >= incomingBase.length) return [...incomingBase];

  const prefix = incomingBase.slice(0, tailStart);
  let tail = incomingBase.slice(tailStart);

  // 1. Conservar `detalle` (stdout/diffs) y `mcpApp` rico de los pasos vivos.
  const liveSteps = previousLive.filter((m) => Boolean(m.paso && (m.paso.detalle || m.paso.mcpApp)));
  if (liveSteps.length > 0) {
    const used = new Set<number>();
    tail = tail.map((msg) => {
      const paso = msg.paso;
      if (!paso || (paso.detalle && paso.mcpApp)) return msg;
      const matchIndex = liveSteps.findIndex((live, index) => {
        if (used.has(index) || !live.paso) return false;
        return live.paso.nombre === paso.nombre && (live.paso.objetivo ?? null) === (paso.objetivo ?? null);
      });
      if (matchIndex < 0) return msg;
      used.add(matchIndex);
      const livePaso = liveSteps[matchIndex].paso!;
      return {
        ...msg,
        paso: {
          ...paso,
          detalle: paso.detalle ?? livePaso.detalle,
          mcpApp: paso.mcpApp ?? livePaso.mcpApp,
        },
      };
    });
  }

  // 2. Conservar razonamiento vivo si el turno guardado lo omitió.
  const liveReasoning: Razonamiento[] = previousLive.flatMap((m) => m.razonamiento ?? []);
  const diskHasReasoning = tail.some((m) => Boolean(m.razonamiento?.length));
  if (liveReasoning.length > 0 && !diskHasReasoning) {
    let agentIdx = -1;
    for (let i = tail.length - 1; i >= 0; i--) {
      if (tail[i].role === "agent") { agentIdx = i; break; }
    }
    if (agentIdx >= 0) {
      tail = tail.map((msg, i) => (i === agentIdx ? { ...msg, razonamiento: liveReasoning } : msg));
    }
  }

  // 3. Opción B: conservar salidas intermedias visibles emitidas en vivo si el
  //    disco no persistió `pieces` y solo devolvió la respuesta final.
  const liveAgentTexts = previousLive.filter((m) => m.role === "agent" && m.text.trim().length > 0);
  const diskAgentTexts = tail.filter((m) => m.role === "agent" && m.text.trim().length > 0);
  if (liveAgentTexts.length >= 2 && diskAgentTexts.length === 1) {
    const finalAgentIndex = tail.findIndex((m) => m === diskAgentTexts[0]);
    const finalAgent = tail[finalAgentIndex];
    const finalNormalized = normalizeText(finalAgent.text);
    const missing = liveAgentTexts.slice(0, -1).filter((live) => {
      const snippet = normalizeText(live.text);
      return snippet.length > 0 && !finalNormalized.includes(snippet);
    });
    if (missing.length > 0) {
      const turnId = finalAgent.turno ?? savedActivityTurn(finalAgent) ?? "sealed";
      const preserved: Msg[] = missing.map((live, index) => ({
        ...live,
        turno: undefined,
        avanceDe: finalAgent.turno,
        clave: `${turnId}:live:${index}`,
        author: live.author ?? finalAgent.author,
        agent: live.agent ?? finalAgent.agent,
        razonamiento: undefined,
      }));
      tail = [
        ...tail.slice(0, finalAgentIndex),
        ...preserved,
        ...tail.slice(finalAgentIndex),
      ];
    }
  }

  return [...prefix, ...tail];
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
