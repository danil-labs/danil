import type { Account } from './inbox.ts';

/** Lo que el resolver lee del directorio (`GET /v1/me/workspaces`). */
export type WorkspaceEntry = {
  key: string; workspace_id: string | null; danil_workspace_id: number | null; name: string;
  capabilities: { agents: boolean };
};
export type AccountSources = {
  directory: () => Promise<readonly WorkspaceEntry[]>;
  active: () => Promise<number | null>;
  /** Entra en esta sesión y refresca el token. */
  enter: (key: string) => Promise<void>;
  /** La clave con que el cliente manda `X-Danil-Workspace`. */
  remember?: (key: string | null) => void;
};

/**
 * La cuenta de Danil Agents del workspace activo, o `null`: la pantalla entonces no pide
 * ni muestra datos. Único punto que une los dos, por el enlace `workspaces.account_id`
 * que dice el directorio; nunca por el nombre ni eligiendo otra cuenta. `workspace` es
 * el id del motor o la clave de un workspace que solo tiene agentes. Si la sesión está
 * en otra cuenta, entra: el BFF ancla sus listas a la cuenta activa.
 */
export async function resolveWorkspaceAccount(workspace: string | null, sources: AccountSources): Promise<Account | null> {
  // La clave se cambia al terminar: limpiarla antes dejaría sin comprobar lo que esté en vuelo.
  const none = () => { sources.remember?.(null); return null; };
  if (!workspace?.trim()) return none();
  const entries = await sources.directory();
  const entry = entries.find(row => row.key === workspace || row.workspace_id === workspace);
  const id = entry?.capabilities.agents ? entry.danil_workspace_id : null;
  if (!entry || id === null) return none();
  if (await sources.active() !== id) {
    await sources.enter(entry.key);
    if (await sources.active() !== id) throw new Error('workspace_not_entered');
  }
  sources.remember?.(entry.key);
  return { id, name: entry.name };
}

/** `POST /api/workspace/enter`: fija la cuenta de esta sesión. El token nuevo la trae tras refrescar. */
export async function enterWorkspace(session: { getToken(): Promise<string>; unauthorized(): Promise<boolean> }, request: typeof fetch, prefix: string, key: string): Promise<void> {
  const response = await request(`${prefix}/api/workspace/enter`, {
    method: 'POST', cache: 'no-store',
    headers: { Authorization: `Bearer ${await session.getToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ key }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (!await session.unauthorized()) throw new Error('session_refresh_failed');
}
