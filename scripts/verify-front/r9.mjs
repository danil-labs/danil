import { inGenerated } from "./lib.mjs";

const WINDOW = 12;
const norm = (l) => l.trim().replace(/\s+/g, " ");

/** Bloques de WINDOW líneas no vacías consecutivas idénticas en dos archivos distintos. */
export function r9(files) {
  const seen = new Map();
  const reported = new Set();
  const v = [];
  for (const f of files) {
    if (inGenerated(f.path)) continue;
    const rows = [];
    f.lines.forEach((l, i) => { const n = norm(l); if (n) rows.push({ n, line: i + 1 }); });
    for (let i = 0; i + WINDOW <= rows.length; i++) {
      const block = rows.slice(i, i + WINDOW);
      // Un bloque solo de llaves, imports o líneas de 1-2 caracteres no es duplicación real.
      if (block.filter((r) => r.n.length > 3 && !r.n.startsWith("import ")).length < WINDOW / 2) continue;
      const key = block.map((r) => r.n).join("\n");
      const prev = seen.get(key);
      if (!prev) { seen.set(key, { path: f.path, line: block[0].line }); continue; }
      if (prev.path === f.path) continue;
      const pair = `${prev.path}|${f.path}`;
      const last = reported.has(pair) ? v.findLast((x) => x.pair === pair) : null;
      if (last && block[0].line <= last.end + 1) { last.end = block[WINDOW - 1].line; continue; }
      reported.add(pair);
      v.push({ pair, path: f.path, line: block[0].line, end: block[WINDOW - 1].line,
        reason: `R9: bloque duplicado de ${WINDOW}+ líneas con ${prev.path}:${prev.line}; súbelo a ui o a model.ts` });
    }
  }
  return v;
}
