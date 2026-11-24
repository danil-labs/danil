/**
 * Las diez entradas de Configuración y sus pestañas. Los ids de destinos que
 * ya no son pestaña siguen en `MOVED`: `setSettings("plugins")` y los enlaces
 * guardados abren la entrada o pestaña que ahora los contiene.
 */
export const SETTINGS_ENTRIES = [
  { id: "general", tabs: ["general"] },
  { id: "appearance", tabs: ["appearance"] },
  { id: "account", tabs: ["cuenta-danil"] },
  { id: "security", tabs: ["security"] },
  { id: "ai-accounts", tabs: ["proveedores-ia"] },
  { id: "source-control", tabs: ["fuentes"] },
  { id: "agents-skills", tabs: ["agentes", "skills"] },
  { id: "connections", tabs: ["operation", "plugins"] },
  { id: "personal-ai-agent", tabs: ["external"] },
  { id: "maintenance", footer: true, tabs: ["maintenance"] },
] as const;

const MOVED: Record<string, string> = {
  mcp: "operation",
  memory: "operation",
  conexiones: "external",
  radiant: "operation",
  download: "maintenance",
  notify: "general",
  notifications: "general",
  languages: "general",
  emails: "cuenta-danil",
  usage: "cuenta-danil",
  plan: "cuenta-danil",
  billing: "cuenta-danil",
  business: "cuenta-danil",
  fiscal: "cuenta-danil",
};

export type SettingsEntryId = (typeof SETTINGS_ENTRIES)[number]["id"];

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
