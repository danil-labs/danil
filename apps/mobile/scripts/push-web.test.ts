import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

// Solo se sustituye la configuración Expo; el flujo y el cliente HTTP son reales.
registerHooks({ resolve(specifier, context, next) {
  if (context.parentURL?.endsWith("/push.web.ts")) {
    if (specifier === "./supabase") return { url: "data:text/javascript,export const COMPUTERS='https://push.invalid'", shortCircuit: true };
    if (specifier === "./alpha-mode") return { url: "data:text/javascript,export const WEB_BASE='/m-base/'", shortCircuit: true };
    if (specifier === "@terminus/computers") return { url: new URL("../../../packages/computers/src/push.ts", import.meta.url).href, shortCircuit: true };
  }
  return next(specifier, context);
} });
const { enablePush, pushState, disablePush, renewPush } = await import("../src/lib/push.web.ts");

function setup(permission = "granted") {
  const calls: string[] = [];
  const subscription = { endpoint: "https://push.invalid/device", toJSON: () => ({ keys: { p256dh: "key", auth: "auth" } }), unsubscribe: async () => { calls.push("unsubscribe"); return true; } };
  const worker = Object.assign(new EventTarget(), { state: "activated" });
  const own = { scope: "https://app.invalid/m-base/m/", active: worker, installing: null, waiting: null, pushManager: {
    getSubscription: async () => null as typeof subscription | null,
    subscribe: async () => { assert.equal(worker.state, "activated"); calls.push("subscribe"); return subscription; },
  } };
  const root = { ...own, scope: "https://app.invalid/", pushManager: { getSubscription: async () => subscription, subscribe: async () => { throw Error("root subscribed"); } } };
  let found = root;
  const serviceWorker = {
    getRegistration: async () => found,
    register: async () => { calls.push("register"); found = own; return own; },
    ready: Promise.resolve(root),
  };
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { serviceWorker, userAgent: "Chrome Android" } });
  Object.assign(globalThis, { window: { location: { href: "https://app.invalid/m-base/m/" }, PushManager: class {}, Notification: {}, matchMedia: () => ({ matches: false }) }, document: {}, Notification: { permission, requestPermission: async () => permission } });
  globalThis.fetch = async (url, init) => {
    calls.push(`${init?.method} ${url}`);
    return Response.json(String(url).endsWith("config") ? { public_key: "AQID" } : {});
  };
  return { calls, own, root, worker, subscription, selectOwn: () => { found = own; } };
}

test("un worker raíz no cuenta como avisos móviles ni se borra o renueva", async () => {
  const s = setup();
  assert.equal((await pushState()).on, false);
  await disablePush(async () => "token");
  await renewPush(async () => "token");
  assert.deepEqual(s.calls, []);
});

test("activar crea el scope móvil aunque ready ya resuelva al worker raíz", async () => {
  const s = setup();
  await enablePush(async () => "token");
  assert.deepEqual(s.calls, ["GET https://push.invalid/v1/push/config", "register", "subscribe", "POST https://push.invalid/v1/push/subscriptions"]);
});

test("espera la activación del registro móvil antes de suscribir", async () => {
  const s = setup();
  s.worker.state = "installing";
  s.own.active = null as never;
  s.own.installing = s.worker as never;
  const enabled = enablePush(async () => "token");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(s.calls.includes("subscribe"), false);
  s.worker.state = "activated";
  s.own.active = s.worker;
  s.worker.dispatchEvent(new Event("statechange"));
  await enabled;
  assert.equal(s.calls.includes("subscribe"), true);
});

test("permiso default o denied no manda peticiones", async () => {
  for (const permission of ["default", "denied"]) {
    const s = setup(permission);
    await assert.rejects(enablePush(async () => "token"), /push_denied/);
    assert.deepEqual(s.calls, []);
  }
});

test("reutiliza la suscripción móvil sin registrarla de nuevo", async () => {
  const s = setup();
  s.selectOwn();
  s.own.pushManager.getSubscription = async () => s.subscription;
  await enablePush(async () => "token");
  assert.deepEqual(s.calls, ["GET https://push.invalid/v1/push/config", "POST https://push.invalid/v1/push/subscriptions"]);
});

test("una instalación fallida termina sin guardar suscripción", async () => {
  const s = setup();
  s.selectOwn();
  s.worker.state = "installing";
  s.own.active = null as never;
  s.own.installing = s.worker as never;
  const enabled = enablePush(async () => "token");
  const rejected = assert.rejects(enabled, /push_worker_failed/);
  await new Promise((resolve) => setImmediate(resolve));
  s.worker.state = "redundant";
  s.worker.dispatchEvent(new Event("statechange"));
  await rejected;
  assert.deepEqual(s.calls, ["GET https://push.invalid/v1/push/config"]);
});

test("si requestPermission rechaza, el error ocurre antes de la red", async () => {
  const s = setup();
  Object.assign(Notification, { requestPermission: async () => { throw new DOMException("permission unavailable", "NotAllowedError"); } });
  await assert.rejects(enablePush(async () => "token"), { name: "NotAllowedError" });
  assert.deepEqual(s.calls, []);
});

test("un fallo del navegador dice en qué paso ocurrió y no llega a guardar", async () => {
  const s = setup();
  s.own.pushManager.subscribe = async () => { throw new DOMException("Registration failed - push service error", "AbortError"); };
  await assert.rejects(enablePush(async () => "token"), { message: "subscribe: AbortError: Registration failed - push service error" });
  assert.deepEqual(s.calls, ["GET https://push.invalid/v1/push/config", "register"]);
});
