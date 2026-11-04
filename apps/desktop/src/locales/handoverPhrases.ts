/** La confirmación del traspaso (`chat.handover.confirm.*`): solo la pide `HandoverDialog`, que es perezoso. */
import { sumarFrases } from "../lib/i18n.ts";
import "./catalogs";

const CONFIRM = import.meta.glob("./*/chat.handover.confirm.json", { eager: true, import: "default" }) as Record<string, Record<string, string>>;
for (const [path, phrases] of Object.entries(CONFIRM)) {
  const code = /^\.\/([^/]+)\/chat\.handover\.confirm\.json$/.exec(path)?.[1];
  if (code) sumarFrases(code, phrases);
}
