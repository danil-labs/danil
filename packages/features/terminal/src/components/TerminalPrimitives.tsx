import { splitProps, type JSX } from "solid-js";
import {} from "@danil/ui";

/**
 * Primitivas visuales para la superficie y controles de terminal.
 * Corrige B-018 asegurando min-w-0 y break-words/break-all para
 * evitar que strings largos sin espacios desborden paneles.
 */
export const SUPERFICIE_DE_TERMINAL =
  "grid min-h-0 min-w-0 overflow-hidden rounded-md bg-terminal text-terminal-text border border-border/40 shadow-sm";
export const BARRA_DE_TERMINAL =
  "flex items-center justify-between gap-3 bg-terminal-bar px-3 py-2 text-xs text-terminal-muted border-b border-border/20 select-none";
export const NOMBRE_DE_TERMINAL = "font-medium text-terminal-text flex items-center gap-2";
export const CUERPO_DE_TERMINAL =
  "m-0 min-h-0 min-w-0 flex-1 overflow-auto p-3 font-mono text-xs leading-5 break-words break-all whitespace-pre-wrap outline-none focus:ring-1 focus:ring-terminal-accent/30";

export function Terminal(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const [propios, resto] = splitProps(props, ["class", "children"]);
  return (
    <div
      class={`${SUPERFICIE_DE_TERMINAL} ${propios.class ?? ""}`}
      {...resto}
    >
      {propios.children}
    </div>
  );
}

export function TerminalBar(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const [propios, resto] = splitProps(props, ["class", "children"]);
  return (
    <div
      class={`${BARRA_DE_TERMINAL} ${propios.class ?? ""}`}
      {...resto}
    >
      {propios.children}
    </div>
  );
}

export function TerminalName(props: JSX.HTMLAttributes<HTMLElement>) {
  const [propios, resto] = splitProps(props, ["class", "children"]);
  return (
    <strong
      class={`${NOMBRE_DE_TERMINAL} ${propios.class ?? ""}`}
      {...resto}
    >
      {propios.children}
    </strong>
  );
}

export function TerminalBody(props: JSX.HTMLAttributes<HTMLPreElement>) {
  const [propios, resto] = splitProps(props, ["class", "children"]);
  return (
    <pre
      class={`${CUERPO_DE_TERMINAL} ${propios.class ?? ""}`}
      tabIndex={0}
      {...resto}
    >
      {propios.children}
    </pre>
  );
}

export function TerminalCursor(props: { class?: string }) {
  return (
    <span
      class={`text-terminal-accent motion-safe:animate-pulse inline-block ml-0.5 ${props.class ?? ""}`}
      aria-hidden="true"
    >
      ▍
    </span>
  );
}
