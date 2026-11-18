import Check from "lucide-solid/icons/check";
import Coins from "lucide-solid/icons/coins";
import FilePenLine from "lucide-solid/icons/file-pen-line";
import FileText from "lucide-solid/icons/file-text";
import Globe from "lucide-solid/icons/globe";
import ListChecks from "lucide-solid/icons/list-checks";
import Search from "lucide-solid/icons/search";
import ShieldCheck from "lucide-solid/icons/shield-check";
import SquareTerminal from "lucide-solid/icons/square-terminal";
import TriangleAlert from "lucide-solid/icons/triangle-alert";
import Wrench from "lucide-solid/icons/wrench";
import { type Component, Match, Switch } from "solid-js";
import { Dynamic } from "solid-js/web";
import { type Clase, type Fila, origenDeFila } from "../../lib/steps";
import { comandoDeFila } from "../../lib/stepMarks";
import { cn } from "../../lib/utils";
import { MarcaServicio } from "../../ui/marcas";
import { MarcaHerramienta } from "../../ui/toolMarks";

type Icono = Component<{ size?: number; class?: string; "aria-hidden"?: boolean }>;

const ICONO: Record<Clase, Icono> = {
  leer: FileText,
  buscar: Search,
  editar: FilePenLine,
  ejecutar: SquareTerminal,
  web: Globe,
  plan: ListChecks,
  otro: Wrench,
  aviso: TriangleAlert,
  gasto: Coins,
  fin: Check,
  permiso: ShieldCheck,
};

/**
 * El hueco del glifo, 14 px para todos: la marca mide 14 y el icono de clase
 * 12, y sin hueco común el texto de una fila con marca empieza 2 px más lejos.
 */
export const HUECO_DE_GLIFO = "flex size-3.5 shrink-0 items-center justify-center text-neutral-500";

/**
 * El glifo de la fila: el de su clase, o la marca del servicio cuando la
 * herramienta tiene dueño o el comando es de un CLI conocido.
 *
 * **Una sola marca por renglón, en el hueco del glifo.** Dos iconos de 12 px en
 * la misma línea se estorban, y la marca dice quién lo prestó. Un servidor que
 * no conocemos cae en una baldosa con su inicial, y su nombre va escrito al lado.
 */
export function Glifo(props: { fila: Fila; abierta: boolean }) {
  const icono = () => <Dynamic component={ICONO[props.fila.clase]} size={14} class="text-neutral-500" aria-hidden={true} />;
  // Centrado en el primer renglón, no en el bloque: con `items-start` el texto
  // de 12 px vive en una línea de 16 y al hueco de 14 le sobra 1 px por lado.
  const hueco = () => cn(HUECO_DE_GLIFO, !props.abierta && "mt-px");
  return (
    <Switch
      fallback={
        <span class={hueco()}>
          {/* Un paso fallido no se pinta entero de rojo: fallar y reintentar es
              parte normal del trabajo, y la marca de la derecha ya dice con qué
              código salió. */}
          <Dynamic component={ICONO[props.fila.clase]} size={12} aria-hidden={true} />
        </span>
      }
    >
      <Match when={origenDeFila(props.fila)}>
        {(origen) => (
          <span class={hueco()}>
            <MarcaHerramienta source={origen()} size={14} fallback={icono()} />
          </span>
        )}
      </Match>
      {/* Un comando de un CLI conocido lleva la marca de su servicio sin
          rótulo escrito: el programa ya lo nombra. El nombre queda para quien
          no ve la marca. */}
      <Match when={comandoDeFila(props.fila)}>
        {(comando) => (
          <span class={hueco()} role="img" aria-label={comando().label} title={comando().label}>
            <MarcaServicio id={comando().mark} size={14} fallback={icono()} />
          </span>
        )}
      </Match>
    </Switch>
  );
}
