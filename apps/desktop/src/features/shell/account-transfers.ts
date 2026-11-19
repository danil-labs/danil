/** Un workspace de esta computadora que el servidor trasladó de una cuenta a otra (plan de cuentas § 8, A12). */
export type AccountMove = { id: string; from: { org: string; account_id: string }; to: { org: string; account_id: string } };
type Local = { id: string; account: { org: string; account_id: string } };
type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

const text = (value: unknown) => (typeof value === "string" && value) || (typeof value === "number" ? String(value) : null);

/**
 * Los traslados que el catálogo de una organización declara para los workspaces
 * sellados aquí: la cuenta nueva trae el mismo `engine_workspace_id` y
 * `moved_from` con la cuenta vieja. Sin esos campos (un servidor anterior) no hay
 * nada que hacer.
 */
export function movesFor(local: readonly Local[], org: string, items: readonly unknown[]): AccountMove[] {
  const moves: AccountMove[] = [];
  for (const raw of items) {
    const item = raw as { id?: unknown; org?: unknown; engine_workspace_id?: unknown; moved_from?: unknown; archived?: unknown };
    const engine = text(item.engine_workspace_id);
    const id = text(item.id);
    const from = text(item.moved_from) ?? text((item.moved_from as { account_id?: unknown } | null)?.account_id);
    if (!engine || !id || !from || item.archived === true) continue;
    const to = { org: text(item.org) ?? org, account_id: id };
    const here = local.find((w) => w.id === engine && w.account.account_id === from);
    if (here && !(here.account.org === to.org && here.account.account_id === to.account_id)) moves.push({ id: engine, from: here.account, to });
  }
  return moves;
}

/**
 * Vuelve a sellar y después une el Free router a la cuenta nueva; en ese orden,
 * porque la unión exige repetir el sello. Un motor sin la extensión o una unión
 * que falla no rompen el riel: el siguiente repaso lo intenta otra vez.
 */
export async function applyMoves(invoke: Invoke, header: Record<string, unknown>, moves: readonly AccountMove[], person: string | null) {
  let applied = 0;
  for (const move of moves) {
    try {
      await invoke("reseal_account_workspace", { ...header, id: move.id, from: move.from, to: move.to });
      applied++;
    } catch { continue; }
    if (person) await invoke("set_free_router_union", { ...header, workspace: move.id, platformAccount: move.to.account_id, org: move.to.org, sub: person }).catch(() => {});
  }
  return applied;
}
