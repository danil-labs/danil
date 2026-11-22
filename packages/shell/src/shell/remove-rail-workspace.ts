export type RailWorkspaceTarget = { id: string; name: string; context?: string };
export type Revocation = "revoked" | "unavailable";

type Removal = {
  context: string;
  workspace: string;
  added: ReadonlySet<string>;
  revoke?: (context: string, workspace: string) => Promise<Revocation>;
  removeAdded: (workspace: string) => Promise<void>;
  forgetView: () => Promise<void>;
  closeContext: (context: string) => Promise<void>;
};

export async function removeRailWorkspace(removal: Removal): Promise<Revocation> {
  const { context, workspace } = removal;
  const revocation = await removal.revoke?.(context, workspace) ?? "unavailable";
  await removal.removeAdded(workspace);
  await removal.forgetView();
  if (![...removal.added].some((id) => id !== workspace)) await removal.closeContext(context);
  return revocation;
}
