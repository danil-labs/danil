import { HighlightStyle } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";

/**
 * Cómo se pinta el editor de código. Solo variables de `@theme`: un color
 * escrito aquí no cambiaría con el tema. Contrastes medidos en
 * `docs/visual-system.md` § El editor de código.
 */

export const RESALTADO = HighlightStyle.define([
  {
    tag: [tags.keyword, tags.controlKeyword, tags.moduleKeyword, tags.operatorKeyword],
    color: "var(--color-syntax-keyword)",
  },
  { tag: [tags.string, tags.special(tags.string), tags.regexp], color: "var(--color-syntax-string)" },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], color: "var(--color-syntax-number)" },
  { tag: tags.comment, color: "var(--color-syntax-comment)", fontStyle: "italic" },
  {
    tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.macroName],
    color: "var(--color-syntax-function)",
  },
  {
    tag: [tags.typeName, tags.className, tags.namespace, tags.definition(tags.typeName)],
    color: "var(--color-syntax-type)",
  },
  { tag: [tags.tagName, tags.angleBracket], color: "var(--color-syntax-tag)" },
  { tag: [tags.attributeName, tags.propertyName], color: "var(--color-syntax-attribute)" },
  { tag: tags.heading, color: "var(--color-syntax-keyword)", fontWeight: "600" },
  { tag: [tags.link, tags.url], color: "var(--color-link)" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "600" },
  { tag: tags.invalid, color: "var(--color-error-strong)" },
]);

export const TEMA = EditorView.theme({
  "&": {
    backgroundColor: "var(--color-surface-muted)",
    color: "var(--color-neutral-950)",
    fontSize: "0.75rem",
    flex: "1 1 auto",
    minHeight: "0",
    minWidth: "0",
  },
  // Sin marco al escribir: en un campo de todo el panel, el cursor ya dice dónde está el foco.
  "&.cm-focused": { outline: "none" },
  // El scroll es del editor, como en VS Code: si creciera con el texto, el panel de fuera scrollearía la caja entera.
  ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.55", overflow: "auto" },
  ".cm-content": {
    padding: "0.75rem 0",
    caretColor: "var(--color-neutral-950)",
  },
  // El margen izquierdo separa el texto de los números; con él, el cursor de la columna 0 no queda tapado.
  ".cm-line": { padding: "0 1rem 0 0.25rem" },
  // La columna de números crece con los dígitos; el filete transparente es el `border-l-2` del diff.
  ".cm-gutters": {
    backgroundColor: "var(--color-surface-muted)",
    color: "var(--color-neutral-500)",
    border: "none",
    borderLeft: "2px solid transparent",
  },
  ".cm-foldGutter .cm-gutterElement": { color: "var(--color-neutral-500)", cursor: "pointer" },
  ".cm-fold-marker": { display: "inline-flex", alignItems: "center", height: "100%" },
  // Como en VS Code: los bloques abiertos solo enseñan su chevron al pasar por la columna; los plegados, siempre.
  ".cm-fold-marker[data-open=true]": { opacity: "0" },
  ".cm-gutters:hover .cm-fold-marker[data-open=true]": { opacity: "1" },
  ".cm-fold-marker:hover": { color: "var(--color-neutral-950)" },
  ".cm-foldPlaceholder": {
    backgroundColor: "var(--color-surface-raised)",
    border: "1px solid var(--color-border)",
    color: "var(--color-neutral-500)",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    boxSizing: "border-box",
    minWidth: "0",
    padding: "0 0.25rem 0 0.5rem",
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
  },
  // La línea activa se apaga sin foco: con el cursor fuera, marcaría una línea que nadie está editando.
  ".cm-activeLine": { backgroundColor: "var(--color-editor-active-line)" },
  "&:not(.cm-focused) .cm-activeLine, &.cm-has-selection .cm-activeLine": { backgroundColor: "transparent" },
  ".cm-activeLineGutter": { backgroundColor: "transparent" },
  "&.cm-focused .cm-lineNumbers .cm-activeLineGutter": { color: "var(--color-neutral-950)" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--color-neutral-950)" },
  "& .cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-content ::selection":
    { backgroundColor: "var(--color-editor-selection)" },
  ".cm-searchMatch": {
    backgroundColor: "var(--color-editor-match)",
    outline: "1px solid var(--color-warning)",
  },
  ".cm-searchMatch.cm-searchMatch-selected": {
    backgroundColor: "var(--color-editor-match)",
    outline: "2px solid var(--color-primary)",
  },
  "& .cm-matchingBracket, &.cm-focused .cm-matchingBracket": {
    backgroundColor: "transparent",
    outline: "1px solid var(--color-neutral-500)",
  },
  "& .cm-nonmatchingBracket, &.cm-focused .cm-nonmatchingBracket": {
    backgroundColor: "transparent",
    color: "var(--color-error-strong)",
  },
  ".cm-specialChar": { color: "var(--color-error-strong)" },
  ".cm-panels": { backgroundColor: "var(--color-surface-raised)", color: "var(--color-neutral-950)" },
  ".cm-panels.cm-panels-top": { borderBottom: "1px solid var(--color-border)" },
  ".cm-panel.cm-search": {
    padding: "0.375rem 2rem 0.375rem 0.75rem",
    fontFamily: "var(--font-sans)",
    fontSize: "0.75rem",
  },
  ".cm-panel.cm-search label": { fontSize: "0.75rem", color: "var(--color-neutral-500)" },
  ".cm-panel.cm-search [name=close]": { color: "var(--color-neutral-500)", fontSize: "1rem" },
  ".cm-textfield": {
    backgroundColor: "var(--color-surface)",
    color: "var(--color-neutral-950)",
    border: "1px solid var(--color-border-strong)",
    borderRadius: "var(--radius-sm)",
    fontFamily: "var(--font-mono)",
    fontSize: "0.75rem",
  },
  // Errores de compilación: el número de la línea, el subrayado y su tooltip.
  ".cm-lineNumbers .cm-numero-error": { color: "var(--color-error-strong)", fontWeight: "600" },
  ".cm-lineNumbers .cm-numero-aviso": { color: "var(--color-warning-strong)", fontWeight: "600" },
  ".cm-lintRange-error, .cm-lintRange-warning": {
    backgroundImage: "none",
    textDecorationLine: "underline",
    textDecorationStyle: "wavy",
    textDecorationSkipInk: "none",
    textUnderlineOffset: "3px",
  },
  ".cm-lintRange-error": { textDecorationColor: "var(--color-error-strong)" },
  // El lugar al que se saltó desde la vista o un error: una gota que se abre y la línea que se apaga.
  ".cm-gota": { position: "relative", display: "inline-block", width: "0", height: "1em", verticalAlign: "text-bottom" },
  ".cm-gota::after": {
    content: '""',
    position: "absolute",
    left: "-0.6em",
    top: "50%",
    width: "1.2em",
    height: "1.2em",
    marginTop: "-0.6em",
    borderRadius: "50%",
    backgroundColor: "color-mix(in srgb, var(--color-primary) 45%, transparent)",
    pointerEvents: "none",
    animation: "cm-gota 0.8s ease-out forwards",
  },
  "@keyframes cm-gota": {
    from: { transform: "scale(0.2)", opacity: "1" },
    to: { transform: "scale(2.6)", opacity: "0" },
  },
  ".cm-linea-saltada": { animation: "cm-linea-saltada 1.1s ease-out forwards" },
  "@keyframes cm-linea-saltada": {
    from: { backgroundColor: "color-mix(in srgb, var(--color-primary) 22%, transparent)" },
    to: { backgroundColor: "transparent" },
  },
  ".cm-lintRange-warning": { textDecorationColor: "var(--color-warning)" },
  ".cm-tooltip": {
    backgroundColor: "var(--color-surface-raised)",
    color: "var(--color-neutral-950)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-md)",
    fontFamily: "var(--font-sans)",
    fontSize: "0.75rem",
  },
  ".cm-tooltip-lint": { padding: "0", maxWidth: "28rem" },
  ".cm-diagnostic": { padding: "0.375rem 0.625rem", borderLeft: "3px solid transparent", whiteSpace: "pre-wrap" },
  ".cm-diagnostic-error": { borderLeftColor: "var(--color-error-strong)" },
  ".cm-diagnostic-warning": { borderLeftColor: "var(--color-warning)" },
  ".cm-diagnosticAction": {
    display: "block",
    margin: "0.375rem 0 0.125rem",
    padding: "0.125rem 0.5rem",
    border: "none",
    borderRadius: "var(--radius-sm)",
    backgroundColor: "var(--color-primary)",
    color: "var(--action-text)",
    font: "inherit",
    fontWeight: "600",
    cursor: "pointer",
  },
  ".cm-button, .cm-button:active": {
    backgroundImage: "none",
    backgroundColor: "var(--color-surface)",
    color: "var(--color-neutral-950)",
    border: "1px solid var(--color-border-strong)",
    borderRadius: "var(--radius-sm)",
    fontSize: "0.75rem",
  },
});
