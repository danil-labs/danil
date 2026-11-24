import { splitProps, type JSX } from "solid-js";
import { cn } from "./lib/utils";

/**
 * La superficie de terminal, la segunda capa de color
 * (`docs/visual-system.md`). Un `bg-surface-muted` en su lugar ignora el tema
 * que la persona eligió y mide su contraste contra otra superficie.
 */
/* Las mismas formas como cadena, para donde el elemento no cabe: dentro de un
   `<button>` no se anida un `div` ni un `pre`. Patrón de `ITEM_DE_MENU`. */
const SUPERFICIE_DE_TERMINAL =
  "grid min-h-0 min-w-0 overflow-hidden rounded-md bg-terminal text-terminal-text";
export const BARRA_DE_TERMINAL =
  "flex items-center gap-3 bg-terminal-bar px-3 py-2 text-xs text-terminal-muted";
const NOMBRE_DE_TERMINAL = "font-medium text-terminal-text";
const CUERPO_DE_TERMINAL =
  "m-0 min-h-0 overflow-auto p-3 font-mono text-xs leading-5 break-words whitespace-pre-wrap outline-none";

export function Terminal(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const [propios, resto] = splitProps(props, ["class"]);
  return (
    <div
      class={cn(SUPERFICIE_DE_TERMINAL, propios.class)}
      {...resto}
    />
  );
}

export function TerminalName(props: JSX.HTMLAttributes<HTMLElement>) {
  const [propios, resto] = splitProps(props, ["class"]);
  return <strong class={cn(NOMBRE_DE_TERMINAL, propios.class)} {...resto} />;
}

/* Ajusta la línea: una URL de OAuth sin cortar empuja un scroll horizontal que
   esconde el resto de la salida. */
export function TerminalBody(props: JSX.HTMLAttributes<HTMLPreElement>) {
  const [propios, resto] = splitProps(props, ["class"]);
  return (
    <pre
      class={cn(CUERPO_DE_TERMINAL, propios.class)}
      {...resto}
    />
  );
}

/** El cursor que dice que sigue trabajando. Respeta `prefers-reduced-motion`. */
export function TerminalCursor(props: { class?: string }) {
  return (
    <span
      class={cn("text-terminal-accent motion-safe:animate-pulse", props.class)}
      aria-hidden="true"
    >
      ▍
    </span>
  );
}
