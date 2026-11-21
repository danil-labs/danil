/**
 * Punto de entrada público de la feature Terminal (@danil/feature-terminal).
 * Exporta pantallas y piezas de montaje.
 */

export { TerminalScreen } from "./screens/TerminalScreen.tsx";
export type { TerminalScreenProps } from "./screens/TerminalScreen.tsx";

export { TerminalError } from "./components/TerminalError.tsx";

export { useShell } from "./queries.ts";
export type {
  ShellConnection,
  UseShellOptions,
  UseShellReturn,
} from "./queries.ts";

export type {
  ShellRunParams,
  ShellWriteParams,
  ShellStopParams,
  ShellCloseParams,
  ShellStatus,
  ShellState,
} from "./model.ts";
