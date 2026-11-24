import type { edgeTransport } from "../../platform-client/src/edge.ts";
import { z } from "zod";

export function webRedeemPromo(transport: ReturnType<typeof edgeTransport>) {
  return async (code: string, idempotencyKey: string) => {
    const response = await transport.mutation("workspaces/promo/redeem", {
      headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ code }),
    });
    return z.object({ machine: z.object({ state: z.string().optional() }).optional() }).parse(await response.json());
  };
}
