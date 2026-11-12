/**
 * Lo que se puede elegir para trabajar, del lado del front. Espeja
 * `src-tauri/src/runtime/surfaces.rs`: una fila de agente puede dar más de una
 * superficie, así que el menú del chat y el riel de Configuración iteran esta
 * lista y no `list_providers`. Quién filtra qué es de cada pantalla — el chat
 * enseña lo utilizable, Configuración lo enseña todo.
 */
// Con extensión: este módulo se carga también desde `node --test`, que no tiene
// el resolvedor de Vite (`SYSTEM.md` § De dónde sale cada frase).
import { t } from "./i18n.ts";
import type { Frase } from "./prose";

/** Un renglón elegible. Espeja `surfaces::Superficie`. */
export type Superficie = {
  id: string;
  /** La fila que la sirve. **Es lo que viaja a `send_message` y lo que la sesión guarda.** */
  provider: string;
  label: string;
  /** Qué mitad del catálogo de su agente ofrece. */
  catalogo: "todo" | "de_pago" | "gratuitos";
  /** Si se puede correr un turno por aquí ahora mismo. */
  usable: boolean;
  /** Qué le falta, en dos palabras. */
  marca: string | null;
  /** La frase entera: qué pasa y dónde se arregla. `null` si es usable o
   *  cuando lo que falta ya lo dice su botón. */
  porque: Frase | null;
};

// Las reglas de qué modelo es de qué superficie y cuál se enseña las comparte
// el teléfono (`@terminus/tasks`); aquí quedan con su nombre de la ventana.
export { surfaceHas as esDe, menuSurfaces as paraElMenu, surfaceOf as superficieDe } from "../../../../packages/tasks/src/surfaces.ts";

/**
 * El rótulo de una superficie, traducido cuando el nombre es nuestro: «Claude
 * Code» o «Codex» son nombres propios y van igual en toda lengua; «Modelos
 * gratuitos» es nuestro y sin esto salen en la lengua de Rust.
 *
 * Se distingue por identificador y no por el rótulo: `catalogo` y `agent`
 * cruzan la frontera entre procesos y no cambian con la lengua; comparar contra
 * la cadena «Modelos Free» ataría esto a esa mayúscula en Rust.
 */
export function rotuloDeSuperficie(s: Superficie): string {
  if (s.catalogo === "gratuitos") return t("surfaces.label.free");
  return s.label;
}

/** La marca visible pertenece a Danil cuando la superficie ofrece modelos gratuitos. */
export function marcaDeSuperficie(s: Pick<Superficie, "catalogo" | "provider">): string {
  return s.catalogo === "gratuitos" ? "danil" : s.provider;
}
