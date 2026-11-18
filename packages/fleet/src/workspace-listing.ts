export type WorkspaceAccount = { org: string; account_id: string };
export type ListedWorkspace = {
	id: string;
	name: string;
	account?: WorkspaceAccount;
};

export function listedWorkspaces(value: unknown): ListedWorkspace[] | null {
	const rows = (value as { workspaces?: unknown } | null)?.workspaces;
	if (!Array.isArray(rows)) return null;
	return rows.flatMap((row) => {
		const w = row as Partial<ListedWorkspace>;
		if (typeof w?.id !== "string" || !w.id) return [];
		const account =
			typeof w.account?.org === "string" &&
			typeof w.account.account_id === "string"
				? w.account
				: undefined;
		return [
			{
				id: w.id,
				name: typeof w.name === "string" && w.name.trim() ? w.name : w.id,
				...(account ? { account } : {}),
			},
		];
	});
}
