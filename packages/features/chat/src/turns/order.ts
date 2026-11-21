/**
 * Utilidades de orden causal para piezas y bloques dentro de un turno (B-015).
 *
 * Mantiene la correspondencia causal entre razonamiento (thinking), deltas de texto,
 * llamadas a herramientas y salidas de shell.
 */

import type { TurnPiece, ReasoningPiece, DeltaPiece, ToolPiece, ShellPiece } from "./machine.ts";

/**
 * Agrupa y consolida deltas continuos preservando el orden relativo de herramientas
 * y bloques de pensamiento intermedios.
 */
export function compactPieces(pieces: readonly TurnPiece[]): TurnPiece[] {
  const result: TurnPiece[] = [];

  for (const piece of pieces) {
    const prev = result[result.length - 1];

    if (piece.kind === "delta" && prev && prev.kind === "delta") {
      result[result.length - 1] = {
        ...prev,
        text: (prev as DeltaPiece).text + (piece as DeltaPiece).text,
      };
      continue;
    }

    if (piece.kind === "reasoning" && prev && prev.kind === "reasoning" && !(prev as ReasoningPiece).completed) {
      result[result.length - 1] = {
        ...prev,
        text: (prev as ReasoningPiece).text + (piece as ReasoningPiece).text,
        durationMs: (piece as ReasoningPiece).durationMs ?? (prev as ReasoningPiece).durationMs,
      };
      continue;
    }

    result.push(piece);
  }

  return result;
}

/**
 * Extrae todo el texto acumulado de los bloques de delta en un turno.
 */
export function extractTurnText(pieces: readonly TurnPiece[]): string {
  return pieces
    .filter((p): p is DeltaPiece => p.kind === "delta")
    .map((p) => p.text)
    .join("");
}

/**
 * Retorna si un turno contiene herramientas activas o en ejecución.
 */
export function hasRunningTools(pieces: readonly TurnPiece[]): boolean {
  return pieces.some(
    (p) => (p.kind === "tool" && (p as ToolPiece).status === "running") ||
           (p.kind === "shell" && (p as ShellPiece).status === "running"),
  );
}
