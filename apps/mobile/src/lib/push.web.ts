import { forgetPushDevice, keyBytes, type PushMode, pushPreferences, pushPublicKey, savePushDevice, savePushPreferences, testPush } from "@terminus/computers";
import { WEB_BASE } from "./alpha-mode";
import type { PushState } from "./push";
import { COMPUTERS } from "./supabase";

/**
 * Avisos push en la web del teléfono: el service worker `<base>m/sw.js` con su
 * propio scope (en app.danil.ai la raíz es de Appv2) y la suscripción guardada
 * en el plano de control. iOS solo los entrega a la app instalada en el inicio.
 */
const SCOPE = `${WEB_BASE}m/`;

/** Solo en un build de prueba (`TERMINUS_WEB_PUSH_TEST=1`, staging): el aviso de prueba. */
export const PUSH_TEST = process.env.EXPO_PUBLIC_TERMINUS_PUSH_TEST === "1";

const supported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/** Safari en iPhone o iPad: no sustituye ni silencia (`tag`, `renotify`, `silent`). */
export const PUSH_IOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && "ontouchend" in document);

function needsInstall(): boolean {
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return PUSH_IOS && !standalone;
}

async function ownRegistration(): Promise<ServiceWorkerRegistration | undefined> {
  const found = await navigator.serviceWorker.getRegistration(SCOPE);
  // getRegistration busca por prefijo: también puede devolver el worker raíz.
  return found?.scope === new URL(SCOPE, window.location.href).href ? found : undefined;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const found = (await ownRegistration()) ?? await navigator.serviceWorker.register(`${SCOPE}sw.js`, { scope: SCOPE });
  const worker = found.active ?? found.installing ?? found.waiting;
  if (!worker) throw new Error("push_worker_missing");
  if (worker.state !== "activated") {
    await new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => {
        clearTimeout(timer);
        worker.removeEventListener("statechange", changed);
        if (error) reject(error);
        else resolve();
      };
      const changed = () => {
        if (worker.state === "activated") finish();
        else if (worker.state === "redundant") finish(new Error("push_worker_failed"));
      };
      const timer = setTimeout(() => finish(new Error("push_worker_timeout")), 15_000);
      worker.addEventListener("statechange", changed);
      changed();
    });
  }
  return found;
}

async function current(): Promise<PushSubscription | null> {
  const found = await ownRegistration();
  return found ? found.pushManager.getSubscription() : null;
}

function device(subscription: PushSubscription) {
  const keys = subscription.toJSON().keys ?? {};
  return { endpoint: subscription.endpoint, p256dh: keys.p256dh ?? "", auth: keys.auth ?? "", user_agent: navigator.userAgent.slice(0, 256) };
}

async function save(getToken: () => Promise<string>, subscription: PushSubscription): Promise<void> {
  const answer = await savePushDevice(COMPUTERS, await getToken(), device(subscription));
  if (answer.kind !== "ok") throw new Error(answer.kind === "error" ? answer.code ?? "push_save_failed" : answer.kind);
}

export async function pushState(): Promise<PushState> {
  if (!supported()) return { supported: false, needsInstall: needsInstall(), blocked: false, on: false };
  return { supported: true, needsInstall: needsInstall(), blocked: Notification.permission === "denied", on: Boolean(await current().catch(() => null)) };
}

/** El paso que falló y lo que dijo el navegador, p. ej. `subscribe: AbortError: …`; staging lo muestra en la fila. */
async function step<T>(name: string, action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (err) {
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    throw new Error(`${name}: ${detail}`.slice(0, 200));
  }
}

/** Pide permiso con el toque de la persona; iOS lo exige. */
export async function enablePush(getToken: () => Promise<string>): Promise<void> {
  if ((await Notification.requestPermission()) !== "granted") throw new Error("push_denied");
  const key = await pushPublicKey(COMPUTERS);
  if (!key) throw new Error("push_disabled");
  const found = await step("register", registration);
  const subscription = await step("subscribe", async () => (await found.pushManager.getSubscription()) ?? (await found.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) })));
  await step("save", () => save(getToken, subscription));
}

/** Antes de cerrar sesión: después ya no hay token para borrar la fila. */
export async function disablePush(getToken: () => Promise<string>): Promise<void> {
  if (!supported()) return;
  const subscription = await current().catch(() => null);
  if (!subscription) return;
  await getToken().then((token) => forgetPushDevice(COMPUTERS, token, device(subscription))).catch(() => null);
  await subscription.unsubscribe().catch(() => false);
}

/** Al abrir: renueva `last_seen_at` y ata el dispositivo a la cuenta de ahora. */
export async function renewPush(getToken: () => Promise<string>): Promise<void> {
  if (!supported() || Notification.permission !== "granted") return;
  const subscription = await current().catch(() => null);
  if (subscription) await save(getToken, subscription).catch(() => undefined);
}

export async function sendTestPush(getToken: () => Promise<string>): Promise<number> {
  const answer = await testPush(COMPUTERS, await getToken());
  if (answer.kind !== "ok") throw new Error("push_test_failed");
  return answer.value.sent;
}

/** La preferencia guardada en el relay; si no contesta, «todo» (lo que ya hacía). */
export async function readPushMode(getToken: () => Promise<string>): Promise<PushMode> {
  const answer = await pushPreferences(COMPUTERS, await getToken());
  return answer.kind === "ok" ? answer.value.mode : "all";
}

export async function writePushMode(getToken: () => Promise<string>, mode: PushMode): Promise<PushMode> {
  const answer = await savePushPreferences(COMPUTERS, await getToken(), mode);
  if (answer.kind !== "ok") throw new Error(answer.kind === "error" ? answer.code ?? "push_mode_failed" : "push_mode_failed");
  return answer.value.mode;
}
