/**
 * Monta un `Accounts` por proveedor como lo hará Configuración › Proveedores de
 * IA: un `For` sobre ids de proveedor, cada grupo dentro de un nodo
 * `data-test-group` que se oculta con clase y nunca se desmonta. Guarda
 * cada `EstadoDeProveedor` que avisa la instancia y el control que entrega.
 */
import { elegirLengua } from "../../src/lib/i18n";
import "../../src/locales/catalogs";
import { createSignal, For } from "solid-js";
import { render } from "solid-js/web";
import { setCapabilities } from "../../src/lib/platform";
import Accounts from "../../src/features/settings/Accounts";
export { ESPERA_ANTES_DE_LA_TERMINAL_MS } from "../../src/features/settings/Accounts";
import type { EstadoDeProveedor } from "../../src/features/settings/ai-providers-groups";

export function mountAccounts(root: HTMLElement, ids: string[], options: { sinAgregar?: boolean; desplegado?: boolean } = {}) {
  elegirLengua("es");
  setCapabilities({ nativeWindow: true } as never);
  const estados: Record<string, EstadoDeProveedor[]> = {};
  const controles: Record<string, { agregar: () => void }> = {};
  const [orden, setOrden] = createSignal(ids);
  const [ocultos, setOcultos] = createSignal<string[]>([]);
  const dispose = render(
    () => (
      <For each={orden()}>
        {(id) => (
          <div data-test-group={id} class={ocultos().includes(id) ? "hidden" : "grid"}>
            <Accounts
              agente={id}
              titulo={id}
              desplegado={options.desplegado}
              sinAgregar={options.sinAgregar}
              onEstado={(e) => (estados[id] ??= []).push(e)}
              onControl={(c) => (controles[id] = c)}
            />
          </div>
        )}
      </For>
    ),
    root,
  );
  return {
    dispose,
    estados,
    ultimo: (id: string) => estados[id]?.at(-1),
    agregar: (id: string) => controles[id]?.agregar(),
    tieneControl: (id: string) => typeof controles[id]?.agregar === "function",
    ocultar: (id: string, oculto: boolean) => setOcultos((o) => (oculto ? [...o, id] : o.filter((x) => x !== id))),
    reordenar: (nuevo: string[]) => setOrden(nuevo),
  };
}
