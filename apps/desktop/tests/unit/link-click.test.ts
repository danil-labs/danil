/**
 * Los servidores locales se abren en Danil; los demás enlaces conservan
 * el selector y el modificador para abrir el navegador.
 *
 * Prueba `clicEnEnlaceWeb`, que es lo que llama el `onClick` del enlace en
 * `ui/Markdown.tsx`, con eventos de ratón de jsdom. No monta el popover.
 */
import assert from "node:assert/strict";
import test, { before } from "node:test";
import { JSDOM } from "jsdom";

let clicEnEnlaceWeb: typeof import("../../src/lib/links.ts").clicEnEnlaceWeb;
const DESTINO = "https://ejemplo.test/informe";

before(async () => {
  const dom = new JSDOM("<!doctype html><body></body>");
  const g = globalThis as unknown as Record<string, unknown>;
  g.window = dom.window;
  // El de Node no lo acepta el `dispatchEvent` de jsdom.
  g.CustomEvent = dom.window.CustomEvent;
  ({ clicEnEnlaceWeb } = await import("../../src/lib/links.ts"));
});

function clic(mod: { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean }, mac: boolean, destino = DESTINO) {
  const fuera: string[] = [];
  const oir = (e: Event) => fuera.push((e as CustomEvent<string>).detail);
  window.addEventListener("harness:abrir-fuera", oir);
  let panel = 0;
  const e = new window.MouseEvent("click", { bubbles: true, cancelable: true, ...mod });
  clicEnEnlaceWeb(e, destino, () => panel++, mac);
  window.removeEventListener("harness:abrir-fuera", oir);
  return { fuera, panel, navega: !e.defaultPrevented };
}

test("los servidores locales se abren en Danil sin menú ni navegador", () => {
  for (const destino of ["http://localhost:5173/", "https://LOCALHOST/app?q=1#x", "http://127.0.0.1:3000", "http://[::1]:8080/"]) {
    for (const mac of [false, true]) {
      for (const mod of [{}, { ctrlKey: true }, { metaKey: true }]) {
        const dentro: string[] = [];
        const fuera: string[] = [];
        const local = (e: Event) => dentro.push((e as CustomEvent<string>).detail);
        const externo = (e: Event) => fuera.push((e as CustomEvent<string>).detail);
        window.addEventListener("harness:abrir-sitio", local);
        window.addEventListener("harness:abrir-fuera", externo);
        let panel = 0;
        const e = new window.MouseEvent("click", { cancelable: true, ...mod });
        try {
          clicEnEnlaceWeb(e, destino, () => panel++, mac);
          assert.deepEqual({ dentro, fuera, panel, navega: !e.defaultPrevented }, { dentro: [destino], fuera: [], panel: 0, navega: false }, destino);
        } finally {
          window.removeEventListener("harness:abrir-sitio", local);
          window.removeEventListener("harness:abrir-fuera", externo);
        }
      }
    }
  }
});

test("los hosts parecidos y las demás direcciones conservan el selector", () => {
  for (const destino of ["https://localhost.example/", "http://127.0.0.1.nip.io:5173", "https://example.test/?url=http://localhost", "http://0.0.0.0:5173", "http://127.0.0.2:5173", "http://local.lan:5173", "mailto:dev@localhost", "user@localhost", "http://user:pass@localhost:5173"]) {
    const dentro: string[] = [];
    const local = (e: Event) => dentro.push((e as CustomEvent<string>).detail);
    window.addEventListener("harness:abrir-sitio", local);
    let panel = 0;
    const e = new window.MouseEvent("click", { cancelable: true });
    try {
      clicEnEnlaceWeb(e, destino, () => panel++, false);
      assert.deepEqual({ dentro, panel, navega: !e.defaultPrevented }, { dentro: [], panel: 1, navega: false }, destino);
    } finally {
      window.removeEventListener("harness:abrir-sitio", local);
    }
  }
});

test("los hosts parecidos conservan Ctrl y Cmd para abrir fuera", () => {
  const destino = "https://localhost.example/";
  assert.deepEqual(clic({ ctrlKey: true }, false, destino), { fuera: [destino], panel: 0, navega: false });
  assert.deepEqual(clic({ metaKey: true }, true, destino), { fuera: [destino], panel: 0, navega: false });
});

test("Ctrl+clic fuera de macOS abre en el navegador y no el panel", () => {
  assert.deepEqual(clic({ ctrlKey: true }, false), { fuera: [DESTINO], panel: 0, navega: false });
});

test("⌘+clic en macOS abre en el navegador y no el panel", () => {
  assert.deepEqual(clic({ metaKey: true }, true), { fuera: [DESTINO], panel: 0, navega: false });
});

test("el clic simple abre el panel y no sale", () => {
  assert.deepEqual(clic({}, false), { fuera: [], panel: 1, navega: false });
  assert.deepEqual(clic({}, true), { fuera: [], panel: 1, navega: false });
});

test("el modificador de la otra plataforma no cuenta", () => {
  // En macOS Ctrl+clic es el clic derecho; en Windows ⌘ es la tecla Windows.
  assert.deepEqual(clic({ ctrlKey: true }, true), { fuera: [], panel: 1, navega: false });
  assert.deepEqual(clic({ metaKey: true }, false), { fuera: [], panel: 1, navega: false });
});
