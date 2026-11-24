/**
 * Un bloque MCP pegado (`add_mcp_servers`, `set_memory_provider`) no cruza el
 * relay con valores escritos: el motor guarda `env`/`headers` en la bóveda,
 * pero el bloque entero pasa antes legible por el servidor de Danil.
 */

/** Las órdenes que llevan un bloque, y su argumento. */
export const MCP_BLOCK_ARGS: Record<string, string> = { add_mcp_servers: "bloque", set_memory_provider: "block" };

const SENSITIVE_NAME = /(?:^|[_-])(?:token|key|secret|password|passwd|pwd|auth|authorization|bearer|credential|credentials|apikey|api-key|api_key|access-key|private)(?:$|[_-])/i;
const MARKER = /\$\{secret:[^}\s]+\}/g;
/** Lo que puede acompañar a un marcador en una cabecera: el esquema de autorización. */
const SCHEME = /^(?:bearer|basic|token)?$/i;

/** Una URL con contraseña o con un parámetro de nombre sensible. */
export function urlWithCredentials(text: string): boolean {
  let url: URL;
  try {
    url = new URL(text.trim());
  } catch {
    return false;
  }
  if (url.password) return true;
  for (const [name, value] of url.searchParams) if (value && SENSITIVE_NAME.test(name)) return true;
  return false;
}

/** Un valor de `env`/`headers` que no sea solo marcadores `${secret:…}`; números y booleanos cuentan. */
function literal(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value !== "string") return true;
  return !SCHEME.test(value.replace(MARKER, "").trim());
}

/** Un argumento que lleva un valor: tras una bandera sensible, `--token=x`, o una URL con credenciales. */
function argsWithValues(args: unknown[]): boolean {
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (typeof arg !== "string") continue;
    const value = arg.replace(MARKER, "");
    if (urlWithCredentials(value)) return true;
    const assign = /^-{0,2}([A-Za-z0-9_.-]+)=(.+)$/.exec(value);
    if (assign && SENSITIVE_NAME.test(assign[1])) return true;
    if (/^-{1,2}[A-Za-z]/.test(arg) && !arg.includes("=") && SENSITIVE_NAME.test(arg.replace(/^-+/, ""))) {
      const next = args[i + 1];
      if (typeof next === "string" && next.replace(MARKER, "").trim()) return true;
    }
  }
  return false;
}

function hasValues(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(hasValues);
  if (!node || typeof node !== "object") return false;
  for (const [key, value] of Object.entries(node)) {
    if (key === "env" || key === "headers") {
      if (value === null || value === undefined) continue;
      if (typeof value !== "object" || Array.isArray(value)) return true;
      if (Object.values(value).some(literal)) return true;
    } else if ((key === "url" || key === "httpUrl") && typeof value === "string") {
      if (urlWithCredentials(value.replace(MARKER, ""))) return true;
    } else if (key === "args" && Array.isArray(value)) {
      if (argsWithValues(value)) return true;
    } else if (hasValues(value)) return true;
  }
  return false;
}

export type McpBlockCheck = { kind: "clean"; block: string } | { kind: "plain" } | { kind: "invalid" };

/**
 * Qué lleva un bloque. `clean` trae el bloque que se revisó, vuelto a escribir:
 * con claves repetidas `JSON.parse` se queda con la última, y lo que viaja
 * tiene que ser eso y no el texto original.
 */
export function checkMcpBlock(block: string): McpBlockCheck {
  let parsed: unknown;
  try {
    parsed = JSON.parse(block.trim());
  } catch {
    return { kind: "invalid" };
  }
  return hasValues(parsed) ? { kind: "plain" } : { kind: "clean", block: JSON.stringify(parsed) };
}

/** Los argumentos de una llamada por el relay: el bloque revisado, o el código con el que se niega. */
export function relayArgs(command: string, args: unknown): { args: unknown } | { code: "mcp_values_over_relay" | "mcp_block_invalid" } {
  const key = MCP_BLOCK_ARGS[command];
  const block = key && args && typeof args === "object" ? (args as Record<string, unknown>)[key] : undefined;
  if (typeof block !== "string") return { args };
  const found = checkMcpBlock(block);
  if (found.kind === "plain") return { code: "mcp_values_over_relay" };
  if (found.kind === "invalid") return { code: "mcp_block_invalid" };
  return { args: { ...(args as Record<string, unknown>), [key]: found.block } };
}
