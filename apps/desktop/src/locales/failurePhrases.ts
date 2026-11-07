/** Errores del motor (`cli.error.*`, `chat.session_model.*`) y avisos de encargado (`chat.notice.*`): fuera de la carga inicial, precargados al arrancar. */
import { sumarFrases } from "../lib/i18n.ts";
import "./catalogs";

const FAILURES = import.meta.glob(["./*/cli.json", "./*/chat.notice.json", "./*/chat.failure.json", "./*/chat.session_model.json"], { eager: true, import: "default" }) as Record<string, Record<string, string>>;
for (const [path, phrases] of Object.entries(FAILURES)) {
  const code = /^\.\/([^/]+)\//.exec(path)?.[1];
  if (code) sumarFrases(code, phrases);
}
