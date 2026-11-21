import { Match, Show, Switch, type JSX } from "solid-js";
import { toolMarkId, toolMonogram } from "@terminus/design";
import type { ToolSource } from "@terminus/chat/tools";
import { MarcaServicio } from "./marcas";

/**
 * Marcas de las herramientas que se integran y de los plugins. Los trazos viven
 * en `@terminus/design` (`TOOL_MARKS`), que el teléfono pinta igual; aquí solo
 * se elige cuál.
 *
 * AgentsView no está ahí: su marca es una baldosa con sus iniciales, no un
 * trazo, y no la presta ningún servidor.
 */

export function GoogleDriveMark(props: { size?: number }) {
  return <MarcaServicio id="drive" size={props.size} />;
}

export function DrawioMark(props: { size?: number }) {
  return <MarcaServicio id="drawio" size={props.size} />;
}

export function TypstMark(props: { size?: number }) {
  return <MarcaServicio id="typst" size={props.size} />;
}

export function LibreOfficeMark(props: { size?: number }) {
  return <MarcaServicio id="libreoffice" size={props.size} />;
}

export function ZoteroMark(props: { size?: number }) {
  return <MarcaServicio id="zotero" size={props.size} />;
}

export function AgentsViewMark(props: { size?: number }) {
  return (
    <svg class="block shrink-0" width={props.size ?? 14} height={props.size ?? 14} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="12" fill="#070b12" />
      <rect x="1.5" y="1.5" width="61" height="61" rx="10.5" fill="none" stroke="#23324a" stroke-width="3" />
      <text x="32" y="43" text-anchor="middle" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="28" font-weight="700" fill="#5b9bf5">AV</text>
    </svg>
  );
}

export function CuaMark(props: { size?: number }) {
  return <MarcaServicio id="cua" size={props.size} />;
}

/** El favicon de danil.ai: la marca de Danil, en el color del texto que la rodea. */
export function TerminusMark(props: { size?: number }) {
  return <MarcaServicio id="danil" size={props.size} />;
}

/**
 * La marca de una herramienta con dueño: el servicio si lo conocemos, o una
 * baldosa con su inicial. La baldosa no afirma un dueño que no sabemos, y la
 * fila escribe el nombre del servidor al lado, así que nunca queda solo el
 * símbolo.
 */
export function MarcaHerramienta(props: { source: ToolSource; size?: number; fallback?: JSX.Element }) {
  const id = () => props.source.mark ?? toolMarkId(props.source.server);
  return (
    <Show when={id()} fallback={<Baldosa server={props.source.server} size={props.size} />}>
      {(marca) => <MarcaServicio id={marca()} size={props.size} fallback={props.fallback} />}
    </Show>
  );
}

/** La inicial del servidor en una baldosa del tamaño de una marca. */
function Baldosa(props: { server: string; size?: number }) {
  const lado = () => props.size ?? 14;
  return (
    <svg class="block shrink-0" width={lado()} height={lado()} viewBox="0 0 14 14" aria-hidden="true">
      <rect width="14" height="14" rx="3.5" fill="currentColor" opacity="0.14" />
      <text
        x="7"
        y="7"
        text-anchor="middle"
        dominant-baseline="central"
        font-family="inherit"
        font-size="8.5"
        font-weight="600"
        fill="currentColor"
        opacity="0.85"
      >
        {toolMonogram(props.server)}
      </text>
    </svg>
  );
}

/** La marca de un plugin por su id, como `MarcaAgente`; uno desconocido no pinta nada. */
export function MarcaPlugin(props: { id: string; size?: number }) {
  return (
    <Switch>
      <Match when={props.id === "drawio"}><DrawioMark size={props.size} /></Match>
      <Match when={props.id === "typst"}><TypstMark size={props.size} /></Match>
      <Match when={props.id === "libreoffice"}><LibreOfficeMark size={props.size} /></Match>
      <Match when={props.id === "agentsview"}><AgentsViewMark size={props.size} /></Match>
      <Match when={props.id === "computer-use"}><CuaMark size={props.size} /></Match>
    </Switch>
  );
}
