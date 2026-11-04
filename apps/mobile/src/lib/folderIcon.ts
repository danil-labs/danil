import type { Folder } from "./engine.ts";

/** El tipo observado manda; no se deduce nube del nombre o de la ruta. */
export function folderIconName(folder?: Pick<Folder, "kind" | "cloud"> | null): "folder-git-2" | "folder-cloud" | "folder" {
  if (folder?.kind === "git") return "folder-git-2";
  return folder?.cloud ? "folder-cloud" : "folder";
}

/** La clave incluye la máquina: un id local no identifica otra carpeta de la flota. */
export function folderByKey(folders: readonly Folder[], key: string): Folder | undefined {
  return folders.find(folder => folder.key === key);
}
