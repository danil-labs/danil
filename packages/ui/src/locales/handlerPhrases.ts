import { sumarFrases } from "../lib/i18n.ts";
import "./catalogs";

const HANDLERS = import.meta.glob("../../../../apps/desktop/src/locales/*/settings.handler.json", { eager: true, import: "default" }) as Record<string, Record<string, string>>;
for (const [path, phrases] of Object.entries(HANDLERS)) {
  const code = /\/([^/]+)\/settings\.handler\.json$/.exec(path)?.[1];
  if (code) sumarFrases(code, phrases);
}
