/** El cuadrado que se arrastra. La salida es más grande para que el riel no se vea blando. */
export const MARCO = 240;
export const SALIDA = 512;
/** El tope del logo en el motor y en la cuenta. */
export const LOGO_MAX = 1024 * 1024;
/** Lados de salida, de mayor a menor: a 384 px un PNG nunca llega a `LOGO_MAX`. */
export const SALIDAS = [SALIDA, 384] as const;

/** Los bytes que ocupa un base64 una vez decodificado. */
export function bytesDeBase64(base64: string): number {
  const relleno = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - relleno;
}

/** Escala con la que la imagen tapa el marco entero. Por debajo se verían bandas. */
export function cubre(ancho: number, alto: number, marco = MARCO): number {
  if (ancho <= 0 || alto <= 0) return 1;
  return Math.max(marco / ancho, marco / alto);
}

export function medidas(ancho: number, alto: number, zoom: number, marco = MARCO) {
  const escala = cubre(ancho, alto, marco) * zoom;
  return { w: ancho * escala, h: alto * escala };
}

/** El borde izquierdo o superior de la imagen, sin dejar hueco dentro del marco. */
export function limitar(offset: number, visible: number, marco = MARCO): number {
  const min = Math.min(0, marco - visible);
  return Math.min(0, Math.max(min, offset));
}

export function centrar(visible: number, marco = MARCO): number {
  return limitar((marco - visible) / 2, visible, marco);
}

/**
 * El rectángulo de la imagen original que cae dentro del marco.
 * Si el zoom baja de 1, el marco deja de estar cubierto.
 */
export function origenDelCanvas(
  ancho: number,
  alto: number,
  zoom: number,
  ox: number,
  oy: number,
  marco = MARCO,
) {
  const { w, h } = medidas(ancho, alto, zoom, marco);
  return {
    sx: (-ox / w) * ancho,
    sy: (-oy / h) * alto,
    sw: (marco / w) * ancho,
    sh: (marco / h) * alto,
  };
}
