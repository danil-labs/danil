/**
 * Fondos que la app trae para los chats: el neutro sin imagen, que es el de
 * siempre, y la imagen propia. Lo guardado antes (el atardecer bicolor que ya
 * no existe) cae al neutro.
 */
export const FONDOS = ["neutro", "propia"] as const;

export type FondoDeChat = (typeof FONDOS)[number];

/** El mismo velo que el fondo de un agente, para que el texto siga leyéndose. */
export const VELO_DE_FONDO = 0.82;

/** El velo de la cabecera de pestañas: por debajo del mínimo deja de verse la banda. */
export const VELO_DE_PESTANAS = 0.3;
export const VELO_DE_PESTANAS_MIN = 0.15;
export const VELO_DE_PESTANAS_MAX = 0.6;

/** El vidrio de las columnas y barras (`.glass-panel`): a 0 se ve el fondo entero, a 1 son sólidas. */
export const VELO_DE_PANELES = 0.4;
export const VELO_DE_PANELES_MIN = 0;
export const VELO_DE_PANELES_MAX = 1;

export function fondoDe(guardado: string | null | undefined): FondoDeChat {
  return (FONDOS as readonly string[]).includes(guardado ?? "")
    ? (guardado as FondoDeChat)
    : "neutro";
}


