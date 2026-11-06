// Secciones de ajustes que solo piden vistas perezosas. Si vuelven a `settings.json`,
// entran en la carga inicial. Las importa cada módulo que pide una de sus claves.
import { sumarFrases, type Plural } from "../lib/i18n.ts";
import "./catalogs";

const SETTINGS = import.meta.glob(
  ["./*/settings.*.json", "./*/workspaces.consent.free_models.json", "!./*/settings.handler.json", "!./*/settings.usage.json"],
  { eager: true, import: "default" },
) as Record<string, Record<string, string | Plural>>;
for (const [path, phrases] of Object.entries(SETTINGS)) {
  const code = /^\.\/([^/]+)\/[^/]+\.json$/.exec(path)?.[1];
  if (code) sumarFrases(code, phrases);
}
