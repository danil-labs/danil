/**
 * De qué servicio salió una herramienta.
 *
 * Un agente nombra sus herramientas de dos maneras y las dos dicen lo mismo:
 * Claude antepone `mcp__<servidor>__`, y algunos CLIs usan `<servidor>·<tool>`.
 * El servidor es la clave con la que la persona lo declaró (`github`,
 * `figma-escritorio`), y de ahí sale la marca y el nombre que se lee en la
 * fila. El mapa de servidores a servicios vive en `@terminus/design`
 * (`toolMarkId`), porque es el mismo en todos los clientes.
 */
import { toolLabel, toolMarkId, type ToolMarkId } from "../../design/src/index.ts";

/** El servidor y su herramienta, ya separados. */
export type McpCall = { server: string; tool: string };

/** El servidor y su tool, o `null` si el nombre no es de un MCP. */
export function mcpCallFromName(name: string): McpCall | undefined {
  if (name.startsWith("mcp__")) {
    const split = name.slice(5).indexOf("__");
    if (split > 0) return { server: name.slice(5, 5 + split), tool: name.slice(7 + split) };
  }
  const split = name.indexOf("·");
  if (split > 0) return { server: name.slice(0, split), tool: name.slice(split + 1) };
  return undefined;
}

/**
 * El nombre de la tool como se lee: `create_issue` → `create issue`. Sigue
 * siendo el nombre que publicó el servidor y no se traduce —traducirlo
 * inventaría un verbo que no sabemos—, pero deja de ser un identificador.
 */
export function readableToolName(tool: string) {
  const words = tool
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // `getFile` da `get File`: se baja la palabra que solo lleva mayúscula
  // inicial. Un acrónimo (`HTTPStatus`) se queda como está.
  return (words || tool).replace(/\b([A-Z])([a-z]+)\b/g, (_, first: string, rest: string) => first.toLowerCase() + rest);
}

/** Lo que la fila necesita para pintar una herramienta con dueño. */
export type ToolSource = {
  server: string;
  tool: string;
  /** La marca, si el servicio está en la tabla; `null` pide una baldosa con la inicial. */
  mark: ToolMarkId | null;
  /** El servicio tal como se lee: `GitHub`, o la clave del servidor si no lo conocemos. */
  label: string;
};

/**
 * El servicio de una herramienta. `call` va primero porque el evento ya trae el
 * servidor separado y no hay que volver a partirlo.
 */
export function toolSource(name: string, call?: McpCall | null): ToolSource | null {
  const mcp = call ?? mcpCallFromName(name);
  if (!mcp) return null;
  return { server: mcp.server, tool: mcp.tool, mark: toolMarkId(mcp.server), label: toolLabel(mcp.server) };
}
