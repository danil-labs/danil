export const VISUAL_THEME_TOKENS = [
  "--color-surface", "--color-surface-muted", "--color-surface-raised",
  "--color-neutral-950", "--color-neutral-900", "--color-neutral-700", "--color-neutral-500",
  "--color-primary", "--color-border", "--color-success-strong", "--color-error-strong",
  "--color-warning-strong", "--color-info-strong", "--color-link",
] as const;

export type VisualTheme = {
  mode: "light" | "dark";
  tokens: Record<string, string>;
  fontFamily: string;
  fontSize: string;
  lineHeight: string;
};

export const CSS_INLINE = String.raw`
:root {
  --background: var(--color-surface);
  --foreground: var(--color-neutral-950);
  --muted: var(--color-surface-muted);
  --muted-foreground: var(--color-neutral-500);
  --primary: var(--color-primary);
  --border: var(--color-border);
}
html, body {
  box-sizing: border-box !important;
  margin: 0 !important; padding: 0 !important;
  width: 100% !important; max-width: none !important;
  height: auto !important; min-height: 0 !important;
  background: transparent !important; color: var(--foreground) !important;
  font-family: var(--visual-font-family) !important;
  font-size: var(--visual-font-size) !important;
  line-height: var(--visual-line-height) !important;
}
button, input, select, textarea { font: inherit; color: inherit; }
button, input { accent-color: var(--primary); }
a { color: var(--color-link); }
h1, h2, h3 { font-size: 1em; margin: 0 0 .5em; }
svg, canvas, img { max-width: 100%; }
:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
`;

export const JS_INLINE = String.raw`
(function () {
  var lastHeight = 0;
  var pending = false;
  function measure() {
    pending = false;
    var root = document.documentElement;
    var overflow = root.style.getPropertyValue("overflow-y");
    var priority = root.style.getPropertyPriority("overflow-y");
    // La barra del viewport puede reenvolver el contenido que determina su propio alto.
    // Se mide sin ella y se restaura antes del pintado, incluso en el visor ampliado.
    root.style.setProperty("overflow-y", "hidden", "important");
    var height;
    try {
      height = Math.ceil(Math.max(root.getBoundingClientRect().height,
        document.body.getBoundingClientRect().height, document.body.scrollHeight) +
        Math.max(0, window.innerHeight - root.clientHeight));
    } finally {
      if (overflow) root.style.setProperty("overflow-y", overflow, priority);
      else root.style.removeProperty("overflow-y");
    }
    height = Math.max(48, Math.min(4096, height));
    if (height === lastHeight) return;
    lastHeight = height;
    parent.postMessage({ type: "terminus:visual-height", height: height }, "*");
  }
  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(measure);
  }
  window.addEventListener("message", function (event) {
    if (event.source !== parent) return;
    var message = event.data;
    if (!message || message.type !== "terminus:visual-theme") return;
    var theme = message.theme;
    if (!theme || (theme.mode !== "light" && theme.mode !== "dark")) return;
    document.documentElement.dataset.theme = theme.mode;
    document.documentElement.style.colorScheme = theme.mode;
    Object.keys(theme.tokens || {}).forEach(function (key) {
      if (/^--color-[a-z0-9-]+$/.test(key) && typeof theme.tokens[key] === "string") {
        document.documentElement.style.setProperty(key, theme.tokens[key]);
      }
    });
    document.documentElement.style.setProperty("--visual-font-family", theme.fontFamily);
    document.documentElement.style.setProperty("--visual-font-size", theme.fontSize);
    document.documentElement.style.setProperty("--visual-line-height", theme.lineHeight);
    schedule();
  });
  window.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !event.defaultPrevented) {
      parent.postMessage({ type: "terminus:visual-escape" }, "*");
    }
  });
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(schedule).observe(document.body);
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
  window.addEventListener("resize", schedule);
  window.addEventListener("load", schedule);
  document.fonts.ready.then(schedule);
  schedule();
})();
`;

export function inlineVisualStyles(font: string, theme: VisualTheme): string {
  const cssValue = (value: string) => value.replace(/[<>{};]/g, "");
  const tokens = VISUAL_THEME_TOKENS.map((key) => `${key}:${cssValue(theme.tokens[key] ?? "")}`).join(";");
  return `@font-face{font-family:Geist;src:url(${font});font-weight:100 900}` +
    `:root{${tokens};color-scheme:${theme.mode};--visual-font-family:${cssValue(theme.fontFamily)};` +
    `--visual-font-size:${cssValue(theme.fontSize)};--visual-line-height:${cssValue(theme.lineHeight)}}` + CSS_INLINE;
}
