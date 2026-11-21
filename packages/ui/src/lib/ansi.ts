export type AnsiStyle = {
  color: "default" | "red" | "green" | "yellow" | "blue" | "magenta" | "cyan";
  bold: boolean;
  dim: boolean;
};

export type AnsiSegment = AnsiStyle & { text: string };

const DEFAULT: AnsiStyle = { color: "default", bold: false, dim: false };

function agregar(segmentos: AnsiSegment[], text: string, style: AnsiStyle) {
  if (!text) return;
  const previo = segmentos.at(-1);
  if (
    previo &&
    previo.color === style.color &&
    previo.bold === style.bold &&
    previo.dim === style.dim
  ) {
    previo.text += text;
  } else {
    segmentos.push({ text, ...style });
  }
}

const BASICOS: AnsiStyle["color"][] = [
  "default",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "default",
];

/**
 * Cuántos parámetros consume `38`, `48` o `58` además de sí mismo. Un color
 * extendido es un grupo: leer sus componentes como instrucciones sueltas
 * convierte el `2` de `38;2;r;g;b` en «tenue» y los canales en colores.
 */
function largoDeGrupo(modo: number | undefined): number {
  if (modo === 2) return 4;
  if (modo === 5) return 2;
  return 0;
}

/** El color de `38;5;n` cuando cae en los dieciséis que esta paleta nombra. */
function indexado(n: number | undefined): AnsiStyle["color"] {
  if (n === undefined || n < 0 || n > 15) return "default";
  return BASICOS[n % 8];
}

function sgr(parametros: string, actual: AnsiStyle): AnsiStyle {
  const siguiente = { ...actual };
  const numeros = parametros === "" ? [0] : parametros.split(";").map(Number);
  for (let i = 0; i < numeros.length; i += 1) {
    const numero = numeros[i];
    if (numero === 38 || numero === 48 || numero === 58) {
      const modo = numeros[i + 1];
      if (numero === 38) siguiente.color = modo === 5 ? indexado(numeros[i + 2]) : "default";
      i += largoDeGrupo(modo);
      continue;
    }
    if (numero === 0) Object.assign(siguiente, DEFAULT);
    else if (numero === 1) siguiente.bold = true;
    else if (numero === 2) siguiente.dim = true;
    else if (numero === 22) {
      siguiente.bold = false;
      siguiente.dim = false;
    } else if (numero === 39) siguiente.color = "default";
    else if (numero >= 30 && numero <= 37) siguiente.color = BASICOS[numero - 30];
    else if (numero >= 90 && numero <= 97) siguiente.color = BASICOS[numero - 90];
  }
  return siguiente;
}

export function segmentosAnsi(texto: string): AnsiSegment[] {
  const segmentos: AnsiSegment[] = [];
  let estilo = { ...DEFAULT };
  let desde = 0;
  let i = 0;
  while (i < texto.length) {
    if (texto[i] !== "\x1b") {
      i += 1;
      continue;
    }
    agregar(segmentos, texto.slice(desde, i), estilo);
    const siguiente = texto[i + 1];
    if (siguiente === "[") {
      const cierre = /[@-~]/.exec(texto.slice(i + 2));
      if (!cierre) {
        desde = texto.length;
        break;
      }
      const fin = i + 2 + cierre.index;
      if (texto[fin] === "m") estilo = sgr(texto.slice(i + 2, fin), estilo);
      i = fin + 1;
    } else if (siguiente === "]") {
      const bel = texto.indexOf("\x07", i + 2);
      const st = texto.indexOf("\x1b\\", i + 2);
      const fin = [bel, st].filter((n) => n >= 0).sort((a, b) => a - b)[0];
      i = fin === undefined ? texto.length : fin + (fin === st ? 2 : 1);
    } else {
      i += siguiente ? 2 : 1;
    }
    desde = i;
  }
  agregar(segmentos, texto.slice(desde), estilo);
  return segmentos;
}
