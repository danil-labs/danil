import { type Accessor, createSignal } from "solid-js";
import { host } from "@danil/host";

const NS = "harness.layout.";

function storageKey(key: string): string {
  return NS + key;
}

export function leerPref<T>(clave: string, porOmision: T): T {
  try {
    const crudo = typeof localStorage === "undefined" ? null : localStorage.getItem(storageKey(clave));
    if (crudo === null) {
      return porOmision;
    }
    return JSON.parse(crudo) as T;
  } catch {
    return porOmision;
  }
}

export function escribirPref(clave: string, valor: unknown): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(storageKey(clave), JSON.stringify(valor));
    }
  } catch {
    // Sin almacenamiento la app sigue: se pierde la preferencia, no el trabajo.
  }
}

export function createPref<T>(
  clave: string,
  porOmision: T,
): [Accessor<T>, (valor: T) => void] {
  const [valor, setValor] = createSignal<T>(leerPref(clave, porOmision));

  return [
    valor,
    (siguiente: T) => {
      setValor(() => siguiente);
      escribirPref(clave, siguiente);
    },
  ];
}

export function openExternal(url: string): Promise<void> {
  return host.openExternal(url);
}
