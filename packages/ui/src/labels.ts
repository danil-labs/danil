import type { TaskState } from "./taskState.ts";

export type StatusLabel = TaskState | "delivered";

/**
 * The sentence for each mark. The desktop reads the same words from
 * `projects.status.*` in its catalogs; `scripts/guards/shared-design.mjs` fails
 * when the two drift apart.
 */
export const STATUS_LABELS: Record<"es" | "en", Record<StatusLabel, string>> = {
  es: {
    approving: "Espera que apruebes una acción",
    asked: "Te preguntó algo",
    working: "Está trabajando",
    failed: "Fallo o interrupción",
    interrupted: "La detuviste",
    unseen: "Terminó y no la has abierto",
    delivered: "Resultado entregado",
  },
  en: {
    approving: "Waiting for you to approve an action",
    asked: "Asked you something",
    working: "Working",
    failed: "Failure or interruption",
    interrupted: "You stopped it",
    unseen: "Finished and not opened yet",
    delivered: "Result delivered",
  },
};

export const WORK_STATUS_LABELS = {
  "es": {
    "draft": "Borrador",
    "review": "Revisión",
    "ready": "Listo",
    "closed": "Cerrado",
    "unknown": "Desconocido"
  },
  "en": {
    "draft": "Draft",
    "review": "Review",
    "ready": "Ready",
    "closed": "Closed",
    "unknown": "Unknown"
  }
} as const;
