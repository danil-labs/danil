/**
 * La web del teléfono después de un deploy. Una página abierta antes pide
 * pantallas (cada ruta es su propio trozo, `_expo/static/js/web/<ruta>-<hash>.js`)
 * que el build nuevo ya no tiene; el Worker contesta con la página
 * (`not_found_handling`), `nosniff` la rechaza y la pantalla se queda en blanco.
 * En iOS la PWA no se recarga al volver: sigue con el build de antes hasta que
 * algo la recarga.
 *
 * Al volver a la app, cada `CHECK_EVERY` y cuando falla un trozo, se pregunta
 * qué build está desplegado. Si es otro, se recarga sola salvo que haya algo
 * escrito, que se perdería: entonces se avisa (`UpdateNotice`) y la persona
 * decide. Es lo mismo que hace la web de escritorio (`apps/desktop/src/web/UpdateNotice.tsx`).
 */

/** Cada cuánto una página a la vista vuelve a preguntar. */
const CHECK_EVERY = 10 * 60_000;
/** Una recarga por ventana de tiempo: un trozo roto de verdad no entra en bucle. */
const RELOAD_GAP = 30_000;
const RELOADED_AT = "terminus.phone.reloaded-at";
const SCRIPT = /<script\b[^>]*\bsrc="([^"]*\/_expo\/static\/js\/web\/[^"]+\.js)"/g;

/**
 * El build de una página del teléfono: sus scripts (runtime, `__common` y la
 * entrada), cada uno con el hash de su contenido. Un deploy puede cambiar solo
 * `__common` y dejar la entrada igual. Sin entrada no es una página del teléfono.
 */
export function buildOf(sources: readonly string[]): string | null {
  return sources.some((src) => src.includes("/_expo/static/js/web/entry-")) ? sources.join(" ") : null;
}

export function scriptsOf(html: string): string[] {
  return Array.from(html.matchAll(SCRIPT), (match) => match[1]);
}

/** La página del teléfono a la que pertenece un build (`<base>m/`). */
export function pageOf(build: string): string {
  return build.slice(0, build.indexOf("_expo/static/"));
}

type Loader = ((path: unknown) => Promise<void>) & { isReady?: (paths: unknown) => boolean };

/**
 * Envuelve el cargador de trozos de Metro (`<prefijo>__loadBundleAsync`, que
 * Expo lee de `globalThis` en cada `import()`) para enterarse cuando uno falla,
 * sin cambiar lo que contesta.
 */
export function watchChunks(runtime: Record<string, unknown>, failed: (error: unknown) => void): boolean {
  const key = `${(runtime.__METRO_GLOBAL_PREFIX__ as string | undefined) ?? ""}__loadBundleAsync`;
  const load = runtime[key] as Loader | undefined;
  if (typeof load !== "function" || (load as { watched?: boolean }).watched) return false;
  const watched: Loader = (path) =>
    load(path).catch((error: unknown) => {
      failed(error);
      throw error;
    });
  if (load.isReady) watched.isReady = load.isReady;
  runtime[key] = Object.assign(watched, { watched: true });
  return true;
}

// Los trozos que Expo agrega después se quitan al cargar; quedan los del HTML.
const own = typeof document === "undefined" ? null : buildOf(Array.from(document.querySelectorAll('script[src*="/_expo/static/js/web/"]'), (script) => script.getAttribute("src") ?? ""));
let notice: (() => void) | null = null;

/** El build desplegado, o null si la respuesta no es esta página (un redirect al inicio de sesión, sin red). */
async function deployedBuild(): Promise<string | null> {
  if (!own) return null;
  const response = await fetch(pageOf(own), { cache: "no-store" });
  if (!response.ok || response.redirected) return null;
  const build = buildOf(scriptsOf(await response.text()));
  return build?.startsWith(pageOf(own)) ? build : null;
}

/** Hay texto sin enviar en pantalla: recargar lo borraría. */
function typing() {
  return Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("textarea, input:not([type=hidden])")).some((field) => field.value.trim() !== "");
}

function reloadOrAsk() {
  const last = Number(sessionStorage.getItem(RELOADED_AT) ?? 0);
  if (typing() || Date.now() - last < RELOAD_GAP) {
    notice?.();
    return;
  }
  sessionStorage.setItem(RELOADED_AT, String(Date.now()));
  window.location.reload();
}

/** Pregunta por el build; `quiet` solo avisa (la persona está usando la página), nunca recarga. */
async function check(quiet: boolean) {
  const build = await deployedBuild().catch(() => null);
  if (!build || build === own) return;
  if (quiet) notice?.();
  else reloadOrAsk();
}

if (typeof window !== "undefined" && own) watchChunks(globalThis as unknown as Record<string, unknown>, () => void check(false));

/** Escucha deploys mientras está montado; `show` pinta el aviso. Devuelve la limpieza. */
export function watchWebBuild(show: () => void): () => void {
  if (!own) return () => {};
  notice = show;
  const visible = () => {
    if (document.visibilityState === "visible") void check(false);
  };
  // `pageshow` cubre la página que Safari restaura de su caché al volver (bfcache).
  const restored = (event: PageTransitionEvent) => {
    if (event.persisted) void check(false);
  };
  const timer = setInterval(() => {
    if (document.visibilityState === "visible") void check(true);
  }, CHECK_EVERY);
  document.addEventListener("visibilitychange", visible);
  window.addEventListener("pageshow", restored);
  return () => {
    if (notice === show) notice = null;
    clearInterval(timer);
    document.removeEventListener("visibilitychange", visible);
    window.removeEventListener("pageshow", restored);
  };
}

export const reloadApp = () => window.location.reload();
