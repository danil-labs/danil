/** El chip de pegado protegido y la tarjeta «Secreto solicitado» (`chat.secret*`): los dos son perezosos. */
import { sumarFrases } from "../lib/i18n.ts";
import "./catalogs";

const SECRET = import.meta.glob("./*/chat.secret.json", { eager: true, import: "default" }) as Record<string, Record<string, string>>;
for (const [path, phrases] of Object.entries(SECRET)) {
  const code = /^\.\/([^/]+)\/chat\.secret\.json$/.exec(path)?.[1];
  if (code) sumarFrases(code, phrases);
}
