import { type GroupAccount, type GroupSend, readGroupBalance } from "../../../session/src/group-account.ts";

/** El tooltip nunca reutiliza un saldo de otro contexto u organización. */
export function organizationCredits() {
  const pending = new Map<string, { org: string; amount: Promise<number | null> }>();
  return {
    clear: () => pending.clear(),
    read(group: GroupAccount, send: GroupSend) {
      const old = pending.get(group.context);
      if (old?.org === group.org) return old.amount;
      const amount = readGroupBalance(send, group);
      pending.set(group.context, { org: group.org, amount });
      return amount;
    },
  };
}
