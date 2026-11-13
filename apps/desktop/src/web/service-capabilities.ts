import { type CapabilityList, capabilityList, mayCall } from "@terminus/computers";
import { PlatformSessionError } from "./platform-session.ts";

/** Lo que el borde anuncia, leído igual que en Desk (`@terminus/computers`, `capabilities.ts`). */
export type CapabilitiesSnapshot = CapabilityList;
export type CapabilitiesTransport = { call(path: string): Promise<Response> };

/** An absent discovery route leaves the caller free to probe a preceding deployment. */
export async function readCapabilities(transport: CapabilitiesTransport): Promise<CapabilitiesSnapshot | null> {
  let response: Response;
  try {
    response = await transport.call("capabilities");
  } catch (error) {
    if (error instanceof PlatformSessionError && (error.status === 404 || error.status === 501)) return null;
    throw error;
  }
  if (response.status === 404 || response.status === 501) {
    await response.body?.cancel();
    return null;
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new PlatformSessionError(response.status, response.headers.get("retry-after"));
  }
  const list = capabilityList(await response.json());
  // Una respuesta 200 que no es una lista es un fallo del borde (se reintenta), no «sin descubrimiento».
  if (list === null) throw new Error("invalid_capabilities");
  return list;
}

/** Anunciada en v1 y `available`, o sin lista publicada (la ruta misma contesta 404/501). */
export const supports = mayCall;
