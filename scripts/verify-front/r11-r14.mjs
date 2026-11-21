import { featureOf, scan } from "./lib.mjs";

const inFeature = (f) => featureOf(f.path) !== null;

/** R11: un solo cliente y una sola sesión por app; los hooks no aceptan otro cliente ni otra sesión. */
export function r11(files) {
  return scan(files, inFeature, /\b(client|session|sessionSource)\?\s*:/,
    "R11: opción client?/session? en una feature; el cliente sale de usePlatform() y la sesión de useSession()");
}

/** R12: components/ solo pinta: no llama a queries, a la red ni al host (imports multilínea incluidos). */
export function r12(files) {
  const BAD = /from\s*["'](\.\.?\/(\.\.\/)*queries(\.ts)?|@danil\/(platform-client|engine-client|host|session)(\/solid)?)["']/;
  const out = [];
  for (const f of files) {
    if (!(inFeature(f) && /\/components\//.test(f.path))) continue;
    const text = f.codeLines.join("\n");
    for (const m of text.matchAll(/^\s*import\s+(?!type\b)[\s\S]*?from\s*["'][^"']+["'];?/gm)) {
      if (!BAD.test(m[0])) continue;
      const line = text.slice(0, m.index).split("\n").length;
      out.push({ path: f.path, line, reason: "R12: components/ importa queries o un cliente/host; pasa datos y callbacks por props desde screens/" });
    }
  }
  return out;
}

/** R14: nada de detectar la plataforma por globales fuera de host (R15 de 03-structure). */
export function r14(files) {
  // Excepción: el glifo de un atajo (⌘ o Ctrl) en ui/lib/shortcuts.ts, que solo decide cómo se pinta.
  return scan(files, (f) => !/^packages\/host\//.test(f.path) && !/^apps\//.test(f.path) && f.path !== "packages/ui/src/lib/shortcuts.ts",
    /__TAURI__|__TAURI_INTERNALS__|navigator\.userAgent/,
    "R14: detección de plataforma fuera de host; usa host.kind");
}
