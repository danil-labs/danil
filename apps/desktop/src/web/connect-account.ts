import type { EdgeTransport } from "@terminus/computers";

/** La conexión requiere un inicio aditivo publicado por Identity. */
export async function connectWebAccount(_transport: EdgeTransport, _home: string): Promise<void> {
  throw new Error("account_connection_unavailable");
}
