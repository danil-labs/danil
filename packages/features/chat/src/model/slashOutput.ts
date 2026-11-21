/**
 * Lo que el CLI contestó a un comando de barra sin llamar al modelo. Rust lo
 * guarda como turno `system` con uno de los `sessions::META_COMMAND_*`;
 * `command_running` solo existe en vivo, mientras el comando corre.
 */
const SOLO_EN_SU_TERMINAL = "command_terminal_only";
export type ClaseDeSalida = "output" | "terminal_only" | "running" | "compacted" | "failed" | "empty";
const CLASES: Record<string, ClaseDeSalida> = {
  command_output: "output",
  [SOLO_EN_SU_TERMINAL]: "terminal_only",
  command_running: "running",
  command_compacted: "compacted",
  command_failed: "failed",
  command_empty: "empty",
};
const SALIDAS = new Set(Object.keys(CLASES));

export function claseDeSalida(meta: string | undefined): ClaseDeSalida {
  return CLASES[meta ?? ""] ?? "output";
}

export function esSalidaDeComando(meta: string | undefined): boolean {
  return SALIDAS.has(meta ?? "");
}

/** El CLI dijo que ese comando solo existe en su terminal: la frase la pone el catálogo. */
export function soloEnSuTerminal(meta: string | undefined): boolean {
  return meta === SOLO_EN_SU_TERMINAL;
}

/** El comando que pidió la salida del índice `i`: la primera línea del último mensaje con barra. */
export function comandoDe(msgs: { role: string; text: string }[], i: number): string {
  for (let j = Math.min(i, msgs.length) - 1; j >= 0; j--) {
    const m = msgs[j];
    if (m.role === "user" && m.text.startsWith("/")) return m.text.split("\n", 1)[0].trim();
  }
  return "";
}

/** El comando con el que empieza un mensaje, sin argumentos; vacío si no empieza por barra. */
export function comandoEscrito(texto: string): string {
  return /^\/\S+/.exec(texto)?.[0] ?? "";
}

// Encabezado, tabla, lista, cerca de código o negrita. Sin ninguno la salida
// va en monoespaciado: como párrafo, `/cost` pierde sus columnas.
const MARCAS = /^(#{1,6} |\|.*\||\s*[-*] |```)|\*\*[^*\n]+\*\*/m;

export function esMarkdown(texto: string): boolean {
  return MARCAS.test(texto);
}
