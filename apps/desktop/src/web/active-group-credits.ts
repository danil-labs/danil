import type { webGroupAccount } from "./group-account.ts";

export function activeGroupCredits(api: { groupAccount: ReturnType<typeof webGroupAccount>; creditsBalance: (org: string | null | undefined, signal: AbortSignal, context?: string) => Promise<number | null> }, organization: string | null | undefined) {
  return { readBalance: async (signal: AbortSignal) => {
    const group = await api.groupAccount.current();
    if (signal.aborted) return null;
    if (group && group.org === organization) return api.creditsBalance(group.org, signal, group.context);
    return api.groupAccount.legacy() ? api.creditsBalance(organization, signal) : null;
  } };
}
