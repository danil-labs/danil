import { splitProps, type JSX } from "solid-js";

/**
 * Primitivas visuales para la superficie y controles de terminal.
 * Paridad visual con apps/desktop/src/ui/Terminal.tsx.
 */
export const SUPERFICIE_DE_TERMINAL =
  "grid min-h-0 min-w-0 overflow-hidden rounded-md bg-terminal text-terminal-text";
export const BARRA_DE_TERMINAL =
  "flex items-center justify-between gap-3 bg-terminal-bar px-3 py-2 text-xs text-terminal-muted";
export const NOMBRE_DE_TERMINAL = "font-medium text-terminal-text flex items-center gap-2";
export const CUERPO_DE_TERMINAL =
  "m-0 min-h-0 min-w-0 overflow-auto p-3 font-mono text-xs leading-5 break-words whitespace-pre-wrap outline-none";

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
