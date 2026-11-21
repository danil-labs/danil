import { createContext, useContext } from "solid-js";

// Sin esto, un popover abierto dentro de un diálogo se pinta detrás de él.
export const InsideDialog = createContext(false);

export const insideDialog = () => useContext(InsideDialog);
