/**
 * El código de un fallo del proxy: `detail` es el código, o `{ code, detail }` cuando el
 * motor adjuntó detalle (`extracted/proxy.rs`, `failure`). Comparar `detail` con una cadena
 * deja de casar en cuanto el motor añade detalle.
 */
export function errorCode(e: unknown): string | null {
  if (!e || typeof e !== "object") return null;
  const { detail, code } = e as { detail?: unknown; code?: unknown };
  if (typeof code === "string") return code;
  if (typeof detail === "string") return detail;
  const inner = detail && typeof detail === "object" ? (detail as { code?: unknown }).code : undefined;
  if (typeof inner === "string") return inner;
  return null;
}

/** El motor no conoce la orden (`command` del proxy o del relay): un motor anterior; solo esa función se apaga. */
export function unknownCommand(error: unknown): boolean {
  if (error === "service.error.command") return true;
  if (!error || typeof error !== "object") return false;
  const code = errorCode(error);
  return code === "command" || code === "unsupported" || code === "service.error.command" || (error as { what?: { clave?: unknown } }).what?.clave === "shell.service.command";
}
