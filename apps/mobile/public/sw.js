/*
 * Avisos del teléfono: solo `push` y `notificationclick`, sin `fetch` ni caché,
 * así que nunca toca la red de la app. Vive en `<base>m/` con ese scope: en
 * app.danil.ai la raíz es del service worker de Appv2.
 *
 * El aviso nunca trae una dirección: se arma aquí con sus identificadores, y
 * `sign_in` solo lleva a la entrada de este mismo origen, que escribe el build
 * (`web-mobile.mjs`) porque cambia con la base y con WorkOS.
 *
 * Hay una sola notificación por tarea (`tag`): la última sustituye a la
 * anterior. Solo vuelve a sonar si la tarea pide algo y no había nada suyo en
 * pantalla; un aviso de «terminó» se actualiza en silencio.
 */

const SIGN_IN = "__TERMINUS_SIGN_IN__";

const WORDS = {
  es: { finished: "Tu tarea terminó", failed: "Tu tarea se detuvo", approving: "Tu tarea pide aprobación", asked: "Tu tarea te preguntó algo", sign_in: "Inicia sesión en Danil", body: "Toca para abrirla.", sign_in_body: "Toca para abrir la pantalla de inicio de sesión." },
  en: { finished: "Your task finished", failed: "Your task stopped", approving: "Your task needs approval", asked: "Your task asked you something", sign_in: "Sign in to Danil", body: "Tap to open it.", sign_in_body: "Tap to open the sign-in screen." },
};
const KINDS = ["finished", "failed", "approving", "asked", "sign_in"];
/** El estado en una o dos palabras, para encabezar con el nombre de la tarea. */
const SHORT = {
  es: { finished: "Terminó", failed: "Se detuvo", approving: "Pide aprobación", asked: "Te preguntó algo" },
  en: { finished: "Finished", failed: "Stopped", approving: "Needs approval", asked: "Asked you something" },
};
/** Los que interrumpen: piden una decisión de la persona. */
const NEEDS_YOU = ["approving", "asked", "failed"];
/** Lo que puede volver a sonar una vez; después solo se sustituye. */
const RINGS = [...NEEDS_YOU, "sign_in"];
const ID = /^[A-Za-z0-9._:-]{1,128}$/;
/** Topes del texto que manda el relay: un título no es un párrafo. */
const TASK_MAX = 80;
const BODY_MAX = 160;

/** Texto de una línea, sin controles, recortado; `null` si no queda nada. */
function line(value, max) {
  if (typeof value !== "string") return null;
  const clean = value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  if (!clean) return null;
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

function targetOf(notice) {
  const scope = new URL(self.registration.scope);
  if (notice.kind === "sign_in") return SIGN_IN.startsWith("/") ? new URL(SIGN_IN, scope).href : scope.href;
  const { computer, workspace, folder, session } = notice;
  if (![computer, workspace, session].every((id) => ID.test(id ?? "")) || !(folder == null || ID.test(folder))) return scope.href;
  const path = [computer, workspace, folder || "_", session].map(encodeURIComponent).join("/");
  scope.searchParams.set("to", `/task/${path}`);
  return scope.href;
}

/** Lo que ya está en pantalla y si hay una ventana de la app a la vista. */
async function screen(tag) {
  const shown = await Promise.resolve()
    .then(() => self.registration.getNotifications?.({ tag }))
    .catch(() => undefined);
  const windows = await Promise.resolve()
    .then(() => self.clients.matchAll({ type: "window", includeUncontrolled: true }))
    .catch(() => []);
  return { shown: Array.isArray(shown) ? shown : [], visible: windows.some((client) => client.visibilityState === "visible") };
}

self.addEventListener("push", (event) => {
  let notice = {};
  try {
    notice = event.data ? event.data.json() : {};
  } catch {
    notice = {};
  }
  const lang = (self.navigator.language || "").toLowerCase().startsWith("es") ? "es" : "en";
  const words = WORDS[lang];
  const kind = KINDS.includes(notice.kind) ? notice.kind : "finished";
  const signIn = kind === "sign_in";
  const tag = signIn ? "sign-in" : `task:${notice.computer}:${notice.session}`;
  event.waitUntil((async () => {
    // Safari retira la suscripción tras varios avisos que no se muestran: siempre se muestra.
    const { shown, visible } = await screen(tag);
    // Una tarea, una notificación: si ya hay una suya (o estás viendo la app),
    // se sustituye en silencio en vez de volver a interrumpir.
    const ring = RINGS.includes(kind) && shown.length === 0 && !visible;
    const task = signIn ? null : line(notice.task, TASK_MAX);
    const title = task ? `${task} · ${SHORT[lang][kind]}` : words[kind];
    await self.registration.showNotification(title, {
      body: line(notice.body, BODY_MAX) ?? (signIn ? words.sign_in_body : words.body),
      icon: new URL("icons/icon-192.png", self.registration.scope).href,
      tag,
      renotify: ring,
      silent: !ring,
      data: { url: targetOf(notice) },
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url;
  if (!url || new URL(url).origin !== self.location.origin) return;
  event.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const window = open.find((client) => "navigate" in client);
    // `navigate` falla en una ventana que este worker no controla: entonces se abre otra.
    const moved = window ? await window.focus().then(() => window.navigate(url)).catch(() => null) : null;
    if (!moved) await self.clients.openWindow(url);
  })());
});
