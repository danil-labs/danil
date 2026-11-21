import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./lib.mjs";

/**
 * R13: paridad de textos con la app actual. Todo texto visible sale del
 * catálogo único (`packages/ui/src/i18n/locales`), y el catálogo es copia de
 * `apps/desktop/src/locales`: una frase que no existe allá es una frase inventada.
 *
 * 1. Una clave de `t("…")` que no está en el catálogo `es`.
 * 2. Texto en JSX (`>Texto<`) o en un atributo visible (title, aria-label,
 *    placeholder, label, etiqueta, alt) escrito a mano en vez de `t()`.
 * 3. Un string con forma de frase (diccionarios locales, mensajes) fuera del catálogo.
 * 4. Una frase del catálogo nuevo que no es idéntica a la de `apps/desktop`.
 */
const NEW = join(ROOT, "packages/ui/src/i18n/locales");
const OLD = join(ROOT, "apps/desktop/src/locales");

function load(dir, lang) {
  const out = new Map();
  const d = join(dir, lang);
  if (!existsSync(d)) return out;
  for (const f of readdirSync(d)) {
    if (!f.endsWith(".json") || f === "manifiesto.json") continue;
    const json = JSON.parse(readFileSync(join(d, f), "utf8"));
    for (const [k, v] of Object.entries(json)) out.set(k, { file: `${lang}/${f}`, value: JSON.stringify(v) });
  }
  return out;
}

const SKIP = (p) => p.startsWith("packages/ui/src/i18n/") || p.startsWith("apps/desktop/") || p.includes("/generated/");
const ATTR = /\b(title|aria-label|placeholder|label|etiqueta|alt|description|descripcion)\s*=\s*"([^"]*[A-Za-zÁÉÍÓÚáéíóúñÑ]{2}[^"]*)"/g;
const JSX_TEXT = />\s*([¿¡A-Za-zÁÉÍÓÚÑáéíóúñ«][^<>{}\n]*[A-Za-záéíóúñ.…»?!])\s*</g;
const PHRASE = /(["'`])((?:¿|¡|[A-ZÁÉÍÓÚÑ])[a-záéíóúñü]+(?:[ ,.:;…«»¿?¡!-]+[A-Za-zÁÉÍÓÚÑáéíóúñü0-9{}]+)+[.…»?!]?)\1/g;

/**
 * Trinquete: `r13.allow` lista `ruta cuenta` de las violaciones que ya existían
 * el 2026-11-21. Un archivo fuera de la lista, o con más violaciones que su
 * cuenta, rompe la compilación; la lista solo puede encoger. La escuadra dueña
 * de un archivo lo deja en 0 y borra su línea en el mismo commit.
 */
const ALLOW = join(ROOT, "scripts/verify-front/r13.allow");
function allowed() {
  const m = new Map();
  if (!existsSync(ALLOW)) return m;
  for (const l of readFileSync(ALLOW, "utf8").split("\n")) {
    const [p, n] = l.trim().split(/\s+/);
    if (p && !p.startsWith("#")) m.set(p, Number(n));
  }
  return m;
}

export function r13(files) {
  const all = r13raw(files);
  if (process.env.R13_RAW) return all;
  const allow = allowed();
  const count = new Map();
  for (const v of all) count.set(v.path, (count.get(v.path) ?? 0) + 1);
  const out = all.filter((v) => count.get(v.path) > (allow.get(v.path) ?? 0));
  for (const [p, n] of allow) {
    const now = count.get(p) ?? 0;
    if (now < n) out.push({ path: "scripts/verify-front/r13.allow", line: 1, reason: `R13: ${p} bajó a ${now}; actualiza su cuenta (${n}) en r13.allow` });
  }
  return out;
}

function r13raw(files) {
  const out = [];
  const es = load(NEW, "es");
  if (!es.size) return [{ path: "packages/ui/src/i18n/locales/es", line: 1, reason: "R13: falta el catálogo es" }];

  // 4. el catálogo nuevo es copia exacta del actual mientras apps/desktop exista
  if (existsSync(OLD)) {
    for (const lang of ["es", "en"]) {
      const cur = load(OLD, lang);
      for (const [k, v] of load(NEW, lang)) {
        const o = cur.get(k);
        if (!o) out.push({ path: `packages/ui/src/i18n/locales/${v.file}`, line: 1, reason: `R13: «${k}» no existe en apps/desktop/src/locales: texto inventado` });
        else if (o.value !== v.value) out.push({ path: `packages/ui/src/i18n/locales/${v.file}`, line: 1, reason: `R13: «${k}» difiere de apps/desktop/src/locales/${o.file}` });
      }
    }
  }

  for (const f of files) {
    if (SKIP(f.path)) continue;
    f.codeLines.forEach((line, i) => {
      const at = (reason) => out.push({ path: f.path, line: i + 1, reason });
      for (const m of line.matchAll(/\bt\(\s*["'`]([\w.:-]+)["'`]/g)) {
        if (!es.has(m[1])) at(`R13: la clave «${m[1]}» no está en el catálogo (apps/desktop/src/locales/es)`);
      }
      if (/console\.|new Error\(|throw |import |from "/.test(line)) return;
      if (f.path.endsWith(".tsx")) {
        for (const m of line.matchAll(JSX_TEXT)) if (!/[|=;()]/.test(m[1])) at(`R13: texto «${m[1].trim()}» escrito en el JSX; usa t("clave") de @danil/ui/i18n`);
        for (const m of line.matchAll(ATTR)) at(`R13: ${m[1]}="${m[2]}" escrito a mano; usa t("clave")`);
      }
      for (const m of line.matchAll(PHRASE)) at(`R13: frase «${m[2]}» fuera del catálogo; usa t("clave")`);
    });
  }
  return out;
}
