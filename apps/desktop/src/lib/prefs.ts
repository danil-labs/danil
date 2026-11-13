import { type Accessor, createSignal } from "solid-js";
import { capabilities } from "./platform.ts";

/**
 * Preferencias de esta máquina que sobreviven a cerrar la app: un solo
 * mecanismo para el ancho de columnas, el colapso del sidebar y lo demás que se
 * ajusta. `localStorage` alcanza: nada de esto viaja ni se commitea.
 *
 * La carpeta de proyectos no vive aquí: es de un workspace, no de esta máquina
 * — dos clientes apuntan a carpetas distintas y una preferencia global las
 * mezclaría. La clave `root` se lee una vez al arrancar, solo para que la
 * migración sepa a dónde apuntaba la app anterior.
 */
const NS = "harness.layout.";
function storageKey(key: string) {
  const person = key === "machines.run_on" && !capabilities().nativeWindow ? capabilities().webAccounts?.current.user_id : null;
  return person ? `danil.web.${person}.preferences.${key}` : NS + key;
}

export function leerPref<T>(clave: string, porOmision: T): T {
  try {
    const crudo = localStorage.getItem(storageKey(clave));
    return crudo === null ? porOmision : (JSON.parse(crudo) as T);
  } catch {
    return porOmision;
  }
}

export function escribirPref(clave: string, valor: unknown) {
  try {
    localStorage.setItem(storageKey(clave), JSON.stringify(valor));
  } catch {
    // Sin almacenamiento la app sigue: se pierde la preferencia, no el trabajo.
  }
}

export function hayPref(clave: string): boolean {
  try {
    return localStorage.getItem(storageKey(clave)) !== null;
  } catch {
    return false;
  }
}

export function borrarPref(clave: string) {
  try {
    localStorage.removeItem(storageKey(clave));
  } catch {
    // Sin almacenamiento no hay nada que borrar.
  }
}

/** Las claves guardadas que empiezan por `prefijo`, sin el espacio de nombres. */
export function prefsQueEmpiezan(prefijo: string): string[] {
  try {
    const claves: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const clave = localStorage.key(i);
      if (clave?.startsWith(NS + prefijo)) claves.push(clave.slice(NS.length));
    }
    return claves;
  } catch {
    return [];
  }
}

/**
 * Una señal que se acuerda, con la forma de `createSignal`.
 *
 * Escribe al asignar y no dentro de un efecto: un efecto podría rastrear además
 * lecturas accidentales.
 */
export function createPref<T>(
  clave: string,
  porOmision: T,
): [Accessor<T>, (valor: T) => void] {
  if (clave === "machines.run_on") {
    const [revision, changed] = createSignal(0);
    return [() => { revision(); return leerPref(clave, porOmision); }, value => {
      escribirPref(clave, value);
      changed(n => n + 1);
    }];
  }
  const [valor, setValor] = createSignal<T>(leerPref(clave, porOmision));

  return [
    valor,
    (siguiente: T) => {
      setValor(() => siguiente);
      escribirPref(clave, siguiente);
    },
  ];
}

