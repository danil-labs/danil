/** Errores tipados que ve la UI. 404/501/503 nunca son finales (R10). */
export type ClientError =
  | { kind: "unauthorized" }
  | { kind: "forbidden" }
  | { kind: "unavailable"; retrying: boolean }
  | { kind: "error"; status: number; code: string; message: string };

export function isClientError(e: unknown): e is ClientError {
  return typeof e === "object" && e !== null && "kind" in e;
}
