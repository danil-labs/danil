/**
 * El identificador de un agente, sacado del nombre que escribe la persona.
 *
 * La misma regla que `util::nombre_de_encargado` en Rust: minúsculas ASCII,
 * dígitos y un guion simple entre palabras, hasta 60. Si las dos divergen, el
 * diálogo ofrece un identificador que el backend rechaza.
 */
const MAX = 60;

export function agentId(displayName: string): string {
  return displayName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, MAX)
    .replace(/^-+|-+$/g, "");
}
