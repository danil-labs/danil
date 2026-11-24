export type ProjectRepository = {
  name: string;
  url: string;
  git_host: string | null;
  last_used: number;
  /** El proyecto de este workspace que ya tiene el repositorio clonado, y dónde. */
  project?: string | null;
  local_path?: string | null;
};

export function repositoryCloneUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      parsed.username = "";
      parsed.password = "";
      return parsed.href;
    }
  } catch { /* SSH puede usar la sintaxis scp, que no es una URL. */ }
  return url.trim();
}

export function repositoryIdentity(url: string): string {
  return repositoryCloneUrl(url).replace(/^(?:https?:\/\/|ssh:\/\/(?:git@)?|git@)/i, "")
    .replace(/^([^/:]+):/, "$1/").replace(/\/+$/, "").replace(/\.git$/, "").toLowerCase();
}

export function mergeRepositories(
  history: ProjectRepository[], accessible: ProjectRepository[], query = "",
): ProjectRepository[] {
  const repositories = new Map<string, ProjectRepository>();
  for (const repo of [...history, ...accessible]) {
    if (!repo.url) continue;
    const key = repositoryIdentity(repo.url);
    const previous = repositories.get(key);
    // Lo accesible pisa la fila del historial, pero no su clon local: ese solo lo sabe el historial.
    repositories.set(key, {
      ...previous, ...repo, url: repositoryCloneUrl(repo.url), last_used: Math.max(repo.last_used, previous?.last_used ?? 0),
    });
  }
  const search = query.trim().toLowerCase();
  return [...repositories.values()].filter(repo => !search || `${repo.name} ${repo.url}`.toLowerCase().includes(search))
    .sort((a, b) => b.last_used - a.last_used || a.name.localeCompare(b.name));
}
