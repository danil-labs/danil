/**
 * Qué marca y qué nombre le tocan a un servidor MCP, **sin los trazos**: esta
 * parte la importan todos los clientes y el arranque de la ventana, así que se
 * queda en lo mínimo.
 *
 * Los trazos viven en `toolMarksData.ts` y pesan veinte veces más: el
 * escritorio los pide al pintar la primera marca (un trozo aparte, no la carga
 * inicial) y el teléfono los importa de una vez.
 *
 * **Qué marca le toca a un servidor lo decide `toolMarkId`, y solo aquí**: dos
 * tablas de alias dejan al mismo servidor con marca en una pantalla y sin ella
 * en otra, sin aviso.
 */

export type ToolMarkId =
  | "github" | "bitbucket" | "gitlab" | "atlassian" | "notion" | "figma" | "excalidraw" | "mcp" | "drive" | "zotero" | "drawio" | "typst" | "libreoffice" | "cua" | "danil" | "supabase" | "slack" | "linear" | "sentry" | "vercel" | "docker" | "postgresql" | "playwright" | "stripe" | "cloudflare" | "googlecloud" | "aws";

export type ToolMarkPath = { d: string; fill: string | null };

export type ToolMark = {
  viewBox: string;
  paths: ToolMarkPath[];
  /**
   * Los trazos del tema oscuro, si cambian: la marca de Danil va en tinta
   * `#0a0a0a` en claro y `#ececef` en oscuro, como su favicon.
   */
  dark?: ToolMarkPath[];
};

/**
 * El nombre de cada servicio tal como se lee en una fila. Es una marca, no se
 * traduce: «GitHub» en las dos lenguas.
 */
export const TOOL_LABELS: Record<ToolMarkId, string> = {
  github: "GitHub",
  bitbucket: "Bitbucket",
  gitlab: "GitLab",
  atlassian: "Atlassian",
  notion: "Notion",
  figma: "Figma",
  excalidraw: "Excalidraw",
  mcp: "MCP",
  drive: "Google Drive",
  zotero: "Zotero",
  drawio: "draw.io",
  typst: "Typst",
  libreoffice: "LibreOffice",
  cua: "Computer Use",
  danil: "Danil",
  supabase: "Supabase",
  slack: "Slack",
  linear: "Linear",
  sentry: "Sentry",
  vercel: "Vercel",
  docker: "Docker",
  postgresql: "PostgreSQL",
  playwright: "Playwright",
  stripe: "Stripe",
  cloudflare: "Cloudflare",
  googlecloud: "Google Cloud",
  aws: "AWS",
};

/**
 * Las claves con las que un servidor MCP queda declarado y el servicio al que
 * pertenecen. Incluye los alias que la gente escribe a mano: `jira` es
 * Atlassian, `pg` es PostgreSQL, `computer-use` es el CUA.
 */
const ALIASES: Record<ToolMarkId, readonly string[]> = {
  github: ["github", "gh", "github-enterprise", "github.com"],
  gitlab: ["gitlab", "gitlab.com"],
  bitbucket: ["bitbucket", "bitbucket.org"],
  atlassian: ["atlassian", "jira", "confluence", "jira-cloud", "atlassian-jira"],
  notion: ["notion"],
  figma: ["figma"],
  excalidraw: ["excalidraw"],
  mcp: ["mcp"],
  drive: ["drive", "gdrive", "google-drive", "googledrive"],
  zotero: ["zotero"],
  drawio: ["drawio", "draw-io", "diagrams", "diagrams.net"],
  typst: ["typst"],
  libreoffice: ["libreoffice", "soffice"],
  cua: ["cua", "computer-use", "cua-driver"],
  danil: ["danil", "terminus", "seldon", "computers"],
  supabase: ["supabase"],
  slack: ["slack"],
  linear: ["linear"],
  sentry: ["sentry"],
  vercel: ["vercel"],
  docker: ["docker"],
  postgresql: ["postgresql", "postgres", "pg"],
  playwright: ["playwright"],
  stripe: ["stripe"],
  cloudflare: ["cloudflare", "workers"],
  googlecloud: ["googlecloud", "google-cloud", "gcp"],
  aws: ["aws", "amazon", "amazonwebservices", "s3"],
};

const BY_ALIAS = new Map<string, ToolMarkId>();
for (const [id, keys] of Object.entries(ALIASES) as [ToolMarkId, readonly string[]][]) {
  for (const key of keys) BY_ALIAS.set(key, id);
}

/** Los sufijos que la gente agrega al declarar el servidor: `figma-escritorio` es Figma. */
const SUFFIX = /([-_.](mcp|server|remote|local|cloud|host|desktop|escritorio|driver))+$/;

/** Las formas en que se puede leer una clave: tal cual, sin sufijo y su primera palabra. */
function keysOf(server: string) {
  const base = server.trim().toLowerCase();
  const bare = base.replace(SUFFIX, "");
  const first = base.split(/[^\p{L}\p{N}]+/u).filter(Boolean)[0] ?? base;
  return [base, bare, first];
}

/**
 * La marca de un servidor por su nombre, o `null` si no la conocemos. Un
 * servidor desconocido no lleva marca: el cliente pinta una baldosa con su
 * inicial, que no afirma un dueño que no sabemos.
 */
export function toolMarkId(server: string | null | undefined): ToolMarkId | null {
  if (!server) return null;
  for (const key of keysOf(server)) {
    const id = BY_ALIAS.get(key);
    if (id) return id;
  }
  return null;
}

/** El nombre con el que se lee un servidor: el del servicio si lo conocemos, o su clave. */
export function toolLabel(server: string): string {
  const id = toolMarkId(server);
  return id ? TOOL_LABELS[id] : server;
}

/** La inicial de un servidor sin marca, para la baldosa. Cadena vacía si no hay ninguna. */
export function toolMonogram(server: string): string {
  return server.replace(/[^\p{L}\p{N}]/gu, "").charAt(0).toLocaleUpperCase() || "";
}
