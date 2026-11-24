import { machineOf } from "../../../../host/src/machine";
import { callEngine, type InvokeOptions } from "../../../../engine-client/src/client.ts";
import { manifiesto, t } from "../../../../ui/src/lib/i18n.ts";

/**
 * **La única forma de nombrar una versión.** El número solo no identifica nada:
 * el `1` de una sesión y el `1` de otra son cosas distintas, y una referencia
 * que viaja sin su ámbito acaba señalando la equivocada. El tipo obliga a
 * llevarlo pegado.
 */
export type VersionRef = {
  project: string;
  session: string;
  /** Ruta relativa a la carpeta de la sesión. */
  artifact: string;
  /** El índice dentro de la cadena, 1..N. Se pinta; no identifica. */
  n: number;
};

export type Version = {
  referencia: VersionRef;
  /** `agent` = cambió en la carpeta de trabajo · `person` = se editó aquí. */
  author: string;
  bytes: number;
  ts: number;
};

export type History = {
  /** La que está en disco ahora: la que se publicaría. */
  current: VersionRef | null;
  versions: Version[];
};

/** `en`: la máquina donde está el archivo, si no es la de la ventana (`ui/fileMachine.ts`). */
export const historiaDe = (path: string, en?: InvokeOptions) => callEngine<History>("artifact_history", { path }, en);

export const leerVersion = (referencia: VersionRef, en?: InvokeOptions) =>
  callEngine<string>("read_version", { referencia }, en);

export const restaurarVersion = (referencia: VersionRef, en?: InvokeOptions) =>
  callEngine<History>("restore_version", { referencia }, en);

export function mismaVersion(
  a: VersionRef | null | undefined,
  b: VersionRef | null | undefined,
): boolean {
  // Una publicación de código no trae `version`, así que aquí entra
  // `undefined`: dos ausencias no son la misma versión, son ninguna.
  if (!a || !b) return false;
  return (
    a.n === b.n &&
    a.artifact === b.artifact &&
    a.session === b.session &&
    a.project === b.project
  );
}

export function quien(author: string): string {
  return author === "person"
    ? t("common.history.person")
    : t("common.history.agent");
}

/** Cuándo, con la precisión que sirve para elegir una versión de una lista. */
export function cuando(ts: number): string {
  const seg = Math.max(0, (Date.now() - ts) / 1000);
  if (seg < 90) return t("common.ago.just_now");
  if (seg < 3600) return t("common.ago.minutes", { count: Math.round(seg / 60) });
  if (seg < 86400) return t("common.ago.hours", { count: Math.round(seg / 3600) });
  // **El locale sale del manifiesto y no del código.** Estaba clavado en `"es"`,
  // así que cambiar de idioma dejaba «14 sept» debajo de una interfaz en otra
  // lengua, sin error. `Intl` tampoco conoce `yua` y no lo dice: contesta con
  // otro (`lib/i18n.ts`), y por eso el locale de formato es un dato del
  // paquete.
  return new Date(ts).toLocaleDateString(manifiesto().formato, {
    day: "numeric",
    month: "short",
  });
}

/* ------------------------------------------------------ salidas registradas */

export type Via =
  | "docx"
  | "xlsx"
  | "pdf"
  | "abrir-afuera"
  | "descarga"
  | "rama"
  | "pr";

/** A qué código apunta una salida de tipo `rama` o `pr`. */
export type CodeRef = {
  project: string;
  session: string;
  /** La dirección del repositorio, sin credencial. */
  repo: string;
  branch: string;
  commit: string;
  change_request?: string;
};

export type Publicacion = {
  ts: number;
  version?: VersionRef;
  codigo?: CodeRef;
  via: string;
  destino: string;
  quien: string;
  fuentes: string[];
  agente: string;
  bytes: number;
};

export const NOMBRE_VIA: Record<string, string> = {
  docx: ".docx",
  xlsx: ".xlsx",
  pdf: "PDF",
  get "abrir-afuera"() {
    return t("common.history.via.open_outside");
  },
  get descarga() {
    return t("common.history.via.download");
  },
  get rama() {
    return t("common.history.via.branch");
  },
  get pr() {
    return t("common.history.via.pull_request");
  },
};

export const publicacionesDe = (project: string, session: string) =>
  callEngine<Publicacion[]>("publications_of", { project, session }, machineOf(session));

export const registrarSalida = (
  referencia: VersionRef,
  via: Via,
  destino: string,
  bytes: number,
  en?: InvokeOptions,
) => callEngine<void>("record_export", { referencia, via, destino, bytes }, en);

export const descargarArtefacto = (
  path: string,
  version: number | null,
  destino: string,
) =>
  callEngine<{ bytes: number; historia: History }>("download_artifact", {
    path,
    version,
    destino,
  });
