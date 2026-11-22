import { createSignal } from "solid-js";
import { invoke } from "../../../../engine-client/src/client.ts";
import { machineOf } from "../../../../host/src/machine";

/**
 * La cara propia, ya leída como `data:` URI. La política de la ventana no
 * pinta un `file://` (`AGENTS.md` § el guarda `csp`).
 *
 * La ruta no cambia al reemplazar el archivo: sin vaciar esto, la cara vieja
 * se quedaría hasta reiniciar.
 */
const urls = new Map<string, Promise<string | null>>();
const [generacion, setGeneracion] = createSignal(0);

if (typeof window !== "undefined") {
  window.addEventListener("harness:profiles", () => {
    urls.clear();
    setGeneracion((n) => n + 1);
  });
}

export function generacionDeAvatar(): number {
  return generacion();
}

export function urlDeAvatar(path: string): Promise<string | null> {
  let pendiente = urls.get(path);
  if (!pendiente) {
    pendiente = invoke<{ data_url: string | null }>("preview_file", { path, rel: path }, machineOf(path))
      .then((v) => v.data_url)
      .catch(() => null);
    urls.set(path, pendiente);
  }
  return pendiente;
}
