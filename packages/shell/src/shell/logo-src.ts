import { createSignal } from "solid-js";
import { invoke } from "../../../engine-client/src/client.ts";
import { imagenInerte } from "../../../../apps/desktop/src/lib/links";
import { capabilities } from "../../../host/src/platform";
import { machineOf } from "../../../features/machines/src/store";

/**
 * El logo del workspace como `data:` URI. La ventana no pinta un `file://`
 * (`AGENTS.md` § el guarda `csp`).
 *
 * La ruta sigue siendo `logo.png` al reemplazar el archivo: sin vaciar esto,
 * el cuadro seguiría con la imagen anterior.
 */
const urls = new Map<string, Promise<string | null>>();
const [generacion, setGeneracion] = createSignal(0);

if (typeof window !== "undefined") {
  window.addEventListener("harness:workspace-name", () => {
    urls.clear();
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

/**
 * En la web, el de un workspace que la cuenta conoce sale de la cuenta (su
 * `null` es «sin logo»); si no, el archivo de su máquina.
 */
export function urlDeLogo(path: string | null, workspace: string | null = null): Promise<string | null> {
  const cuenta = workspace ? capabilities().accountAssets : undefined;
  if (cuenta && workspace) {
    const clave = `cuenta:${workspace}`;
    let pendiente = urls.get(clave);
    if (!pendiente) {
      pendiente = cuenta
        .read(workspace, "logo")
        .catch(() => undefined)
        .then((v) => (v === undefined ? (path ? delMotor(path) : null) : v));
      urls.set(clave, pendiente);
    }
    return pendiente;
  }
  return path ? delMotor(path) : Promise.resolve(null);
}

function delMotor(path: string): Promise<string | null> {
  let pendiente = urls.get(path);
  if (!pendiente) {
    pendiente = invoke<{ data_url: string | null }>("preview_file", { path, rel: path }, machineOf(path))
      .then((v) => imagenInerte(v.data_url))
      .catch(() => {
        urls.delete(path);
        if (!reintentando) {
          reintentando = true;
          setTimeout(() => {
            reintentando = false;
            setGeneracion((n) => n + 1);
          }, REINTENTO);
        }
        return null;
      });
    urls.set(path, pendiente);
  }
  return pendiente;
}
