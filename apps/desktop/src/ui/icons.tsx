import { createUniqueId, For, type JSX, Show } from "solid-js";
import { Dynamic } from "solid-js/web";
import GitBranch from "lucide-solid/icons/git-branch";
import { AGENT_MARKS, type AgentMark, agentMarkId } from "@terminus/design";
import { MarcaServicio } from "./marcas";

/**
 * Íconos propios: 24×24, trazo `currentColor`, sin relleno — heredan el color
 * del botón y no necesitan variante para dark. No se trae una librería entera
 * para seis glifos, y el riel colapsado exige que todos midan igual.
 *
 * Los atributos van con el nombre del DOM, no en camelCase: Solid escribe lo
 * que recibe, y un `strokeWidth` no da error — pinta el ícono sin trazo,
 * o sea invisible.
 */
function Svg(props: { size?: number; children: JSX.Element }) {
  return (
    <svg
      class="block shrink-0"
      width={props.size ?? 14}
      height={props.size ?? 14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {props.children}
    </svg>
  );
}

export function Close(props: { size?: number }) {
  return (
    <Svg size={props.size}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </Svg>
  );
}

export function Back(props: { size?: number }) {
  return (
    <Svg size={props.size}>
      <path d="m15 18-6-6 6-6" />
    </Svg>
  );
}

export function Next(props: { size?: number }) {
  return (
    <Svg size={props.size}>
      <path d="m9 18 6-6-6-6" />
    </Svg>
  );
}

export function Print(props: { size?: number }) {
  return (
    <Svg size={props.size}>
      <path d="M6 9V3h12v6" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" />
      <path d="M6 14h12v7H6z" />
    </Svg>
  );
}

/**
 * Las marcas de los servicios se pintan desde `@terminus/design`, que el
 * teléfono pinta igual; `MarcaServicio` pide los trazos cuando se ve la primera
 * y aquí solo se elige cuál.
 */
export function McpMark(props: { size?: number }) {
  return <MarcaServicio id="mcp" size={props.size} />;
}

export function GitHubMark(props: { size?: number }) {
  return <MarcaServicio id="github" size={props.size} />;
}

export function BitbucketMark(props: { size?: number }) {
  return <MarcaServicio id="bitbucket" size={props.size} />;
}

export function GitLabMark(props: { size?: number }) {
  return <MarcaServicio id="gitlab" size={props.size} />;
}

export function FigmaMark(props: { size?: number }) {
  return <MarcaServicio id="figma" size={props.size} />;
}

export function ExcalidrawMark(props: { size?: number }) {
  return <MarcaServicio id="excalidraw" size={props.size} />;
}

export function AtlassianMark(props: { size?: number }) {
  return <MarcaServicio id="atlassian" size={props.size} />;
}

export function NotionMark(props: { size?: number }) {
  return <MarcaServicio id="notion" size={props.size} />;
}

/**
 * Las marcas de los proveedores de IA: los trazos y colores viven en
 * `@terminus/design` (`AGENT_MARKS`), que el teléfono pinta igual. Relleno
 * `null` es `currentColor`; una marca con variante oscura lleva dos `<svg>` y
 * el tema elige.
 */
function MarcaDeDatos(props: { mark: AgentMark; size?: number }) {
  const caja = (paths: AgentMark["paths"], clase: string) => (
    <svg class={clase} width={props.size ?? 14} height={props.size ?? 14} viewBox={props.mark.viewBox} fill="currentColor" aria-hidden="true">
      {/* Sin `transform`, sin `<g>`: la marca se pinta en cada fila y cada nodo cuenta. */}
      <Show when={props.mark.transform} fallback={<For each={paths}>{(p) => <path d={p.d} fill={p.fill ?? undefined} />}</For>}>
        {(transform) => (
          <g transform={transform()}>
            <For each={paths}>{(p) => <path d={p.d} fill={p.fill ?? undefined} />}</For>
          </g>
        )}
      </Show>
    </svg>
  );
  return (
    <Show when={props.mark.dark} fallback={caja(props.mark.paths, "block shrink-0")}>
      {(dark) => <>{caja(props.mark.paths, "block shrink-0 dark:hidden")}{caja(dark(), "hidden shrink-0 dark:block")}</>}
    </Show>
  );
}

/**
 * La de Gemini, y es la que le toca a Antigravity: la estrella recorta manchas
 * de color desenfocadas.
 */
function GeminiMark(props: { size?: number }) {
  const gemini = AGENT_MARKS.gemini;
  // Ids por instancia: la marca se pinta varias veces por pantalla, y dos ids iguales se pisan.
  const id = createUniqueId();
  return (
    <svg
      class="block shrink-0"
      width={props.size ?? 14}
      height={props.size ?? 14}
      viewBox={gemini.viewBox}
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <mask id={`${id}-m`} style={{ "mask-type": "alpha" }} maskUnits="userSpaceOnUse" x="0" y="0" width="65" height="65">
          <path d={gemini.paths[0].d} fill="#000" />
        </mask>
        <For each={gemini.spots}>
          {([, , desenfoque], i) => (
            <filter
              id={`${id}-f${i()}`}
              x="-50"
              y="-50"
              width="170"
              height="170"
              filterUnits="userSpaceOnUse"
              color-interpolation-filters="sRGB"
            >
              <feGaussianBlur stdDeviation={desenfoque} />
            </filter>
          )}
        </For>
      </defs>
      <g mask={`url(#${id}-m)`}>
        <For each={gemini.spots}>
          {([d, color], i) => <path d={d} fill={color} filter={`url(#${id}-f${i()})`} />}
        </For>
      </g>
    </svg>
  );
}

/**
 * La marca de un agente, por su id. Cuál le toca lo decide `agentMarkId`, el
 * mismo que usa el teléfono; repartir esa decisión deja a un agente nuevo con
 * marca en unas pantallas y sin ella en otras, sin aviso. Uno desconocido no
 * pinta nada.
 */
export function MarcaAgente(props: { id: string; size?: number }) {
  const marca = () => agentMarkId(props.id);
  return (
    <Show when={marca()}>
      {(id) => (
        <Show when={id() !== "gemini"} fallback={<GeminiMark size={props.size} />}>
          <MarcaDeDatos mark={AGENT_MARKS[id()]} size={props.size} />
        </Show>
      )}
    </Show>
  );
}

const MARCAS_PROVEEDOR: Record<string, (props: { size?: number }) => JSX.Element> = {
  github: GitHubMark,
  bitbucket: BitbucketMark,
  gitlab: GitLabMark,
  figma: FigmaMark,
  atlassian: AtlassianMark,
  excalidraw: ExcalidrawMark,
  notion: NotionMark,
};

/** Lo mismo para proveedores de código y conexiones. Sin marca conocida no pinta nada. */
export function MarcaProveedor(props: { id: string; size?: number }) {
  return <Dynamic component={MARCAS_PROVEEDOR[props.id]} size={props.size} />;
}

/** La marca de un servicio de código. Uno que el motor agregue sin marca aquí sale con una rama genérica, no vacío. */
export function MarcaGitHost(props: { id: string; size?: number }) {
  return <Dynamic component={MARCAS_PROVEEDOR[props.id] ?? GitHostGenerico} size={props.size} />;
}

function GitHostGenerico(props: { size?: number }) {
  return <GitBranch size={props.size ?? 14} class="shrink-0 text-neutral-500" aria-hidden="true" />;
}
