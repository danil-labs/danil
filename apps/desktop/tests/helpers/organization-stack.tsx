import { render } from "solid-js/web";
import { OrganizationStack } from "../../../../packages/shell/src/shell/OrganizationStack";

export function mountOrganizationStack(root: HTMLElement) {
  let pinned = 0; let menus = 0; const moves: number[] = [];
  const opened: string[] = [];
  const context = { context_id: "context", org: "org", org_name: "Acme", email: "one@example.com", plan: "paid", family: "family", person: "person", available: [], added: new Set<string>() };
  const organization = { id: "org", name: "Acme", pinned: false, contexts: [context], tiles: ["one", "two"].map((id) => ({ id, key: id, name: id, logo: null, context })) };
  const dispose = render(() => <OrganizationStack organization={organization} state={null} stateLabel="Sin pendientes" badge={() => null} onPin={() => pinned++} onContextMenu={() => menus++} onMove={(step) => moves.push(step)} render={(tile) => <button data-workspace-tile={tile().id} onClick={() => opened.push(`${tile().context.context_id}/${tile().id}`)}>{tile.name}</button>} />, root);
  return { dispose, opened, pinned: () => pinned, menus: () => menus, moves };
}
