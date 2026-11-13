/**
 * El selector de organización de la web, por la cookie de la página (`platformTransport`):
 * `GET /v1/capabilities`, `GET /v1/identity/organizations` y `POST …/select` con CSRF y la
 * `Idempotency-Key` del intento. Los errores llegan como `PlatformSessionError` (`status`, `code`).
 */
import type { OrganizationSource } from "../features/shell/organization-selection.ts";
import type { platformTransport } from "./platform-session.ts";

type Transport = Pick<ReturnType<typeof platformTransport>, "call" | "mutation">;

export function webOrganizationSource(transport: Transport, discovery?: () => unknown): OrganizationSource {
  return {
    capabilities: async () => discovery ? discovery() : (await transport.call("capabilities")).json(),
    list: async () => (await transport.call("identity/organizations")).json(),
    select: async (id, key) =>
      (
        await transport.mutation("identity/organizations/select", {
          headers: { "Content-Type": "application/json", "Idempotency-Key": key },
          body: JSON.stringify({ organization_id: id }),
        })
      ).json(),
  };
}
