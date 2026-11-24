/** The Danil account phrases, loaded with the lazy chunks that show them. */
import { sumarFrases } from "../lib/i18n.ts";
import "./catalogs";

const DANIL = import.meta.glob("../../../../apps/desktop/src/locales/*/danil.json", { eager: true, import: "default" }) as Record<string, Record<string, string>>;

for (const [path, phrases] of Object.entries(DANIL)) {
  const code = /\/([^/]+)\/danil\.json$/.exec(path)?.[1];
  if (code) sumarFrases(code, phrases);
}
