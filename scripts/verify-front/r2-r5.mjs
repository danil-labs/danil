import { dirname, join, relative } from "node:path";
import { scan, featureOf, slash, ROOT } from "./lib.mjs";

const inFeature = (f) => featureOf(f.path) !== null;
const isModel = (f) => /\/model\.ts$/.test(f.path) && f.path.split("/").length === 5;

export function r2(files) {
  // Features fuera de model.ts, y también shell y session (RV1 #39): ningún tipo de recurso a mano.
  return scan(files, (f) => (inFeature(f) && !isModel(f)) || /^packages\/(shell|session)\//.test(f.path),
    /\b(?:type|interface)\s+(?:Machine|Workspace|Organization|Profile|Ticket|Operation)\b/,
    "R2: tipo de recurso declarado fuera de model.ts (derívalo de los clientes generados en model.ts)")
    .concat(scan(files, (f) => !/^(packages\/(shell|platform-client)|apps)\//.test(f.path),
      /\bcreatePlatformClient\s*\(/,
      "R2: cliente del borde creado fuera del shell o de una app; las features usan usePlatform()"));
}

const IMPORT = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)(["'])([^"']+)\1/;

export function r3(files) {
  const v = [];
  for (const f of files) {
    const own = featureOf(f.path);
    if (!own) continue;
    f.codeLines.forEach((line, i) => {
      const spec = IMPORT.exec(line)?.[2];
      if (!spec) return;
      let reason = null;
      if (/^@danil\/feature-/.test(spec)) reason = `import de ${spec}`;
      else if (spec.startsWith(".")) {
        const target = slash(relative(ROOT, join(ROOT, dirname(f.path), spec)));
        const other = featureOf(target + "/");
        if (other && other !== own) reason = `import relativo hacia la feature ${other}`;
      }
      if (reason) v.push({ path: f.path, line: i + 1, reason: `R3: ${reason}; solo shell y apps/* componen features` });
    });
  }
  return v;
}

export function r4(files) {
  return scan(files, (f) => f.path.startsWith("packages/ui/"), /(?:\bfrom\s*|\bimport\s*\(?\s*)(["'])@danil\//,
    "R4: packages/ui no importa @danil/* (ni dominio ni red)");
}

const LOCAL = /\b(isLocal|is_local|kind\s*===?\s*["']personal["']|local\s*\?)/;

export function r5(files) {
  // `host` es la única pieza que sabe qué máquina es esta computadora (Desk) y se lo dice a
  // engine-client; la UI nunca distingue. Ver packages/host/README.md.
  return scan(files, (f) => !/^packages\/(engine-client|host)\//.test(f.path), LOCAL,
    "R5: distinción local/nube fuera de engine-client y host",
    (f, line) => /\/components\//.test(f.path) && /icon/i.test(line));
}

export function r10(files) {
  return scan(files, inFeature, /\b(404|501)\b/,
    "R10: 404/501 a mano en una feature; se maneja una vez en platform-client");
}
