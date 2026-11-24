import type { MaquinasDeAjustes } from "../model/machines-port";
import { Show } from "solid-js";
import { FailureNote } from "../../../../ui/src/Failure";
import { GovernedNotice } from "../../../../ui/src/Governed";
import { createHerramientas } from "./ToolsState";
import { createListaDeHerramientas } from "./ToolsList";
import { createAgentesDeHerramientas } from "./ToolsAgents";

export default function Herramientas(props: { solo?: string | string[]; maquinas: MaquinasDeAjustes }) {
  const herramientas = createHerramientas(props);
  const { aviso, fallo } = herramientas;
  const { Lista } = createListaDeHerramientas(herramientas);
  const { Agentes } = createAgentesDeHerramientas(props, herramientas);
  return (
    // Cada cuadrícula acota su columna, igual que `SettingsPanel`.
    <div class="grid grid-cols-[minmax(0,1fr)] gap-5">
      <GovernedNotice section="mcp_servers" />
      <Lista />

      {/* La salida para lo que no está en la tabla. Va al final y cerrada:
          es el camino de quien sabe lo que hace, no el que se ofrece primero.

          Lleva nombre de sección: separa lo que la app sabe conectar de lo
          que puso alguien a mano — sin él el botón quedaba colgando debajo
          de la última tarjeta como si le perteneciera. */}
      <Agentes />

      {/* Lo que contestó el inicio de sesión. Con caja y no como párrafo suelto:
          aparece al final de una lista de tarjetas y sin superficie propia se
          leía como el pie de la última. */}
      <Show when={aviso()}>
        {(m) => (
          <p class="m-0 rounded-md border border-border bg-surface-muted px-3 py-2 text-xs text-neutral-950">
            {m()}
          </p>
        )}
      </Show>
      <Show when={fallo()}>{(f) => <FailureNote f={f()} />}</Show>
    </div>
  );
}
