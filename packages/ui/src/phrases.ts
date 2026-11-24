/** The phrases only the browser entry shows, kept out of the desktop bundle. */
import { sumarFrases } from "../../../apps/desktop/src/lib/i18n.ts";
import "../../../apps/desktop/src/locales/catalogs";

const WEB = import.meta.glob(["../../../apps/desktop/src/locales/*/web.json", "../../../apps/desktop/src/locales/*/audit.json"], { eager: true, import: "default" }) as Record<string, Record<string, string>>;

for (const [path, phrases] of Object.entries(WEB)) {
  const code = /\/locales\/([^/]+)\/(?:web|audit)\.json$/.exec(path)?.[1];
  if (code) sumarFrases(code, phrases);
}
