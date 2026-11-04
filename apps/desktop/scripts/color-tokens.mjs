#!/usr/bin/env node
/**
 * Escribe `docs/color-tokens.html`: las muestras de cada token en las cuatro paletas,
 * leídas de `src/styles/global.css`. Córrelo al cambiar un color:
 *   node scripts/color-tokens.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));

const css = readFileSync(join(RAIZ, "src/styles/global.css"), "utf8");

function bloque(selector) {
  const inicio = css.indexOf("{", css.indexOf(selector));
  let nivel = 0;
  let fin = inicio;
  for (; fin < css.length; fin++) {
    if (css[fin] === "{") nivel++;
    if (css[fin] === "}" && --nivel === 0) break;
  }
  const cuerpo = css.slice(inicio + 1, fin).replace(/\/\*[\s\S]*?\*\//g, "");
  return Object.fromEntries([...cuerpo.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim().replace(/\s+/g, " ")]));
}

const claro = { ...bloque("@theme static"), ...bloque(":root {") };
const azul = bloque('[data-theme="dark"] {');
const grafito = bloque('[data-theme="dark"][data-dark-style="graphite"]');
const claroGrafito = bloque('[data-theme="light"][data-light-style="graphite"]');
const PALETAS = [
  { id: "claro", nombre: "Claro violeta", vars: claro, propias: claro },
  { id: "claro-grafito", nombre: "Claro grafito", vars: { ...claro, ...claroGrafito }, propias: claroGrafito },
  { id: "grafito", nombre: "Oscuro grafito", vars: { ...claro, ...azul, ...grafito }, propias: grafito },
  { id: "azul", nombre: "Oscuro azul", vars: { ...claro, ...azul }, propias: azul },
];

const GRUPOS = [
  ["Superficies", [
    ["bg", "Suelo de la ventana"], ["surface-muted", "Código y diff"], ["surface", "Composer, tarjetas"],
    ["surface-raised", "Menús, globo de un agente"], ["rail", "Riel de Ajustes"], ["border", "Borde"], ["border-strong", "Borde de controles"],
  ]],
  ["Rampa de neutros", [
    ["neutral-50", ""], ["neutral-100", ""], ["neutral-200", ""], ["neutral-300", ""],
    ["neutral-500", "Texto secundario"], ["neutral-700", "Texto atenuado"], ["neutral-900", ""], ["neutral-950", "Texto principal"],
  ]],
  ["Acción y marca", [
    ["primary", "Acción"], ["primary-dark", "Hover de la acción"], ["--action-text", "Texto sobre la acción"],
    ["emphasis", "Negritas"], ["link", "Enlaces"], ["secondary", ""], ["accent", ""],
    ["brand-yellow", ""], ["brand-navy", ""], ["brand-purple", ""],
  ]],
  ["Chat", [["chat-user", "Globo de la persona"], ["chat-user-border", "Su borde"], ["chat-incoming", "Globo de un agente"]]],
  ["Estado", [
    ["success", ""], ["error", ""], ["warning", ""], ["info", ""],
    ["success-strong", "Texto"], ["error-strong", "Texto"], ["warning-strong", "Texto"], ["info-strong", "Texto"],
  ]],
  ["Diff", [["diff-add", "Línea añadida"], ["diff-del", "Línea quitada"], ["diff-add-word", "Tramo añadido"], ["diff-del-word", "Tramo quitado"]]],
  ["Sintaxis y editor", [
    ["syntax-keyword", ""], ["syntax-string", ""], ["syntax-number", ""], ["syntax-function", ""], ["syntax-type", ""],
    ["syntax-tag", ""], ["syntax-attribute", ""], ["syntax-comment", ""], ["editor-selection", ""], ["editor-match", ""], ["editor-active-line", ""],
  ]],
];

const nombre = (t) => (t.startsWith("--") ? t : `--color-${t}`);
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const declarar = (vars) => Object.entries(vars).map(([k, v]) => `${k}:${v};`).join("");

const celda = (p, t) => {
  const k = nombre(t);
  const valor = p.vars[k];
  const heredado = !(k in p.propias);
  return `<td><span class="m" style="background:linear-gradient(var(${k}),var(${k})),var(--color-bg)"></span><code class="${heredado ? "h" : ""}">${esc(valor ?? "—")}</code></td>`;
};

const vista = (p) => `<div class="vista p-${p.id}">
  <b>${p.nombre}</b>
  <div class="sup"><div class="globo yo">Tu mensaje</div><div class="globo otro">Un agente</div>
  <p>Texto con <strong>negrita</strong>, <a>un enlace</a> y <span class="sec">un metadato</span>.</p>
  <span class="btn">Enviar</span></div></div>`;

const barra = (p) => `<div class="lado p-${p.id}">
  <div class="col">
    <div class="tit">Proyectos</div>
    <div class="proy"><span class="ico" style="background:var(--astro-sun-2)"></span>Terminus App<span class="n">12</span></div>
    <div class="tarea">Imagen por ruta<span class="n">2 h</span></div>
    <div class="tarea hover">Cohete finalizar<span class="n">ayer</span></div>
    <div class="tarea sel">Paleta de colores<span class="n">ahora</span></div>
    <div class="tarea">Release 0.2.72<span class="n">ayer</span></div>
    <div class="proy"><span class="ico" style="background:var(--astro-planet-2)"></span>Radiant<span class="n">4</span></div>
    <div class="tarea">Cliente nativo<span class="n">lun</span></div>
  </div>
  <div class="chat"><span>${p.nombre}</span></div>
</div>`;

const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Danil · Tokens de color</title>
<style>
${PALETAS.map((p) => `.p-${p.id}{${declarar(p.vars)}}`).join("\n")}
body{margin:0;background:#f4f4f5;color:#18181b;font:13px/1.5 ui-sans-serif,system-ui,-apple-system,sans-serif}
.page{max-width:1280px;margin:0 auto;padding:32px}
h1{font-size:26px;margin:0}h2{font-size:17px;margin:36px 0 10px}
.lead{color:#52525b;margin:6px 0 0;max-width:760px}
.vistas{display:grid;grid-template-columns:repeat(2,1fr);gap:16px;margin-top:24px}
.vista{background:var(--color-bg);color:var(--color-neutral-950);border:1px solid var(--color-border-strong);border-radius:8px;padding:12px}
.vista>b{display:block;margin-bottom:8px}
.sup{background:var(--color-surface);border:1px solid var(--color-border);border-radius:8px;padding:12px;display:grid;gap:8px}
.globo{padding:6px 10px;border-radius:8px;width:fit-content}
.yo{justify-self:end;background:var(--color-chat-user);border:1px solid var(--color-chat-user-border)}
.otro{background:var(--color-chat-incoming);box-shadow:var(--shadow-sm)}
.sup p{margin:0;color:var(--color-neutral-900)}
.sup strong{color:var(--color-emphasis)}.sup a{color:var(--color-link);text-decoration:underline}
.sec{color:var(--color-neutral-500)}
.btn{justify-self:start;background:var(--color-primary);color:var(--action-text);padding:4px 12px;border-radius:6px;font-weight:500}
.lado{display:grid;grid-template-columns:200px 1fr;height:250px;border:1px solid #d4d4d8;border-radius:8px;overflow:hidden}
.col{background:var(--color-bg);border-right:1px solid var(--color-border);padding:10px 8px;display:grid;align-content:start;gap:1px;color:var(--color-neutral-950)}
.tit{font-size:11px;color:var(--color-neutral-500);padding:0 6px 6px;text-transform:uppercase;letter-spacing:.05em}
.proy{display:flex;align-items:center;gap:6px;padding:4px 6px;border-radius:var(--radius-sm);font-weight:500;margin-top:4px}
.ico{width:14px;height:14px;border-radius:50%}
.tarea{display:flex;padding:3px 6px 3px 26px;border:1px solid transparent;border-radius:var(--radius-sm);color:var(--color-neutral-950)}
.tarea.hover{background:var(--color-neutral-100)}
.tarea.sel{background:var(--color-neutral-200);border-color:var(--color-neutral-500);font-weight:600;box-shadow:var(--shadow-sm)}
.n{margin-left:auto;font-size:11px;color:var(--color-neutral-500);font-weight:400}
.chat{background:var(--color-surface);display:grid;place-items:center;color:var(--color-neutral-500)}
table{width:100%;table-layout:fixed;border-collapse:collapse;background:#fff;border:1px solid #e4e4e7;border-radius:8px;overflow:hidden}
th,td{text-align:left;padding:6px 10px;border-top:1px solid #f0f0f2;vertical-align:middle}
th:first-child,td:first-child{width:18%}th{background:#fafafa;font-weight:600;font-size:12px;color:#52525b}
td:first-child code{color:#18181b}
td small{display:block;color:#71717a}
td .m{display:inline-block;width:40px;height:22px;border-radius:4px;border:1px solid rgb(0 0 0/.12);vertical-align:middle;margin-right:8px}
code{font:11.5px ui-monospace,"SF Mono",monospace;color:#3f3f46}
code.h{color:#a1a1aa}
</style></head><body><div class="page">
<h1>Tokens de color</h1>
<p class="lead">Generado desde <code>src/styles/global.css</code> con <code>node scripts/color-tokens.mjs</code>. Cada muestra se pinta con la variable real de su paleta. El valor en gris es heredado: la paleta no lo redeclara. Lo explica <code>docs/color-tokens.md</code>.</p>
<div class="vistas">${PALETAS.map(vista).join("")}</div>
<h2>Sidebar</h2>
<p class="lead">La columna va en <code>bg</code> con borde <code>border</code>; la tarea abierta en <code>neutral-200</code> con borde <code>neutral-500</code>, el hover en <code>neutral-100</code> y los metadatos en <code>neutral-500</code>. A la derecha empieza el chat, en <code>surface</code>.</p>
<div class="vistas">${PALETAS.map(barra).join("")}</div>
${GRUPOS.map(([titulo, tokens]) => `<h2>${titulo}</h2><table><tr><th>Token</th>${PALETAS.map((p) => `<th>${p.nombre}</th>`).join("")}</tr>
${tokens.map(([t, uso]) => `<tr><td><code>${nombre(t)}</code>${uso ? `<small>${uso}</small>` : ""}</td>${PALETAS.map((p) => celda(p, t).replace("<td>", `<td class="p-${p.id}">`)).join("")}</tr>`).join("\n")}</table>`).join("\n")}
</div></body></html>
`;

writeFileSync(join(RAIZ, "docs/color-tokens.html"), html);
console.log("docs/color-tokens.html escrito.");
