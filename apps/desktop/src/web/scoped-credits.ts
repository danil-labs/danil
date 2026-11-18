import type { edgeTransport } from "@terminus/computers";
import type { GroupReply } from "../lib/group-account.ts";

/** El compositor y los menús comparten la lectura 30 s, sin sondeo; ningún saldo sin eco alimenta un grupo. */
export function scopedCreditsRead(transport: ReturnType<typeof edgeTransport>, now: () => number = Date.now) {
  const reads = new Map<string, { promise: Promise<GroupReply>; until: number }>();
  return {
    clear: () => reads.clear(),
    read(context: string): Promise<GroupReply> {
      const existing = reads.get(context);
      if (existing && existing.until > now()) return existing.promise;
      const pending = (async () => {
        const response = await transport.call("credits/balance", { headers: { "X-Danil-Session": context } });
        if (response.ok && response.headers.get("X-Danil-Session-Applied") !== context) throw { detail: "session_echo_mismatch" };
        return { status: response.status, body: await response.json() };
      })();
      reads.set(context, { promise: pending, until: now() + 30_000 });
      void pending.catch(() => { if (reads.get(context)?.promise === pending) reads.delete(context); });
      return pending;
    },
  };
}
