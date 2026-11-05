/**
 * Qué enseña Configuración › Cuentas de IA mientras llega `list_surfaces`. El panel
 * nunca queda en blanco: cargando, el fallo con su salida, o los agentes que Danil
 * sabe instalar cuando la máquina todavía no trae ninguno.
 */
import type { Failure } from "../../lib/failure.ts";

/** Los agentes en la nube que se ofrecen sin lista de la máquina; ids de `agents::AGENTS`. */
export const SUPPORTED_AGENTS = ["claude", "codex", "antigravity", "grok"] as const;

export type SurfacesState = { k: "loading" } | { k: "ready" } | { k: "failed"; f: Failure };

export type AIProvidersView = "loading" | "failed" | "supported" | "list";

/** Con filas, siempre la lista: un refresco que falla no borra lo que ya se ve. */
export function aiProvidersView(state: SurfacesState, rows: number): AIProvidersView {
  if (rows > 0) return "list";
  if (state.k === "loading") return "loading";
  if (state.k === "failed") return "failed";
  return "supported";
}
