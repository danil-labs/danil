/** Las frases de llevar y traer trabajo entre máquinas, con los trozos perezosos que las enseñan. */
import { sumarFrases } from "../lib/i18n.ts";
import "./catalogs";

const WORK = import.meta.glob("../../../../apps/desktop/src/locales/*/work.json", { eager: true, import: "default" }) as Record<string, Record<string, string>>;

for (const [path, phrases] of Object.entries(WORK)) {
  const code = /\/([^/]+)\/work\.json$/.exec(path)?.[1];
  if (code) sumarFrases(code, phrases);
}
