import { t } from "../../../../../apps/desktop/src/lib/i18n";
import type { Project } from "../../../../ui/src/lib/model";

/**
 * El clon que corre ahora mismo, tal y como lo pinta el riel.
 *
 * Hasta que `git clone` termina no hay proyecto que listar: el backend escribe
 * `project.json` con el árbol ya en disco. Esto es lo único que el riel puede
 * enseñar mientras tanto.
 */
export type ClonEnCurso = {
  /** El id con el que se cancela. `null` es un clon que ya falló. */
  operation: string | null;
  /** Cómo se va a llamar la carpeta: lo escrito, o el final de la dirección. */
  name: string;
  /** La fase que reporta git, sin traducir. Ver [`faseDeClon`]. */
  phase: string | null;
  percent: number | null;
  failed: boolean;
};

/** Un clon en otra máquina que puede seguir tras recargar (`remoteClone.ts`). */
export type RemoteClone = { operation: string; machine: string; workspace: string; name: string };
export const REMOTE_CLONES = "projects.remote_clones";

import type { InicioDeCarpeta } from "../../../../ui/src/lib/workdirKind.ts";

/** Cómo se lee la fase que git reporta. La comparten el diálogo y el riel. */
export function faseDeClon(phase: string | null | undefined) {
  switch (phase) {
    case "counting":
      return t("projects.add.counting");
    case "compressing":
      return t("projects.add.compressing");
    case "receiving":
      return t("projects.add.receiving");
    case "resolving":
      return t("projects.add.resolving");
    case "checkout":
      return t("projects.add.checkout");
    default:
      return t("projects.add.waiting");
  }
}

export type AnadirCarpetaProps = {
  abierto: boolean;
  workspace: string | null;
  /** El escritorio activo: la carpeta nueva queda fijada en él. */
  space?: string | null;
  onCerrar: () => void;
  /** El camino ya elegido; sin él, el diálogo ofrece los tres. */
  inicio?: InicioDeCarpeta | null;
  /** Recarga la lista. Rechaza si el backend no aceptó, con su motivo. */
  onHecho: (p: Project, activate: boolean) => Promise<void> | void;
  /** Lo que el riel enseña del clon. `null` es que no hay ninguno. */
  onClon: (clon: ClonEnCurso | null) => void;
  machines: () => { id: string; local: boolean; hosts: boolean | null }[];
  runOn: (workspace: string | null) => string | null;
  machineName: (id: string) => string;
};
