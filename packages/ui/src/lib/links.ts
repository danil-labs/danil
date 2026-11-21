const TOPE_DESTINO = 2000;

export type InternalTaskLink = { workspace: string; folder: string; task: string };

export function internalTaskLink(value: unknown): InternalTaskLink | null {
  if (typeof value !== "string" || value.length > TOPE_DESTINO || !value.startsWith("terminus://task?")) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "terminus:" || url.hostname !== "task" || url.pathname || url.hash ||
    url.username || url.password || url.port) return null;
  if ([...url.searchParams.keys()].length !== 3) return null;
  for (const key of ["workspace", "folder", "task"]) {
    if (url.searchParams.getAll(key).length !== 1) return null;
  }
  const workspace = url.searchParams.get("workspace") ?? "";
  const folder = url.searchParams.get("folder") ?? "";
  const task = url.searchParams.get("task") ?? "";
  const id = (s: string) => /^[a-zA-Z0-9_-]+$/.test(s);
  return id(workspace) && (!folder || id(folder)) && id(task) ? { workspace, folder, task } : null;
}

export function destinoAbrible(v: unknown): string | null {
  if (typeof v !== "string") return null;
  if (!/^(https?|mailto):/i.test(v)) return null;
  return v.slice(0, TOPE_DESTINO);
}

export function localFilePath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let path: string;
  try {
    path = decodeURIComponent(value);
  } catch {
    return null;
  }
  if (/[\u0000-\u001f\u007f]/.test(path)) return null;
  path = path.replace(/^\/([a-z]:[\/\\])/i, "$1");
  if (/^\/(?![\/\\])/.test(path) || /^[a-z]:[\/\\]/i.test(path)) {
    return path;
  }
  return null;
}

export function imagenInerte(v: unknown): string | null {
  if (typeof v !== "string") return null;
  if (!/^data:image\//i.test(v)) return null;
  return v;
}

export function imagenLocal(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const ruta = localFilePath(v.replace(/^file:\/\/(?:localhost)?(?=\/)/i, ""));
  if (!ruta || !/\.(png|jpe?g|gif|webp|avif|bmp|ico|svg)$/i.test(ruta)) return null;
  return ruta;
}

export function clicEnEnlaceWeb(
  e: MouseEvent,
  destino: string,
  abrirPanel: (e: MouseEvent) => void,
  mac: boolean,
) {
  e.preventDefault();
  if (mac ? e.metaKey : e.ctrlKey) {
    window.dispatchEvent(new CustomEvent("harness:abrir-fuera", { detail: destino }));
    return;
  }
  abrirPanel(e);
}

export type TrozoDeTexto = { texto: string; url: string | null };

const URL_EN_TEXTO = /https?:\/\/[^\s<>"'`]+/gi;

export function enlacesEnTexto(texto: string): TrozoDeTexto[] {
  const trozos: TrozoDeTexto[] = [];
  let desde = 0;
  for (const m of texto.matchAll(URL_EN_TEXTO)) {
    let url = m[0];
    for (;;) {
      const ultimo = url.at(-1) ?? "";
      if (".,;:!?]}".includes(ultimo)) url = url.slice(0, -1);
      else if (ultimo === ")" && url.split("(").length < url.split(")").length) url = url.slice(0, -1);
      else break;
    }
    const inicio = m.index;
    if (url.length > TOPE_DESTINO || !/^https?:\/\/[^/?#]/i.test(url) || destinoAbrible(url) !== url) continue;
    if (inicio > desde) trozos.push({ texto: texto.slice(desde, inicio), url: null });
    trozos.push({ texto: url, url });
    desde = inicio + url.length;
  }
  if (desde < texto.length) trozos.push({ texto: texto.slice(desde), url: null });
  return trozos;
}
