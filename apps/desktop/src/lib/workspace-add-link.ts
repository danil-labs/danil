export type WorkspaceAddLink = { accountId: string; organization: string; workspace?: string; person?: string };

export function parseWorkspaceAddLink(search: URLSearchParams): WorkspaceAddLink | null {
  const accountId = search.get("add_workspace");
  const organization = search.get("org");
  const workspace = search.get("workspace") ?? undefined;
  const person = search.get("account") ?? undefined;
  const opaque = /^[A-Za-z0-9_-]{1,128}$/;
  if (!accountId || !/^[1-9]\d{0,18}$/.test(accountId) || !organization || !opaque.test(organization)) return null;
  if ((workspace && !opaque.test(workspace)) || (person && !opaque.test(person))) return null;
  return { accountId, organization, workspace, person };
}
