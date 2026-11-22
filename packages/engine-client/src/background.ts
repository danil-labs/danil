/**
 * El fondo de los chats de un workspace tal como lo guarda su motor
 * (`chat_background`): un patrón de la app (`preset`), una imagen propia
 * (`data_url`) y el velo que la ventana pinta encima. Lo leen la web, la
 * ventana al cambiar de workspace y el teléfono.
 */

/** El velo de la ventana: un número es el del chat; el objeto trae también pestañas y paneles. */
export type ChatVeil = number | { chat?: number | null; tabs?: number | null; panels?: number | null };

/**
 * `chat_background`: todo `null` si ni el workspace ni la máquina eligieron nada.
 * `image_url`, la imagen en la cuenta de Danil; por el relay, una imagen grande
 * llega solo así (`data_url` nulo). Un motor anterior no la manda.
 */
export type ChatBackground = { preset: string | null; data_url: string | null; image_url?: string | null; veil: ChatVeil | null };

/**
 * `set_chat_background`: el patrón y el velo se reemplazan siempre (`null` los
 * quita); la imagen queda salvo que lleguen `path` (una copia ya importada) o
 * `dataUrl`. Se quita con `choose_chat_background` sin ruta.
 */
export type ChatBackgroundChange = { preset?: string | null; path?: string | null; dataUrl?: string | null; veil?: ChatVeil | null };

/** El velo del chat cuando el workspace no dice otro: el `VELO_DE_FONDO` de la ventana. */
export const DEFAULT_CHAT_VEIL = 0.82;

/**
 * Lo que pinta un cliente: un patrón elegido manda (la imagen guardada queda
 * para volver a ella); sin patrón, la imagen; sin ninguno, el de la app. Cada
 * velo entre 0 y 1, o `null` si el workspace no dice.
 */
export type ChatBackgroundView = {
  image: string | null;
  preset: string | null;
  veil: { chat: number | null; tabs: number | null; panels: number | null };
};

const unit = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : null);

/** Una imagen solo si es un `data:image/…`: nada que vaya a la red. */
const image = (v: unknown): string | null => (typeof v === "string" && /^data:image\/[\w.+-]+;base64,/i.test(v) ? v : null);

export function chatBackgroundView(answer: unknown): ChatBackgroundView {
  const raw = answer && typeof answer === "object" ? (answer as Partial<Record<keyof ChatBackground, unknown>>) : {};
  const veil = raw.veil;
  const parts = veil && typeof veil === "object" ? (veil as Record<string, unknown>) : {};
  const preset = typeof raw.preset === "string" && raw.preset.trim() ? raw.preset.trim() : null;
  return {
    image: preset ? null : image(raw.data_url),
    preset,
    veil: {
      chat: typeof veil === "number" ? unit(veil) : unit(parts.chat),
      tabs: unit(parts.tabs),
      panels: unit(parts.panels),
    },
  };
}

/**
 * La imagen en la cuenta (`image_url`) cuando no hay patrón elegido: solo
 * `https:`, que se pide con la sesión de la persona. `null` si no hay.
 */
export function chatBackgroundImageUrl(answer: unknown): string | null {
  const raw = answer && typeof answer === "object" ? (answer as Partial<Record<keyof ChatBackground, unknown>>) : {};
  if (typeof raw.preset === "string" && raw.preset.trim()) return null;
  const url = raw.image_url;
  if (typeof url !== "string") return null;
  try {
    return new URL(url).protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}
