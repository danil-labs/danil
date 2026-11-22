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
  | "github" | "git" | "bitbucket" | "gitlab" | "atlassian" | "notion" | "figma" | "excalidraw" | "mcp" | "drive" | "zotero" | "drawio" | "typst" | "libreoffice" | "cua" | "danil" | "supabase" | "slack" | "linear" | "sentry" | "vercel" | "docker" | "postgresql" | "playwright" | "stripe" | "cloudflare" | "googlecloud" | "aws" | "workos";

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
  git: "Git",
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
  workos: "WorkOS",
};

/**
 * Las claves con las que un servidor MCP queda declarado y el servicio al que
 * pertenecen. Incluye los alias que la gente escribe a mano: `jira` es
 * Atlassian, `pg` es PostgreSQL, `computer-use` es el CUA.
 */
const ALIASES: Record<ToolMarkId, readonly string[]> = {
  github: ["github", "gh", "github-enterprise", "github.com"],
  // `git` es el programa, no el anfitrión: lleva la marca de Git, nunca la de GitHub.
  git: ["git"],
  gitlab: ["gitlab", "gitlab.com", "glab"],
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
  danil: ["danil", "dn", "terminus", "seldon", "computers"],
  supabase: ["supabase"],
  slack: ["slack"],
  linear: ["linear"],
  sentry: ["sentry"],
  vercel: ["vercel"],
  docker: ["docker"],
  postgresql: ["postgresql", "postgres", "pg", "psql"],
  playwright: ["playwright"],
  stripe: ["stripe"],
  cloudflare: ["cloudflare", "workers", "wrangler"],
  googlecloud: ["googlecloud", "google-cloud", "gcp", "gcloud", "gsutil"],
  aws: ["aws", "amazon", "amazonwebservices", "s3"],
  workos: ["workos"],
};

const BY_ALIAS = new Map<string, ToolMarkId>();
for (const [id, keys] of Object.entries(ALIASES) as [ToolMarkId, readonly string[]][]) {
  for (const key of keys) BY_ALIAS.set(key, id);
}

/** Los sufijos que la gente agrega al declarar el servidor: `figma-escritorio` es Figma. */
const SUFFIX = /([-_.](mcp|server|remote|local|cloud|host|desktop|escritorio|driver))+$/;

/**
 * El prefijo de los conectores de claude.ai: `claude_ai_Google_Drive` es Drive.
 * Sin quitarlo, la primera palabra es `claude` y ningún conector lleva marca.
 */
const CLAUDE_AI = /^claude[-_.]ai[-_.]/;

/**
 * Las formas en que se puede leer una clave: tal cual, con guiones en vez de
 * guiones bajos (`google_drive` es `google-drive`), sin sufijo y su primera
 * palabra.
 */
function keysOf(server: string) {
  const base = server.trim().toLowerCase().replace(CLAUDE_AI, "");
  const hyphen = base.replaceAll("_", "-");
  const bare = base.replace(SUFFIX, "");
  const first = base.split(/[^\p{L}\p{N}]+/u).filter(Boolean)[0] ?? base;
  return [base, hyphen, bare, first];
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

/**
 * Las formas en que las instrucciones de Danil nombran su CLI: `"$DANIL_CLI"`,
 * y el `$TERMINUS_CLI` que el CLI instalado todavía emite.
 */
const CLI_VARIABLE = /^\$(\{(DANIL|TERMINUS)_CLI\}|(DANIL|TERMINUS)_CLI)$/;

/** El programa tal como se lee en la fila: `$DANIL_CLI` es `danil`, que está en el PATH. */
export function commandName(program: string): string {
  return CLI_VARIABLE.test(program) ? "danil" : program;
}

/**
 * La marca de un programa de shell, o `null`. **La coincidencia es exacta**: sin
 * el sufijo ni la primera palabra de `toolMarkId`, que sirven para nombres de
 * servidor escritos a mano pero en un programa inventan dueños (`aws-vault` no
 * es AWS). La tabla es la misma `ALIASES`: un alias en dos tablas acaba dando
 * dos respuestas.
 */
export function commandMarkId(program: string | null | undefined): ToolMarkId | null {
  if (!program) return null;
  return BY_ALIAS.get(commandName(program.trim()).toLowerCase()) ?? null;
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
