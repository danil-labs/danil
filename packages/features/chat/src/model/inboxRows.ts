// Con extensión: se carga también desde `node --test` (ver `failures.ts`).
import { t } from "../../../../../apps/desktop/src/lib/i18n.ts";

/** Saltos que encadena un linaje de despertares (`orchestration::MAX_WAKE_HOPS`). */
export const TOPE_DE_SALTOS = 3;

/**
 * Las filas que Terminus deja en la Bandeja de un agente cuando termina una
 * tarea que lanzó, la línea del turno con que la despierta y la de una
 * respuesta entregada a quien la pidió. Rust las guarda con el informe de la
 * hija como texto, o sin texto, y la frase se compone aquí.
 */
const FILAS = new Set([
  "task_finished",
  "task_finished_read",
  "task_chain_limit",
  "woke_by_tasks",
  "respondido",
  // Una entrega que espera a que el turno termine (`chat::delivery`).
  "delivery_pending",
]);

/** Las filas cuyo texto guardado no es un informe que citar debajo. */
export function citaInforme(meta: string | undefined): boolean {
  return meta !== "woke_by_tasks" && meta !== "respondido" && meta !== "delivery_pending";
}

/** La tarea que nombra una entrega guardada sin `from_task`, cuya prosa española lleva su id. */
export function idDeLaEntregaAntigua(texto: string): string | null {
  return /tarea «([^»\s]+)»/.exec(texto)?.[1] ?? null;
}

export function esFilaDeLaBandeja(meta: string | undefined): boolean {
  return FILAS.has(meta ?? "");
}

/** Qué dice la fila. Sin ids, la línea de despertar la reescribió una versión anterior. */
export function prosaDeLaFila(meta: string, titulo: string | null, cuantas: number): string {
  const title = titulo ?? t("chat.inbox.a_task");
  if (meta === "task_finished_read") return t("chat.inbox.finished_read", { title });
  if (meta === "task_chain_limit") return t("chat.inbox.chain_limit", { title, max: TOPE_DE_SALTOS });
  // Las guardadas antes llevan prosa española con el id: se compone igual y sin él.
  if (meta === "respondido") {
    return titulo ? t("chat.inbox.replied", { title: titulo }) : t("chat.inbox.replied_someone");
  }
  if (meta === "delivery_pending") {
    return titulo ? t("chat.inbox.delivery_pending", { title: titulo }) : t("chat.inbox.delivery_pending_someone");
  }
  if (meta === "woke_by_tasks") {
    return cuantas > 0 ? t("chat.inbox.woke", { count: cuantas }) : t("chat.inbox.woke_some");
  }
  return t("chat.inbox.finished", { title });
}
