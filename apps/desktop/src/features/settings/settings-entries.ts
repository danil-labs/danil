/**
 * Las siete entradas de Configuración y sus pestañas. Los ids de destinos que
 * ya no son pestaña siguen en `MOVED`: `setSettings("plugins")` y los enlaces
 * guardados abren la pestaña que ahora los contiene.
 */
export const SETTINGS_ENTRIES = [
  { id: "account", group: "you", tabs: ["cuenta-danil", "emails", "usage", "plan", "support", "security"] },
  { id: "preferences", group: "you", tabs: ["general", "appearance", "notify", "languages", "workspaces"] },
  { id: "ai-accounts", group: "you", tabs: ["proveedores-ia"] },
  { id: "machines", group: "you", tabs: ["machines", "entorno", "activity"] },
  { id: "projects", group: "workspace", tabs: ["proyectos", "fuentes", "secrets"] },
  { id: "agents-skills", group: "workspace", tabs: ["agentes", "skills"] },
  { id: "connections", group: "workspace", tabs: ["operation", "plugins", "memory", "external", "customers"] },
] as const;

const MOVED: Record<string, string> = {
  secretos: "secrets",
  mcp: "operation",
  conexiones: "external",
  radiant: "operation",
  integrations: "customers",
};

export type SettingsEntryId = (typeof SETTINGS_ENTRIES)[number]["id"];
export type SettingsGroup = (typeof SETTINGS_ENTRIES)[number]["group"];

/** La entrada y la pestaña que abre un id de entrada o de destino viejo; `null` si no es ninguno. */
export function settingsTarget(id: string | undefined): { entry: SettingsEntryId; tab: string | null } | null {
  if (!id) return null;
  const tab = Object.hasOwn(MOVED, id) ? MOVED[id] : id;
  for (const e of SETTINGS_ENTRIES) {
    if (e.id === tab) return { entry: e.id, tab: null };
    if ((e.tabs as readonly string[]).includes(tab)) return { entry: e.id, tab };
  }
  return null;
}
