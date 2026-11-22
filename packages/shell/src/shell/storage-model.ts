import type { MachineResources } from "../../../engine-client/src/index.ts";
import { t } from "../../../../apps/desktop/src/lib/i18n";
import { haceCuanto } from "../../../../apps/desktop/src/lib/limits";
export { type Machine, machineName, machines as fleetMachines } from "../../../features/machines/src/queries/store";

export type Clase = "recuperable" | "git" | "fuente" | "trabajo" | "registro";

export type Bloque = { rel: string; clase: Clase; bytes: number };

export type TareaConPeso = {
  session: string;
  project: string;
  tarea: string;
  proyecto: string | null;
  bytes: number;
  /** Cuánto de `bytes` se puede tirar. Viene calculado del backend. */
  recuperable: number;
  bloques: Bloque[];
  /** `updated_at` de la tarea en ms; 0 si la medición viene de una caché anterior. */
  actividad?: number;
};

export type Suelto = { etiqueta: string; bytes: number; rel: string | null };

export type GrupoArchivado = {
  cuantas: number;
  bytes: number;
  recuperable: number;
};

export type Almacen = {
  tareas: TareaConPeso[];
  archivadas?: GrupoArchivado;
  bytes: number;
  recuperable: number;
  compartido: Suelto[];
  sueltos: Suelto[];
  medido_en: number;
  aviso: string | null;
};


/** `cachedAt`: la respuesta salió de la última copia de una máquina apagada, y su hora. */
export type Summary = { resources?: MachineResources; workspaceName?: string; loading: boolean; stale?: boolean; error?: string; cachedAt?: number | null };
export type Target = { machine: string; workspace: string; generation: number };

export type Liberado = {
  bytes: number;
  cuantos: number;
  detalle: string;
};

export type Grupo = {
  clave: string;
  nombre: string;
  tareas: TareaConPeso[];
  bytes: number;
  recuperable: number;
};

export const DIA_MS = 86_400_000;

export function actividadDe(ms: number | undefined): string {
  if (!ms) return "";
  const dias = Math.floor((Date.now() - ms) / DIA_MS);
  return dias < 1 ? haceCuanto(ms) : t("shell.storage.activity.days", { count: dias });
}

/** Lo que la persona lee de un bloque. La ruta va debajo, como dato. */
export function nombreBloque(b: Bloque): string {
  const carpeta = b.rel.split("/").pop() ?? b.rel;
  switch (b.clase) {
    case "git":
      return t("shell.storage.block.git");
    case "fuente":
      return t("shell.storage.block.source");
    case "trabajo":
      return t("shell.storage.block.work");
    case "registro":
      return t("shell.storage.block.record");
  }
  switch (carpeta) {
    case "target":
      return t("shell.storage.block.target");
    case "node_modules":
      return t("shell.storage.block.node_modules");
    case ".pnpm-store":
      return t("shell.storage.block.pnpm_store");
    case ".venv":
      return t("shell.storage.block.venv");
    case "__pycache__":
    case ".pytest_cache":
      return t("shell.storage.block.python_cache");
    case ".gradle":
      return t("shell.storage.block.gradle");
    default:
      return t("shell.storage.block.generated");
  }
}
