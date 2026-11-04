import { createSignal } from "solid-js";

/**
 * La segunda capa de color: qué tema pinta la terminal, el código y el diff.
 * Los colores viven en `styles/terminal.css`; aquí solo el identificador, y
 * `scripts/guards/terminal-themes.mjs` comprueba que las dos listas coincidan.
 *
 * Un nombre de esquema es un nombre propio y no pasa por `t()`. La elección es
 * del workspace: `workspaces::Workspace::terminal_theme`.
 */
export type TemaDeTerminal = { id: string; name: string };

/** El primero es el que se pinta sin elección. */
export const TEMAS_DE_TERMINAL: readonly TemaDeTerminal[] = [
  { id: "terminus", name: "Danil" },
  { id: "tomorrow-night-blue", name: "Tomorrow Night Blue" },
  { id: "nord", name: "Nord" },
  { id: "gruvbox-dark", name: "Gruvbox Dark" },
  { id: "dracula", name: "Dracula" },
];

const POR_OMISION = TEMAS_DE_TERMINAL[0].id;

const [temaDeTerminal, setTemaDeTerminal] = createSignal(POR_OMISION);
export { temaDeTerminal };

/**
 * Un identificador que ya no existe cae al de por omisión en vez de dejar el
 * atributo puesto: sin bloque que lo defina, la ventana se quedaría con los
 * colores del tema anterior y nada lo diría.
 */
export function aplicarTemaDeTerminal(id: string | null | undefined) {
  const elegido = TEMAS_DE_TERMINAL.find((tema) => tema.id === id)?.id ?? POR_OMISION;
  setTemaDeTerminal(elegido);
  if (typeof document !== "undefined") document.documentElement.dataset.terminalTheme = elegido;
}
