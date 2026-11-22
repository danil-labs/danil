import { createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import type { Consentimiento } from "../../../settings/src/components/free-router-consent";
import type { Fila, Paso } from "./connect-rows";

/** Lo que el mapa y el panel leen de las conexiones: las filas, el paso de cada una y sus errores. */
export function crearEstadoDeConexiones() {
  const [filas, setFilas] = createSignal<Fila[]>([]);
  const [pasos, setPasos] = createStore<Record<string, Paso>>({});
  const [errores, setErrores] = createStore<Record<string, string | null>>({});
  // Lo que el CLI dice mientras se inicia sesión, para «Ver lo que dice…».
  const [salidas, setSalidas] = createStore<Record<string, string[]>>({});
  const [falloDeCarga, setFalloDeCarga] = createSignal<string | null>(null);
  const [cargada, setCargada] = createSignal(false);
  const [pregunta, setPregunta] = createSignal<{ fila: string; texto: Consentimiento } | null>(null);
  const [guardando, setGuardando] = createSignal(false);
  return { filas, setFilas, pasos, setPasos, errores, setErrores, salidas, setSalidas, falloDeCarga, setFalloDeCarga, cargada, setCargada, pregunta, setPregunta, guardando, setGuardando };
}

export type EstadoDeConexiones = ReturnType<typeof crearEstadoDeConexiones>;
