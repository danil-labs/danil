import { z } from "zod";
import { PlatformSessionError } from "./platform-session.ts";

const capability = z.object({ name: z.string().min(1), version: z.number().int().min(1), status: z.string() });
const snapshot = z.object({ contract: z.string(), items: z.array(capability) });
export type ServiceCapability = z.infer<typeof capability>;
export type CapabilitiesSnapshot = z.infer<typeof snapshot>;
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
  return snapshot.parse(await response.json());
}

export function supports(value: CapabilitiesSnapshot | null, name: string): boolean {
  if (value === null) return true;
  const item = value.items.find(item => item.name === name);
  return item?.version === 1 && item.status === "available";
}
