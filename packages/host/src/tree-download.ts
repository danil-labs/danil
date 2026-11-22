import { readTreeFile, type TreePart } from "../../engine-client/src/index.ts";

/** Lo que se lee del árbol de la tarea, una parte cada vez (`tree_read_part`). */
export type LeerParte = (offset: number, size: number, revision?: string) => Promise<TreePart>;

/** Lo baja al equipo de quien mira: en la web, «Abrir afuera» abriría el archivo en la otra máquina. */
export async function descargar(nombre: string, leer: LeerParte) {
  const { bytes, mime } = await readTreeFile(leer);
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre.slice(nombre.lastIndexOf("/") + 1);
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
