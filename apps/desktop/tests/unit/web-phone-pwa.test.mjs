import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { runInNewContext } from "node:vm";

import { PHONE_ICONS, phoneHeaders, phoneManifest, phoneWorker } from "../../scripts/web-phone-pwa.mjs";

const mobile = fileURLToPath(new URL("../../../mobile/", import.meta.url));
const exported = fileURLToPath(new URL("../../dist-web/terminus/m/", import.meta.url));
const BASE = "/terminus/";

/** Ancho y alto de un PNG, de su cabecera IHDR. */
function pngSize(path) {
  const bytes = readFileSync(path);
  assert.equal(bytes.toString("latin1", 1, 4), "PNG", `${path} no es PNG`);
  return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
}

/** Las etiquetas que vuelven instalable la página, en iOS y en Android. */
function assertInstallableHead(html, where) {
  const has = (pattern, what) => assert.match(html, pattern, `${where}: falta ${what}`);
  has(/<html lang="es">/, 'lang="es"');
  has(/<link rel="manifest" href="manifest\.webmanifest"/, "el manifest");
  has(/<link rel="apple-touch-icon" sizes="180x180" href="icons\/apple-touch-icon\.png"/, "apple-touch-icon");
  has(/<meta name="apple-mobile-web-app-capable" content="yes"/, "apple-mobile-web-app-capable");
  has(/<meta name="mobile-web-app-capable" content="yes"/, "mobile-web-app-capable");
  has(/<meta name="apple-mobile-web-app-title" content="Danil"/, "apple-mobile-web-app-title");
  has(/<meta name="apple-mobile-web-app-status-bar-style" content="[\w-]+"/, "apple-mobile-web-app-status-bar-style");
  has(/<meta name="theme-color" content="#[0-9a-f]{6}"/, "theme-color");
  has(/<meta name="viewport" content="[^"]*viewport-fit=cover/, "viewport-fit=cover");
  // El service worker lo registra la app al activar los avisos, no la página.
  assert.doesNotMatch(html, /serviceWorker/, `${where}: no registra service worker`);
}

test("el manifest del teléfono es instalable y su scope cubre el inicio de sesión de Danil", () => {
  const manifest = phoneManifest(BASE);
  // `id` y `start_url` no se cambian: cambiarlos obliga a reinstalar.
  assert.equal(manifest.id, "/terminus/m/");
  assert.equal(manifest.start_url, "/terminus/m/");
  assert.equal(manifest.scope, "/");
  assert.notEqual(manifest.id, "/", "la app de Danil ya usa id \"/\" en el mismo origen");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.name, "Danil");
  assert.equal(manifest.short_name, "Danil");
  assert.equal(manifest.lang, "es");
  assert.match(manifest.theme_color, /^#[0-9a-f]{6}$/);
  assert.match(manifest.background_color, /^#[0-9a-f]{6}$/);

  const sizes = (purpose) => manifest.icons.filter((icon) => icon.purpose === purpose).map((icon) => icon.sizes);
  assert.ok(sizes("any").includes("192x192") && sizes("any").includes("512x512"), "faltan los íconos de 192 y 512");
  assert.ok(sizes("maskable").length > 0, "falta el ícono maskable");
  for (const icon of manifest.icons) {
    assert.ok(icon.src.startsWith("/terminus/m/icons/"), `${icon.src} no está bajo el teléfono`);
  }
});

test("los íconos existen en public/ con el tamaño que dice el manifest", () => {
  for (const icon of PHONE_ICONS) {
    const path = join(mobile, "public", icon.src);
    assert.ok(existsSync(path), `falta ${icon.src}`);
    assert.equal(pngSize(path), icon.sizes, icon.src);
  }
  assert.equal(pngSize(join(mobile, "public/icons/apple-touch-icon.png")), "180x180");
});

test("la plantilla de Expo lleva las etiquetas de PWA y Expo pone la página en español", () => {
  const template = readFileSync(join(mobile, "public/index.html"), "utf8");
  assertInstallableHead(template.replace("%LANG_ISO_CODE%", "es"), "public/index.html");
  const app = JSON.parse(readFileSync(join(mobile, "app.json"), "utf8"));
  assert.equal(app.expo.web.lang, "es");
});

test("index.html y el manifest se revalidan, y los bundles con hash se guardan largo", () => {
  const rules = new Map();
  let path;
  for (const line of phoneHeaders(BASE)) {
    if (!line) continue;
    if (!line.startsWith(" ")) rules.set((path = line), []);
    else rules.get(path).push(line.trim());
  }
  for (const page of ["/terminus/m/", "/terminus/m/index.html", "/terminus/m/manifest.webmanifest", "/terminus/m/sw.js"]) {
    assert.ok(rules.get(page)?.includes("Cache-Control: no-cache"), `${page} debe revalidarse`);
  }
  assert.ok(rules.get("/terminus/m/manifest.webmanifest").includes("Content-Type: application/manifest+json"));
  for (const hashed of ["/terminus/m/_expo/static/*", "/terminus/assets/*"]) {
    assert.ok(rules.get(hashed)?.some((header) => header.includes("immutable")), `${hashed} debe guardarse largo`);
  }
});

test("lo exportado por `pnpm web:build` trae el manifest, los íconos y las etiquetas", (t) => {
  if (!existsSync(join(exported, "index.html"))) {
    t.skip("sin dist-web/terminus/m (corre `pnpm web:build`)");
    return;
  }
  assertInstallableHead(readFileSync(join(exported, "index.html"), "utf8"), "dist-web/terminus/m/index.html");
  const manifest = JSON.parse(readFileSync(join(exported, "manifest.webmanifest"), "utf8"));
  assert.deepEqual(manifest, phoneManifest(BASE));
  assert.doesNotMatch(readFileSync(join(exported, "sw.js"), "utf8"), /__TERMINUS_SIGN_IN__/, "sw.js exportado sin la entrada");
  for (const icon of [...PHONE_ICONS.map((each) => each.src), "icons/apple-touch-icon.png"]) {
    assert.ok(existsSync(join(exported, icon)), `falta ${icon} en la exportación`);
  }
  const headers = readFileSync(fileURLToPath(new URL("../../dist-web/_headers", import.meta.url)), "utf8");
  assert.match(headers, /^\/terminus\/\*\n {2}Content-Security-Policy: default-src 'self'/m, "la CSP permite el manifest y los íconos (default-src/img-src 'self')");
  assert.match(headers, /^\/terminus\/m\/manifest\.webmanifest\n {2}Content-Type: application\/manifest\+json/m);
});

/** Corre `sw.js` con un `self` mínimo y devuelve sus manejadores y lo que hizo. */
function worker(source, { scope = "https://app.danil.ai/terminus/m/", windows = [] } = {}) {
  const handlers = {};
  const shown = [];
  const opened = [];
  // Lo que el sistema tiene en pantalla: `showNotification` reemplaza por `tag`.
  let onScreen = [];
  const self = {
    addEventListener: (name, handler) => { handlers[name] = handler; },
    skipWaiting: () => {},
    navigator: { language: "es-MX" },
    location: new URL(scope),
    registration: {
      scope,
      showNotification: async (title, options) => {
        shown.push({ title, ...options });
        onScreen = onScreen.filter((each) => each.tag !== options.tag).concat([{ title, ...options }]);
      },
      getNotifications: async ({ tag } = {}) => onScreen.filter((each) => !tag || each.tag === tag),
    },
    clients: { claim: async () => {}, matchAll: async () => windows, openWindow: async (url) => { opened.push(url); } },
  };
  runInNewContext(source, { self, URL, JSON, encodeURIComponent });
  const fire = async (name, event) => {
    let done;
    handlers[name]({ ...event, waitUntil: (promise) => { done = promise; } });
    await done;
  };
  return { handlers, shown, opened, fire };
}

const built = (base = "/terminus/", login = `${base}auth`) => phoneWorker(readFileSync(join(mobile, "public/sw.js"), "utf8"), login, base);
const pushed = (data) => ({ data: { json: () => data } });

test("el service worker solo muestra avisos: sin fetch ni caché", () => {
  const { handlers } = worker(built());
  assert.deepEqual(Object.keys(handlers).sort(), ["activate", "install", "notificationclick", "push"]);
});

test("un aviso de tarea abre esa tarea y nombra la tarea, nunca acepta una dirección del payload", async () => {
  const sw = worker(built());
  await sw.fire("push", pushed({ kind: "asked", computer: "cmp_1", workspace: "fqgx1w8m", folder: null, session: "t1", url: "https://evil.test/", task: "  Deploy\n  de prueba  " }));
  const [notice] = sw.shown;
  assert.equal(notice.title, "Deploy de prueba · Te preguntó algo");
  assert.equal(notice.body, "Toca para abrirla.");
  assert.equal(notice.tag, "task:cmp_1:t1");
  assert.equal(notice.renotify, true, "la primera vez que la tarea pide algo, suena");
  assert.equal(notice.silent, false);
  const to = new URL(notice.data.url);
  assert.equal(to.origin + to.pathname, "https://app.danil.ai/terminus/m/");
  assert.equal(to.searchParams.get("to"), "/task/cmp_1/fqgx1w8m/_/t1");
  await sw.fire("notificationclick", { notification: { data: notice.data, close() {} } });
  assert.deepEqual(sw.opened, [notice.data.url]);
});

test("el nombre y el cuerpo vienen recortados, y sin texto vuelve la frase fija", async () => {
  const sw = worker(built());
  await sw.fire("push", pushed({ kind: "failed", computer: "cmp_1", workspace: "w", session: "t1", task: "a".repeat(400), body: "b".repeat(400) }));
  assert.equal(sw.shown[0].title, `${"a".repeat(79)}… · Se detuvo`);
  assert.equal(sw.shown[0].body, `${"b".repeat(159)}…`);
  await sw.fire("push", pushed({ kind: "finished", computer: "cmp_1", workspace: "w", session: "t2", task: "   ", body: 7 }));
  assert.equal(sw.shown[1].title, "Tu tarea terminó");
  assert.equal(sw.shown[1].body, "Toca para abrirla.");
});

test("una tarea tiene una sola notificación: la última sustituye y no vuelve a sonar", async () => {
  const sw = worker(built());
  await sw.fire("push", pushed({ kind: "approving", computer: "cmp_1", workspace: "w", session: "t1", task: "Deploy" }));
  await sw.fire("push", pushed({ kind: "finished", computer: "cmp_1", workspace: "w", session: "t1", task: "Deploy" }));
  assert.equal(sw.shown.length, 2, "se muestra el último aviso");
  assert.equal(sw.shown[1].tag, sw.shown[0].tag);
  assert.equal(sw.shown[1].renotify, false, "la misma tarea no vuelve a interrumpir");
  assert.equal(sw.shown[1].silent, true);
  assert.equal(sw.shown[1].title, "Deploy · Terminó");
});

test("con la app a la vista no suena, y «terminó» nunca suena", async () => {
  const seen = worker(built(), { windows: [{ visibilityState: "visible", focus: async () => {}, navigate: async () => ({}) }] });
  await seen.fire("push", pushed({ kind: "asked", computer: "cmp_1", workspace: "w", session: "t1" }));
  assert.equal(seen.shown[0].renotify, false);
  assert.equal(seen.shown[0].silent, true);
  const other = worker(built());
  await other.fire("push", pushed({ kind: "finished", computer: "cmp_1", workspace: "w", session: "t1" }));
  assert.equal(other.shown[0].renotify, false);
  assert.equal(other.shown[0].silent, true);
});

test("un identificador raro abre el inicio del teléfono, no otra ruta", async () => {
  const sw = worker(built());
  await sw.fire("push", pushed({ kind: "finished", computer: "../x", workspace: "w", session: "t" }));
  assert.equal(sw.shown[0].data.url, "https://app.danil.ai/terminus/m/");
});

test("el aviso de inicio de sesión va a la entrada de ese build y vuelve al teléfono", async () => {
  const app = worker(built());
  await app.fire("push", pushed({ kind: "sign_in" }));
  assert.equal(app.shown[0].data.url, "https://app.danil.ai/terminus/auth?next=%2Fterminus%2Fm%2F");
  const alfa = worker(built("/", "/sign-in"), { scope: "https://alfa-app.danil.ai/m/" });
  await alfa.fire("push", pushed({ kind: "sign_in" }));
  assert.equal(alfa.shown[0].data.url, "https://alfa-app.danil.ai/sign-in?next=%2Fm%2F");
  assert.throws(() => built("/", "https://evil.test/sign-in"), /mismo origen/);
});

test("con la app abierta el toque la lleva ahí; si no la controla, abre otra ventana", async () => {
  const visited = [];
  const open = { focus: async () => {}, navigate: async (url) => { visited.push(url); return {}; } };
  const sw = worker(built(), { windows: [open] });
  await sw.fire("notificationclick", { notification: { data: { url: "https://app.danil.ai/terminus/m/?to=x" }, close() {} } });
  assert.deepEqual([visited, sw.opened], [["https://app.danil.ai/terminus/m/?to=x"], []]);
  const outside = { focus: async () => {}, navigate: async () => { throw new TypeError("not controlled"); } };
  const other = worker(built(), { windows: [outside] });
  await other.fire("notificationclick", { notification: { data: { url: "https://app.danil.ai/terminus/m/" }, close() {} } });
  assert.deepEqual(other.opened, ["https://app.danil.ai/terminus/m/"]);
  const foreign = worker(built());
  await foreign.fire("notificationclick", { notification: { data: { url: "https://evil.test/" }, close() {} } });
  assert.deepEqual(foreign.opened, []);
});
