/** Las frases del chip se cargan con su componente. */
import { sumarFrases } from "../lib/i18n.ts";
import "./catalogs";

const SECRET = import.meta.glob("./*/chat.secret.json", { eager: true, import: "default" }) as Record<string, Record<string, string>>;
for (const [path, phrases] of Object.entries(SECRET)) {
  const code = /^\.\/([^/]+)\/chat\.secret\.json$/.exec(path)?.[1];
  if (code) sumarFrases(code, phrases);
}
