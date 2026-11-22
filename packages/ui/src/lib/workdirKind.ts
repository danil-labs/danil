export type WorkdirIconKind = "git" | "cloud" | "folder";

export function workdirIconKind(kind: string, cloud?: string | null): WorkdirIconKind {
  if (kind === "git") return "git";
  return cloud ? "cloud" : "folder";
}

/** Un repositorio es carpeta de código: ahí todo archivo de texto abre en el editor, y la hoja de documento queda para las demás. */
export function esDeCodigo(kind: string): boolean {
  return kind === "git";
}
