import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const declarations = (css, selector) => {
  const start = css.indexOf(`\n${selector} {`) + 1;
  if (start === 0) throw new Error(`Missing theme: ${selector}`);
  const body = css.slice(start + selector.length + 2, css.indexOf("}", start));
  return [...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]);
};
const used = ["--color-bg", "--color-surface", "--color-surface-muted", "--color-surface-raised", "--color-border", "--color-border-strong", "--color-primary", "--color-primary-dark", "--action-text", "--color-neutral-200", "--color-neutral-500", "--color-neutral-700", "--color-neutral-950", "--color-error-strong", "--color-success-strong", "--color-warning-strong", "--font-sans", "--font-display", "--radius-sm", "--radius-md"];

export function generateAuthPage(css) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const base = new Map([...declarations(clean, "@theme static"), ...declarations(clean, ":root")]);
  const theme = (selectors) => {
    const vars = new Map(base);
    for (const selector of selectors) for (const [key, value] of declarations(clean, selector)) vars.set(key, value);
    const resolve = (key, seen = new Set()) => {
      if (!vars.has(key) || seen.has(key)) throw new Error(`Missing or circular token: ${key}`);
      return vars.get(key).replace(/var\((--[\w-]+)\)/g, (_, ref) => resolve(ref, new Set([...seen, key])));
    };
    return used.map((key) => `  ${key}: ${resolve(key)};`).join("\n");
  };
  const fonts = [...clean.matchAll(/@font-face\s*\{[^}]+\}/g)].map((m) => m[0]).filter((s) => /font-family: "(?:Geist"|Bricolage Grotesque")/.test(s)).join("\n");
  return `/* Generated from apps/desktop/src/styles/global.css. Run node packages/design/scripts/auth-page.mjs. */
${fonts}
:root {
${theme(['[data-theme="light"][data-light-style="violet"]'])}
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
:root {
${theme(['[data-theme="dark"]', '[data-theme="dark"][data-dark-style="graphite"]'])}
  color-scheme: dark;
}
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--color-bg); color: var(--color-neutral-950); font-family: var(--font-sans); font-size: 14px; line-height: 1.5; }
h1, h2 { font-family: var(--font-display); }
.auth-button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 32px; padding: 6px 12px; border: 1px solid transparent; border-radius: var(--radius-md); font: inherit; font-weight: 500; background: var(--color-primary); color: var(--action-text); cursor: pointer; }
.auth-button:hover { background: var(--color-primary-dark); }
.auth-button:disabled { opacity: .5; cursor: default; }
.auth-button-secondary { background: var(--color-surface); color: var(--color-neutral-950); border-color: var(--color-border); }
.auth-button-secondary:hover { background: var(--color-neutral-200); }
.auth-checkbox { accent-color: var(--color-primary); width: 16px; height: 16px; }
.auth-chip { display: inline-flex; align-items: center; gap: 6px; padding: 2px 10px; border: 1px solid var(--color-border); border-radius: 9999px; background: var(--color-surface-muted); color: var(--color-neutral-700); font-size: 11px; font-weight: 560; }
.auth-card { border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); padding: 16px; }
.auth-button:focus-visible, .auth-checkbox:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const css = readFileSync(new URL("../../../apps/desktop/src/styles/global.css", import.meta.url), "utf8");
  const target = new URL("../auth-page.css", import.meta.url);
  const generated = generateAuthPage(css);
  if (process.argv.includes("--check")) {
    if (readFileSync(target, "utf8") !== generated) throw new Error("auth-page.css differs from global.css");
  } else writeFileSync(fileURLToPath(target), generated);
}
