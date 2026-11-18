import test from "node:test";
import assert from "node:assert/strict";
import { generateAuthPage } from "../../../../packages/design/scripts/auth-page.mjs";

const tokens = ["color-bg", "color-surface", "color-surface-muted", "color-surface-raised", "color-border", "color-border-strong", "color-primary", "color-primary-dark", "action-text", "color-neutral-200", "color-neutral-500", "color-neutral-700", "color-neutral-950", "color-error-strong", "color-success-strong", "color-warning-strong", "font-sans", "font-display", "radius-sm", "radius-md"];
const input = `\n@font-face { font-family: "Geist"; src: url("./fonts/geist.woff2"); }\n@font-face { font-family: "Bricolage Grotesque"; src: url("./fonts/display.woff2"); }\n@theme static { ${tokens.map((name) => `--${name}: initial;`).join(" ")} }\n:root { --action-text: white; --brand: violet; }\n[data-theme="light"][data-light-style="violet"] { --color-primary: var(--brand); }\n[data-theme="dark"] { --color-bg: black; }\n[data-theme="dark"][data-dark-style="graphite"] { --color-primary: silver; }`;
test("auth page emits both system themes, local fonts and the shared atoms", () => {
  const css = generateAuthPage(input);
  assert.match(css, /--color-primary: violet;/);
  assert.match(css, /prefers-color-scheme: dark/);
  assert.match(css, /--color-primary: silver;/);
  for (const atom of ["button", "checkbox", "chip", "card"]) assert.ok(css.includes(`.auth-${atom}`));
  assert.match(css, /font-family: "Geist"/); assert.match(css, /font-family: "Bricolage Grotesque"/);
  assert.match(css, /accent-color: var\(--color-primary\)/);
  assert.match(css, /focus-visible/);
  assert.match(css, /\.auth-button-secondary \{ background: var\(--color-surface-raised\);.*border-color: var\(--color-border-strong\)/);
});
test("missing source themes cannot silently produce a divergent auth page", () => { assert.throws(() => generateAuthPage(""), /Missing theme/); });
