import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { createSignal, onCleanup } from "solid-js";

import type { Failure } from "../../ui/src/Failure";
import { t } from "../../ui/src/lib/i18n.ts";

/**
 * El único copiado de la ventana. `navigator.clipboard` pide un gesto
 * reciente del webview: con un turno en vuelo el clic ya no cuenta y rechaza
 * con `NotAllowedError` (issue #642). El portapapeles del sistema no pide
 * ninguno. Rechaza con un `Failure`; el renglón de abajo se arma a mano, y lo
 * que no sea cadena ni `Error` no da renglón que pintar.
 */
export async function copyText(text: string): Promise<void> {
  try {
    await writeText(text);
  } catch (e) {
    const detail = typeof e === "string" ? e : e instanceof Error ? e.message : "";
    throw { what: t("common.clipboard.write_failed"), detail } satisfies Failure;
  }
}

/**
 * El «copiado» que se apaga solo. `copied()` es la clave de lo último copiado,
 * para las listas con un botón por fila. Sin `onError` el fallo se calla.
 */
export function createCopied<K extends string | boolean = boolean>(ms = 1500, onError?: (e: unknown) => void) {
  const [copied, setCopied] = createSignal<K | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const reset = () => {
    clearTimeout(timer);
    setCopied(null);
  };
  onCleanup(() => clearTimeout(timer));
  async function copy(text: string, key = true as K) {
    try {
      await copyText(text);
      clearTimeout(timer);
      setCopied(() => key);
      timer = setTimeout(reset, ms);
    } catch (e) {
      onError?.(e);
    }
  }
  return { copied, copy, reset };
}

export function imagenPegada(dt: DataTransfer | null): File | null {
  const items = dt?.items;
  if (!items) return null;
  for (let i = 0; i < items.length; i += 1) {
    const it = items[i];
    if (it.kind !== "file" || !it.type.startsWith("image/")) continue;
    const f = it.getAsFile();
    if (f) return f;
  }
  return null;
}

export function base64De(f: Blob): Promise<string> {
  return new Promise((ok, mal) => {
    const r = new FileReader();
    r.onerror = () =>
      mal({
        what: { clave: "chat.attachments.paste_unreadable" },
        detail: "",
      } satisfies Failure);
    r.onload = () => {
      const s = String(r.result);
      ok(s.slice(s.indexOf(",") + 1));
    };
    r.readAsDataURL(f);
  });
}
