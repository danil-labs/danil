import type { AccountProfileSource } from "../features/settings/account-profile.ts";
import type { ComputeTransport } from "@terminus/computers";

/** Identity owns the person; photo editing is unavailable until identity publishes it. */
export function webAccountProfile(transport: Pick<ComputeTransport, "call">): AccountProfileSource {
  return {
    readonly: true,
    async read() {
      const body = await (await transport.call("identity/me")).json() as { name?: unknown; email?: unknown };
      return { name: typeof body.name === "string" ? body.name : null, email: typeof body.email === "string" ? body.email : null, photo: null, source: null };
    },
    async setPhoto() { throw new Error("unavailable"); },
    async removePhoto() { throw new Error("unavailable"); },
  };
}
