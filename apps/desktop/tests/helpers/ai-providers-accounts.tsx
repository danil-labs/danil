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
import { setCapabilities } from "../../../../packages/host/src/platform";
import Accounts from "../../../../packages/features/settings/src/components/Accounts";
export { ESPERA_ANTES_DE_LA_TERMINAL_MS } from "../../../../packages/features/settings/src/components/Accounts";
import type { EstadoDeProveedor } from "../../../../packages/features/settings/src/model/ai-providers-groups";
import type { MaquinasDeAjustes } from "../../../../packages/features/settings/src/model/machines-port";

const MAQUINAS: MaquinasDeAjustes = {
  machines: () => [],
  machineName: (id) => id,
  machineOf: () => undefined,
  isDanilWorkspace: () => false,
};

export function mountAccounts(
  root: HTMLElement,
  ids: string[],
  options: { sinAgregar?: boolean; desplegado?: boolean; machineOf?: MaquinasDeAjustes["machineOf"] } = {},
) {
  elegirLengua("es");
  setCapabilities({ nativeWindow: true } as never);
  const maquinas: MaquinasDeAjustes = options.machineOf ? { ...MAQUINAS, machineOf: options.machineOf } : MAQUINAS;
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
              maquinas={maquinas}
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
