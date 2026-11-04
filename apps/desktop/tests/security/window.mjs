#!/usr/bin/env node
/**
 * Ataca la ventana del chat y dice qué salió.
 *
 * La pregunta es la misma que la del contenedor de artefactos, un piso más
 * arriba: cuando el agente contesta con markdown que salió del repo del cliente,
 * ¿puede ese markdown sacar material de la máquina? El contenedor no cubre esto
 * —el chat no va dentro de ningún marco— y la app promete que todo
 * lo que sale queda anotado en `publications.jsonl`. Una imagen remota que se pide
 * sola no pasa por ninguna de las cinco salidas.
 *
 *     node tests/security/window.mjs
 *
 * Levanta la sonda, el servidor de desarrollo y los dos motores, y no toca nada
 * más: los navegadores van headless, así que esto no le quita la pantalla a nadie.
 *
 * **WebKit es el motor del webview en macOS**, así que es el banco fiel; Chromium
 * es WebView2, o sea Windows. Se corren los dos porque una política que solo se
 * comprueba en uno es media verificación — y las dos plataformas la aplican por su
 * cuenta.
 *
 * ## Las cuatro mitades, y hacen falta las cuatro
 *
 * | Corrida | Qué contesta |
 * |---|---|
 * | `window.html` + `render=real` | La app de verdad: aquí no puede salir nada |
 * | `window.html` + `render=crudo` | Solo la política: con el renderizador de antes del arreglo, ¿alcanza? |
 * | `unrestricted-window.html` + `render=crudo` | **El control negativo**: sin política y sin filtro, todo tiene que salir |
 * | `unrestricted-window.html` + `render=real` | Solo el filtro: sin política, ¿alcanza? |
 *
 * Sin el control negativo, un registro vacío se lee igual que un candado que
 * funciona y que una prueba mal escrita. Ya pasó al verificar la contención de
 * Claude.
 *
 * Playwright no es dependencia de este repo —no hace falta para compilar la app— y
 * se toma de donde esté:
 *
 *     PLAYWRIGHT=$(npm root -g)/playwright node tests/security/window.mjs
 */
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "../..");
const PUERTO_VITE = Number(process.env.HARNESS_DEV_PORT || 5199);
// `localhost` y no `127.0.0.1`: Vite se ata a lo que resuelva `localhost`, que en
// macOS es `::1` primero. Con la IP escrita a mano no contesta y parece caído.
const BASE = `http://localhost:${PUERTO_VITE}`;

/** Los cuatro enlaces, por lo que dicen: el texto sobrevive aunque el `href` no. */
const ENLACES = [
  ["a-javascript", "Ver el detalle"],
  ["a-data", "Abrir el informe"],
  ["a-navegacion", "Fuente original"],
  ["CONTROL a-https", "Documentación del producto"],
];

// ─── la sonda ────────────────────────────────────────────────────────────────

const registro = [];
const sonda = spawn(process.execPath, [join(raiz, "tests/security/probe.mjs")], {
  stdio: ["ignore", "pipe", "inherit"],
});
sonda.stdout.setEncoding("utf8");
sonda.stdout.on("data", (t) => {
  for (const linea of t.split("\n")) {
    const m = linea.match(/#\d+\s+(\w+)\s+(\S+)/);
    if (m) registro.push({ metodo: m[1], url: m[2] });
  }
});

/** Lo que llegó desde la marca, que es cómo se separa una fase de la siguiente. */
const desde = (marca) => registro.slice(marca).map((r) => r.url);
const marca = () => registro.length;

// ─── el servidor de desarrollo ───────────────────────────────────────────────

const vite = spawn(process.execPath, [join(raiz, "node_modules/vite/bin/vite.js")], {
  cwd: raiz,
  env: { ...process.env, HARNESS_DEV_PORT: String(PUERTO_VITE) },
  stdio: ["ignore", "pipe", "pipe"],
});
let salidaVite = "";
for (const flujo of [vite.stdout, vite.stderr]) {
  flujo.setEncoding("utf8");
  flujo.on("data", (t) => (salidaVite += t));
}

async function esperarVite() {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`${BASE}/tests/security/window.html`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`el servidor de desarrollo no levantó en ${BASE}\n${salidaVite}`);
}

function limpiar() {
  sonda.kill();
  vite.kill();
}
process.on("exit", limpiar);
process.on("SIGINT", () => process.exit(1));

// ─── una corrida ─────────────────────────────────────────────────────────────

/**
 * Cada clic va sobre una página recién cargada. Un `javascript:` que cambia el
 * documento o una navegación que se lleva la página dejarían al siguiente vector
 * midiendo otra cosa.
 */
async function corrida(navegador, pagina, render) {
  const url = `${BASE}/tests/security/${pagina}?render=${render}`;
  const ctx = await navegador.newContext();
  const filas = [];
  const consola = [];

  const abrir = async () => {
    const p = await ctx.newPage();
    p.on("console", (m) => consola.push(m.text()));
    p.on("pageerror", (e) => consola.push(`pageerror: ${e.message}`));
    await p.goto(url, { waitUntil: "load" });
    await p.waitForTimeout(1200);
    return p;
  };

  // Fase 1 · pintar, sin tocar nada.
  let m = marca();
  let p = await abrir();
  const painted = desde(m);
  const dom = await p.evaluate(() => ({
    imgs: [...document.querySelectorAll("#respuesta img")].map((i) => i.getAttribute("src")),
    enlaces: [...document.querySelectorAll("#respuesta a")].map((a) => a.getAttribute("href")),
    artefacto: window.__ARTEFACTO__,
  }));
  filas.push({ vector: "img-inline + img-referencia (SIN CLIC)", salio: painted });
  await p.close();

  // Fase 2 · un clic por vector, cada uno en su página.
  for (const [nombre, texto] of ENLACES) {
    m = marca();
    p = await abrir();
    const antes = p.url();
    try {
      await p.getByText(texto, { exact: true }).click({ timeout: 3000, noWaitAfter: true });
    } catch (e) {
      filas.push({ vector: nombre, salio: [], nota: `no se pudo pulsar: ${String(e).split("\n")[0]}` });
      await p.close();
      continue;
    }
    await p.waitForTimeout(1000);
    // Defensivo a propósito: si el vector se llevó el documento, los globales del
    // laboratorio ya no están, y eso es un resultado —no un fallo de la prueba—.
    const efecto = await p.evaluate(() => ({
      titulo: document.title,
      escalada: (window.__ESCALADA__ ?? []).map((e) => e.cmd),
    }));
    filas.push({
      vector: nombre,
      // Cada clic va sobre una página recién cargada, así que las dos imágenes del
      // pintado vuelven a pedirse. Lo que este vector añade es lo que no estaba.
      salio: desde(m).filter((u) => !painted.includes(u)),
      titulo: efecto.titulo === "SECUESTRADA" ? "el documento cambió de título" : "",
      escalada: efecto.escalada,
      navego: p.url() !== antes ? p.url() : "",
    });
    await p.close();
  }

  await ctx.close();
  return { filas, dom, consola };
}

// ─── el informe ──────────────────────────────────────────────────────────────

function imprimir(titulo, r) {
  console.log(`\n### ${titulo}`);
  for (const f of r.filas) {
    const salio = f.salio.length ? f.salio.map((u) => `      salió → ${u}`).join("\n") : "      (nada)";
    console.log(`  ${f.vector}`);
    console.log(salio);
    if (f.titulo) console.log(`      ${f.titulo}`);
    if (f.escalada?.length) console.log(`      llamó al puente de Tauri → invoke(${f.escalada.join(", ")})`);
    if (f.navego) console.log(`      la ventana navegó a ${f.navego}`);
    if (f.nota) console.log(`      ${f.nota}`);
  }
  console.log(`  DOM · imágenes pintadas: ${JSON.stringify(r.dom.imgs)}`);
  console.log(`  DOM · enlaces con destino: ${JSON.stringify(r.dom.enlaces)}`);
  console.log(
    `  CONTROL · el artefacto sigue vivo: ${r.dom.artefacto?.vivo ? `sí (contó ${r.dom.artefacto.filas} filas)` : "NO — el contenedor se rompió"}`,
  );
  // El recargado en caliente abre un WebSocket contra el servidor de desarrollo.
  // `connect-src 'self'` tiene que alcanzarlo: si no, la política se cobra el
  // desarrollo entero y nadie lo nota hasta guardar un archivo y no ver nada.
  console.log(
    `  CONTROL · el recargado en caliente conectó: ${r.consola.some((c) => /\[vite\] connected/.test(c)) ? "sí" : "NO"}`,
  );
  // Quién paró qué: la política de la app, el navegador por su cuenta, o nadie.
  const quejas = [
    ...new Set(r.consola.filter((c) => /Content-Security-Policy|Refused to|Not allowed|blocked/i.test(c))),
  ];
  if (quejas.length) {
    console.log("  quién se quejó:");
    for (const v of quejas.slice(0, 8)) console.log(`      ${v.replace(/\s+/g, " ").slice(0, 150)}`);
  }
}

// ─── correr ──────────────────────────────────────────────────────────────────

/**
 * Playwright puede estar en cualquier sitio —hasta en la caché de `npx`—, así que
 * se busca desde varias raíces y se importa por ruta de archivo: `import()` de un
 * directorio no resuelve, y el mensaje que da Node en ese caso no dice eso.
 */
async function cargarPlaywright() {
  const req = createRequire(import.meta.url);
  const p = process.env.PLAYWRIGHT;
  const raices = [raiz, process.cwd(), ...(p ? [p, dirname(p), dirname(dirname(p))] : [])];
  for (const desde of raices) {
    try {
      // Playwright es CommonJS: sus motores cuelgan de `default`, no del espacio
      // de nombres. Sin esto el fallo sale como «no puedo leer launch de undefined».
      const m = await import(pathToFileURL(req.resolve("playwright", { paths: [desde] })).href);
      return m.webkit ? m : m.default;
    } catch {}
  }
  console.error(
    "\n  Falta Playwright, que no es dependencia de este repo.\n" +
      "  Instálalo donde quieras y apunta:  PLAYWRIGHT=/ruta/a/node_modules/playwright node tests/security/window.mjs\n",
  );
  process.exit(1);
}

const playwright = await cargarPlaywright();

await esperarVite();

const CORRIDAS = [
  ["LA APP · política de la ventana + Markdown.tsx", "window.html", "real"],
  ["SOLO LA POLÍTICA · con el renderizador de antes", "window.html", "crudo"],
  ["SOLO EL FILTRO · sin política", "unrestricted-window.html", "real"],
  ["CONTROL NEGATIVO · sin política y sin filtro", "unrestricted-window.html", "crudo"],
];

for (const motor of ["webkit", "chromium"]) {
  const navegador = await playwright[motor].launch();
  const version = navegador.version();
  console.log(`\n══ ${motor} ${version} ${motor === "webkit" ? "(el webview de macOS)" : "(el de Windows)"} ══`);
  for (const [titulo, pagina, render] of CORRIDAS) {
    imprimir(titulo, await corrida(navegador, pagina, render));
  }
  await navegador.close();
}

console.log("");
limpiar();
process.exit(0);
