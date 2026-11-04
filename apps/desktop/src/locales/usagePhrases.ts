import { sumarFrases, type Plural } from "../lib/i18n.ts";
import "./catalogs";

const USAGE = import.meta.glob("./*/settings.usage.json", { eager: true, import: "default" }) as Record<string, Record<string, string | Plural>>;
for (const [path, phrases] of Object.entries(USAGE)) {
  const code = /^\.\/([^/]+)\/settings\.usage\.json$/.exec(path)?.[1];
  if (code) sumarFrases(code, phrases);
}
