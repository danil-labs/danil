import { createSignal } from "solid-js";
import { callShellEngine } from "../../../session/src/shell-queries.ts";
import { imagenInerte } from "../../../ui/src/lib/chat/links";
import { capabilities } from "../../../host/src/platform";
import { machineOf } from "../../../features/machines/src/queries/store";

/**
 * El logo del workspace como `data:` URI. La ventana no pinta un `file://`
 * (`AGENTS.md` § el guarda `csp`).
 *
 * La ruta sigue siendo `logo.png` al reemplazar el archivo: sin vaciar esto,
 * el cuadro seguiría con la imagen anterior.
 */
export type LogoRead = { ok: true; url: string | null } | { ok: false };

const urls = new Map<string, Promise<LogoRead>>();
/** Último logo confirmado por clave: sobrevive a la revalidación para no flashear el monograma. */
const resolved = new Map<string, string | null>();
const invalidators = new Set<() => void>();
const [generacion, setGeneracion] = createSignal(0);

/** Registra una limpieza que debe ocurrir antes de que los efectos relean en `harness:workspace-name`. */
export function onLogoInvalidate(fn: () => void): void {
  invalidators.add(fn);
}

if (typeof window !== "undefined") {
  window.addEventListener("harness:workspace-name", () => {
    urls.clear();
    for (const invalidate of invalidators) invalidate();
    capabilities().accountAssets?.forget();
    setGeneracion((n) => n + 1);
  });
}

export function generacionDeLogo(): number {
  return generacion();
}

/** Un logo que no se pudo leer (su máquina apagada o aún conectando) se vuelve a pedir más tarde. */
const REINTENTO = 15_000;
let reintentando = false;

export function scheduleLogoRetry(): void {
  if (reintentando) return;
  reintentando = true;
  setTimeout(() => {
    reintentando = false;
    setGeneracion((n) => n + 1);
  }, REINTENTO);
}

/** Último `data:` URI ya confirmado para este workspace/ruta, o `null` si aún no se conoce. */
export function cachedLogoUrl(path: string | null, workspace: string | null = null): string | null {
  const cuenta = workspace ? capabilities().accountAssets : undefined;
  if (cuenta && workspace) {
    const hit = resolved.get(`cuenta:${workspace}`);
    if (hit !== undefined) return hit;
  }
  return path ? (resolved.get(path) ?? null) : null;
}

/**
 * En la web, el de un workspace que la cuenta conoce sale de la cuenta (su
 * `null` es «sin logo»); si no, el archivo de su máquina. Distingue un fallo
 * transitorio (`ok: false`) de una respuesta confirmada (`ok: true`).
 */
export function readLogoUrl(path: string | null, workspace: string | null = null): Promise<LogoRead> {
  const cuenta = workspace ? capabilities().accountAssets : undefined;
  if (cuenta && workspace) {
    const clave = `cuenta:${workspace}`;
    let pendiente = urls.get(clave);
    if (!pendiente) {
      pendiente = cuenta
        .read(workspace, "logo")
        .catch(() => undefined)
        .then(async (v): Promise<LogoRead> => {
          if (v !== undefined) {
            resolved.set(clave, v);
            return { ok: true, url: v };
          }
          if (!path) {
            urls.delete(clave);
            scheduleLogoRetry();
            return { ok: false };
          }
          const motor = await delMotor(path);
          if (motor.ok) resolved.set(clave, motor.url);
          else urls.delete(clave);
          return motor;
        });
      urls.set(clave, pendiente);
    }
    return pendiente;
  }
  return path ? delMotor(path) : Promise.resolve({ ok: true, url: null });
}

export function urlDeLogo(path: string | null, workspace: string | null = null): Promise<string | null> {
  return readLogoUrl(path, workspace).then((r) => (r.ok ? r.url : null));
}

function delMotor(path: string): Promise<LogoRead> {
  let pendiente = urls.get(path);
  if (!pendiente) {
    pendiente = callShellEngine<{ data_url: string | null }>("preview_file", { path, rel: path }, machineOf(path))
      .then((v): LogoRead => {
        const url = imagenInerte(v.data_url);
        resolved.set(path, url);
        return { ok: true, url };
      })
      .catch((): LogoRead => {
        urls.delete(path);
        scheduleLogoRetry();
        return { ok: false };
      });
    urls.set(path, pendiente);
  }
  return pendiente;
}
