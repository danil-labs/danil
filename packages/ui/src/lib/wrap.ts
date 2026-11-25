import { createPref } from "../../../session/src/prefs.ts";

/** El ajuste de línea del editor y del diff: una sola preferencia, como en VS Code. */
const [ajuste, setAjuste] = createPref<boolean>("code.wrap", false);

export { ajuste };

export function alternarAjuste() {
  setAjuste(!ajuste());
}

/** Alt+Z. `code` y no `key`: en macOS ⌥Z escribe «Ω» y la tecla no se reconocería. */
export function esAtajoDeAjuste(e: KeyboardEvent): boolean {
  return e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.code === "KeyZ";
}
