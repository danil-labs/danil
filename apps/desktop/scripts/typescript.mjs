/**
 * Qué compilador revisa los tipos: `tsgo` (TypeScript 7, nativo) si está y arranca; si no, el `tsc` de TypeScript 5.
 *
 * Dan los mismos errores; `tsgo` tarda una décima parte. `tsc` sigue instalado porque `verify-scope.mjs` usa su API.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

export const NATIVE = "node_modules/@typescript/native-preview/bin/tsgo";
export const CLASSIC = "node_modules/typescript/bin/tsc";

/** La ruta del compilador para `node <ruta> -b`, dentro de `desktop`. */
export function typecheckBin(desktop) {
  const native = join(desktop, NATIVE);
  if (existsSync(native) && spawnSync(process.execPath, [native, "--version"], { stdio: "ignore", timeout: 10_000 }).status === 0) return native;
  return join(desktop, CLASSIC);
}
