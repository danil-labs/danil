import type { Component } from "solid-js";

/**
 * Lo que el alta recibe del shell (R3): sellar el workspace de la organización
 * personal Free, que es del riel de sesiones, y los controles de la ventana de
 * Windows. Llegan con los mismos nombres que exporta el shell.
 */
export type SellarWorkspaceFree = (invoke: <T>(command: string, args?: Record<string, unknown>) => Promise<T>) => Promise<{ id: string; name: string } | null>;
export type ControlesDeVentanaDelShell = Component;
