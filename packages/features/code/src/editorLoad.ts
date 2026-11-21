import type { Extension } from "@codemirror/state";
import { gramaticaDe } from "./languages";

export const cargarEditor = () => import("./CodeEditor");

const COMUNES = ["a.ts", "a.tsx", "a.js", "a.json", "a.md", "a.rs", "a.py", "a.go", "a.java"];

/** Baja el editor y las gramáticas frecuentes y los deja inicializados (`calentar`). */
export async function calentarEditor() {
  const [modulo, ...gramaticas] = await Promise.all([cargarEditor(), ...COMUNES.map(gramaticaDe)]);
  modulo.calentar(gramaticas.filter((g): g is Extension => g !== null));
}

/** Cuando la ventana está ociosa, para no competir con el arranque. WKWebView no tiene `requestIdleCallback`. */
export function precargarEditor() {
  const tarde = (f: () => void) =>
    "requestIdleCallback" in window ? window.requestIdleCallback(f) : setTimeout(f, 1500);
  tarde(() => void calentarEditor());
}
