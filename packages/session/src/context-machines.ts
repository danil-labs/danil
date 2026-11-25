import { machinesClient } from "../../platform-client/src/machines.ts";
import type { MachinesTransport } from "../../platform-client/src/machines-config.ts";

/** Cookie y CSRF siguen en el transporte; ningún cuerpo contextual cruza sin eco. */
export function contextMachines(endpoint: string, transport: MachinesTransport, relayOrigins: readonly string[], context: string) {
  const request = async (method: "call" | "mutation", path: string, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    headers.set("X-Danil-Session", context);
    const response = await transport[method](path, { ...init, headers });
    if (response.ok && response.headers.get("X-Danil-Session-Applied") !== context) throw { code: "session_echo_mismatch" };
    return response;
  };
  return machinesClient({ endpoint, relayOrigins, transport: {
    call: (path, init) => request("call", path, init),
    mutation: (path, init) => request("mutation", path, init),
  } });
}
