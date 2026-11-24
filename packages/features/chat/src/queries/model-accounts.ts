import { invoke } from "../../../../engine-client/src/client.ts";
import type { Query } from "../../../../ui/src/lib/limits";

export type AccountList = {
  active?: string | null;
  accounts?: unknown[];
};

export const listAccounts = (
  provider: string,
  options?: { headers: Record<string, string> },
): Promise<(AccountList)> =>
  invoke<(AccountList)>("list_accounts", { provider }, options);

export const getAccountLimits = (
  provider: string,
  id: string,
  force: boolean = false,
  options?: { headers: Record<string, string> },
): Promise<(Query)> =>
  invoke<(Query)>("account_limits", { provider, id, force }, options);
