/**
 * La sangría que ya usa el archivo, para que Tab no mezcle dos. Una línea que
 * empieza por `*` es cuerpo de un bloque de comentario y lleva un solo espacio.
 */
export function sangriaDe(texto: string): string {
  let menor = 0;
  for (const linea of texto.split("\n", 500)) {
    if (linea.startsWith("\t")) return "\t";
    const resto = linea.trimStart();
    const n = linea.length - resto.length;
    if (n === 0 || resto === "" || resto.startsWith("*")) continue;
    if (menor === 0 || n < menor) menor = n;
  }
  return menor >= 4 && menor % 4 === 0 ? "    " : "  ";
}
