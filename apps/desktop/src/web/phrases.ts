/** The phrases only the browser entry shows, kept out of the desktop bundle. */
import { sumarFrases } from "../lib/i18n.ts";
import "../locales/catalogs";

const WEB = import.meta.glob(["../locales/*/web.json", "../locales/*/audit.json"], { eager: true, import: "default" }) as Record<string, Record<string, string>>;

for (const [path, phrases] of Object.entries(WEB)) {
  const code = /\/locales\/([^/]+)\/(?:web|audit)\.json$/.exec(path)?.[1];
  if (code) sumarFrases(code, phrases);
}
