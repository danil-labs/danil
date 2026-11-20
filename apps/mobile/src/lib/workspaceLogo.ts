import { readAccountAsset } from "@terminus/computers";
import { useEffect, useState } from "react";
import { useAccount } from "./account";
import { useMachines } from "./machines";
import { COMPUTERS } from "./computersEndpoint";

/**
 * El logo de un workspace de la cuenta (`logo_url` de `GET /v1/workspaces`),
 * leído con la sesión como `data:`, igual en iOS, Android y la web (la política
 * de la página no carga imágenes remotas). Lo ya leído sale al primer render,
 * sin pasar por la inicial; lo que falla se vuelve a pedir la próxima vez.
 */
const read = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();

const toDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});

function load(url: string, getToken: () => Promise<string>, onUnauthorized: () => void): Promise<string | null> {
  let reading = pending.get(url);
  if (!reading) {
    reading = getToken()
      .then((token) => readAccountAsset(COMPUTERS, url, "logo", token, undefined, onUnauthorized))
      .then((blob) => (blob ? toDataUrl(blob) : null))
      .catch(() => null)
      .then((image) => {
        pending.delete(url);
        if (image) read.set(url, image);
        return image;
      });
    pending.set(url, reading);
  }
  return reading;
}

/** La imagen del logo, o `null` sin logo, mientras carga o si no se pudo leer. */
export function useWorkspaceLogo(workspace: string | null | undefined): string | null {
  const { registry } = useMachines();
  const { getToken, unauthorized } = useAccount();
  const url = registry?.find((row) => row.id === workspace)?.logo_url ?? null;
  const [loaded, setLoaded] = useState<{ url: string; image: string } | null>(null);
  useEffect(() => {
    if (!url || read.has(url)) return;
    let live = true;
    void load(url, getToken, () => void unauthorized()).then((image) => {
      if (live && image) setLoaded({ url, image });
    });
    return () => { live = false; };
  }, [url, getToken, unauthorized]);
  if (!url) return null;
  return read.get(url) ?? (loaded?.url === url ? loaded.image : null);
}
