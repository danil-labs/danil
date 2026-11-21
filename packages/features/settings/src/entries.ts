export type SettingsEntryId =
  | "account"
  | "preferences"
  | "ai-accounts"
  | "source-control"
  | "machines"
  | "projects"
  | "agents-skills"
  | "connections";

export type SettingsGroup = "you" | "workspace";

export interface SettingsTab {
  id: string;
  name: string;
  panel: (() => import("solid-js").JSX.Element) | null;
}

export interface SettingsEntryDef {
  id: SettingsEntryId;
  group: SettingsGroup;
  name: string;
  tabs: string[];
}

export const SETTINGS_GROUPS: { id: SettingsGroup; nombre: string }[] = [
  { id: "you", nombre: "Tú" },
  { id: "workspace", nombre: "Este workspace" },
];

export const SETTINGS_ENTRIES: readonly SettingsEntryDef[] = [
  {
    id: "account",
    group: "you",
    name: "Cuenta",
    tabs: ["cuenta-danil", "emails", "usage", "plan", "security"],
  },
  {
    id: "preferences",
    group: "you",
    name: "Preferencias",
    tabs: ["general", "appearance", "notify", "languages", "workspaces", "download"],
  },
  {
    id: "ai-accounts",
    group: "you",
    name: "Cuentas de IA",
    tabs: ["proveedores-ia"],
  },
  {
    id: "source-control",
    group: "you",
    name: "Control de código",
    tabs: ["fuentes"],
  },
  {
    id: "machines",
    group: "you",
    name: "Máquinas",
    tabs: ["machines", "entorno", "activity"],
  },
  {
    id: "projects",
    group: "workspace",
    name: "Proyectos",
    tabs: ["proyectos", "secrets"],
  },
  {
    id: "agents-skills",
    group: "workspace",
    name: "Agentes y skills",
    tabs: ["agentes", "skills"],
  },
  {
    id: "connections",
    group: "workspace",
    name: "Conexiones",
    tabs: ["operation", "plugins", "memory", "external"],
  },
] as const;

export const TAB_NAMES: Record<string, string> = {
  "cuenta-danil": "Cuentas de Danil",
  emails: "Correos",
  usage: "Uso",
  plan: "Plan",
  security: "Seguridad",
  general: "General",
  appearance: "Estilo",
  notify: "Avisos",
  languages: "Lenguas",
  workspaces: "Barra de workspaces",
  download: "Descargas",
  "proveedores-ia": "Proveedores de IA",
  fuentes: "Control de Fuentes",
  machines: "Tus máquinas",
  entorno: "Estado del entorno",
  activity: "Actividad",
  proyectos: "Carpetas",
  secrets: "Secretos",
  agentes: "Agentes",
  skills: "Skills",
  operation: "MCP",
  plugins: "Plugins",
  memory: "Memoria",
  external: "Acceso externo",
};

const MOVED: Record<string, string> = {
  secretos: "secrets",
  mcp: "operation",
  conexiones: "external",
  radiant: "operation",
};

export function settingsTarget(
  id: string | undefined,
): { entry: SettingsEntryId; tab: string | null } | null {
  if (!id) return null;
  const tab = Object.hasOwn(MOVED, id) ? MOVED[id] : id;
  for (const e of SETTINGS_ENTRIES) {
    if (e.id === tab) return { entry: e.id, tab: null };
    if (e.tabs.includes(tab)) return { entry: e.id, tab };
  }
  return null;
}

export const idTab = (id: string) => `cfg-tab-${id}`;
export const idSub = (id: string) => `cfg-sub-${id}`;
