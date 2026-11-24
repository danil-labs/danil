/**
 * Consumo de tokens — espejo de `src-tauri/src/runtime/usage.rs`. El contrato es de los
 * dos lados: cuando cambie la struct de Rust, cambia esto.
 */

import { t } from "../../../../apps/desktop/src/lib/i18n.ts";

/**
 * Desglose de un turno.
 *
 * `input_uncached`, `cache_read` y `cache_write` son **sumandos disjuntos**: la
 * entrada total es la suma de los tres. `reasoning` es un **subconjunto de
 * `output`** — no se suma aparte, ya está contado dentro.
 */
type TokenBreakdown = {
  input_uncached: number;
  cache_read: number;
  cache_write: number;
  output: number;
  /** Subconjunto de `output`. Nunca sumar. */
  reasoning: number;
};

/** Una línea del registro: un turno cerrado. */
export type UsageRecord = {
  schema: number;
  at: number;
  /**
   * De qué workspace es el gasto. Vacío en líneas escritas antes de que hubiera
   * workspaces: quien filtre por él trata la cadena vacía como «no se sabe»,
   * no como un id.
   */
  workspace: string;
  provider: string;
  /** `null` hasta que aterricen las cuentas gestionadas. */
  account: string | null;
  /** Con qué modelo corrió el turno, según el agente. `null` si no lo publicó. */
  model: string | null;
  project: string;
  session: string;
  turn: number;
  tokens: TokenBreakdown;
  /** Claude y ACP lo reportan cuando el proveedor incluye el importe. */
  cost_usd: number | null;
  /**
   * Ventana de contexto ocupada al cerrar el turno.
   *
   * **No es la suma del desglose.** Éste reúne todas las peticiones del turno y
   * cada una reenvía la conversación entera; esto es una sola, la última.
   * `null` cuando el agente no publica el prompt de cada petición.
   */
  context_used: number | null;
  /** Cuánto cabe, según el propio agente. `null` si no se sabe el modelo. */
  context_limit: number | null;
  /**
   * Por dónde se supo `context_used` — espejo de `usage::Medida` en Rust.
   *
   * `null` en las líneas escritas antes de que existiera y en las que no tienen
   * ocupación que fechar: las dos son «no se sabe».
   */
  context_source: Medida | null;
  raw: string | null;
};

export type SessionUsage = { records: UsageRecord[] };

/**
 * Por dónde se supo cuánta ventana lleva ocupada — espejo de `usage::Medida`.
 * Dice cuán fresco puede ser el número: lo publicado en el stream se refresca
 * durante el turno; lo escrito en un archivo al terminar, no. No se pinta: es
 * dato del registro, no glosa de pantalla.
 */
type Medida = "stream" | "rollout" | "protocolo";

/**
 * Lo que se sabe de la ventana de contexto de esta conversación. Se llama
 * `Ventana` y no `Contexto` a propósito: «contexto» ya nombra el material que
 * la tarea lee.
 *
 * Son tres estados y no dos: Codex publica cuánto cabe y no publica el tamaño
 * del prompt en ningún evento. Aplanar ese caso obliga a estimar, y una barra
 * estimada se lee igual que una medida.
 */
export type Ventana =
  | { modo: "medido"; usado: number; limite: number; fuente: Medida | null }
  | { modo: "sin-medida"; limite: number }
  | { modo: "sin-limite"; usado: number }
  | null;

/**
 * De cuánta ventana va la conversación, según el último turno registrado. El
 * último, no la suma: cada turno reenvía la conversación entera, así que el
 * último reporte ya es el total. Puede bajar —el agente compacta— sin ser error.
 */
export function ventanaDe(records: UsageRecord[]): Ventana {
  const ultimo = records[records.length - 1];
  if (!ultimo) return null;
  // Antigravity dice lo que lleva y no lo que cabe: se dice el número sin barra.
  if (!ultimo.context_limit) {
    return ultimo.context_used ? { modo: "sin-limite", usado: ultimo.context_used } : null;
  }
  // `undefined` además de `null`: una línea escrita antes de que este campo
  // existiera no trae la clave, y `=== null` la dejaría pasar como medida.
  if (ultimo.context_used == null) return { modo: "sin-medida", limite: ultimo.context_limit };
  return {
    modo: "medido",
    usado: ultimo.context_used,
    limite: ultimo.context_limit,
    fuente: ultimo.context_source ?? null,
  };
}

/** Miles y millones abreviados: la cabecera es estrecha y esto es una escala. */
export function formatTokens(n: number): string {
  if (n >= 1_000_000)
    return t("common.usage.millions", {
      value: +(n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0),
    });
  if (n >= 1_000) return t("common.usage.thousands", { value: Math.round(n / 1_000) });
  return String(n);
}
