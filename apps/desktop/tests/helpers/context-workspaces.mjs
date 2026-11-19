export function contextWorkspaces(contexts) {
  return {
    machine_list: [{ id: "local", local: true, active: true, on: true, hosts: true }],
    list_workspaces: { active: "w", workspaces: [{ id: "w", name: "Local" }, ...contexts.map((context) => ({ id: `workspace-${context.context_id}`, name: context.org_name, account: { org: context.org, account_id: context.context_id } }))] },
  };
}
export function openContextMenu(app, context) {
  const tile = app.w.document.querySelector(`[data-workspace-context="${context}"]`);
  tile.dispatchEvent(new app.w.KeyboardEvent("keydown", { key: "ContextMenu", bubbles: true }));
}
