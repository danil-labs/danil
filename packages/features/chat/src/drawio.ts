/**
 * Lo que hay que saber para pintar un diagrama de draw.io dentro del chat.
 *
 * Vive fuera del componente: `node --test` no entiende JSX. Y un `</script>`
 * dentro del XML o del visor cierra la etiqueta que lo contiene y deja la vista
 * en blanco sin un error.
 */

/** El XML que trajo la llamada, o `null` si no vino uno. */
export function drawioXml(args: Record<string, unknown> | null | undefined): string | null {
  const value = args?.xml;
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/** El Mermaid que trajo la llamada, o `null`. El servidor prefiere Mermaid. */
export function drawioMermaid(args: Record<string, unknown> | null | undefined): string | null {
  const value = args?.mermaid;
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/** La dirección con la que el diagrama se abre en el editor de draw.io. */
export function drawioEditUrl(xml: string): string {
  return `https://app.diagrams.net/?pv=0&grid=0#R${encodeURIComponent(xml)}`;
}

export function drawioCompressed(xml: string): boolean {
  return /<diagram(?:\s[^>]*)?>\s*[^<\s]/i.test(xml);
}

export async function drawioExpandedXml(xml: string): Promise<string> {
  const pages = [...xml.matchAll(/<diagram(?:\s[^>]*)?>([^<]+)<\/diagram>/gi)];
  for (const page of pages.reverse()) {
    const encoded = page[1].trim();
    if (!encoded) continue;
    const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    const expanded = decodeURIComponent(await new Response(stream).text());
    if (!/^\s*<mxGraphModel[\s>]/.test(expanded)) throw new Error("Invalid compressed draw.io page");
    const start = page.index + page[0].indexOf(">") + 1;
    xml = xml.slice(0, start) + expanded + xml.slice(start + page[1].length);
  }
  return xml;
}

export type DrawioAsset = { path: string; names: string[]; kind: "stencil" | "shape" };
export type DrawioSource = { kind: DrawioAsset["kind"]; source: string };

export function drawioAssets(xml: string, catalog: DrawioAsset[]): DrawioAsset[] {
  const names = [...xml.matchAll(/mxgraph\.[a-zA-Z0-9_.-]+/g)].map((match) => match[0].toLowerCase());
  return catalog.filter((asset) => {
    const extension = asset.kind === "stencil" ? "xml" : "js";
    if (!new RegExp(`^(stencils|shapes)/[a-zA-Z0-9_/-]+\\.${extension}$`).test(asset.path)) return false;
    if (asset.path.includes("..")) return false;
    return asset.names.some((prefix) => names.some((name) => name === prefix || name.startsWith(`${prefix}.`)));
  });
}

const VIEW_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data:",
  "font-src data:",
  "media-src data:",
  "connect-src 'none'",
  "form-action 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
  "object-src 'none'",
  "worker-src 'none'",
].join("; ");

/**
 * El documento aislado que monta el visor oficial sobre el XML.
 *
 * El visor viaja en línea: el iframe no tiene origen ni red, y un
 * `<script src>` no cargaría. Las dos sustituciones de `<` evitan que el
 * analizador de HTML corte la etiqueta en el primer `</script`.
 */
export function drawioScene(viewer: string, xml: string, assets: DrawioSource[] = []): string {
  // Dos codificaciones a propósito: el atributo espera texto JSON, y un objeto
  // literal se convierte en «[object Object]» y el visor no pinta nada.
  const config = JSON.stringify(
    JSON.stringify({
      xml,
      nav: true,
      resize: true,
      toolbar: "zoom layers lightbox",
    }),
  ).replace(/</g, "\\u003c");
  const stencils = assets.filter((asset) => asset.kind === "stencil").map((asset) => asset.source);
  const shapes = assets.filter((asset) => asset.kind === "shape").map((asset) => asset.source).join("\n");
  const source = `${viewer}\n${shapes}`.replace(/<\/script/gi, "<\\/script");
  return (
    '<!doctype html><html><head><meta charset="utf-8">' +
    `<meta http-equiv="Content-Security-Policy" content="${VIEW_CSP}">` +
    "<style>html,body{margin:0;width:100%;height:100%;overflow:hidden}#g{width:100%;height:100%}</style>" +
    '</head><body><div id="g" class="mxgraph"></div>' +
    `<script>${source}</script>` +
    "<script>try{" +
    `document.getElementById("g").setAttribute("data-mxgraph",${config});` +
    "mxStencilRegistry.dynamicLoading=false;" +
    `${JSON.stringify(stencils).replace(/</g, "\\u003c")}.forEach(xml=>mxStencilRegistry.parseStencilSet(mxUtils.parseXml(xml).documentElement));` +
    "GraphViewer.processElements();" +
    'parent.postMessage({terminusDrawio:"ok"},"*");' +
    '}catch(e){parent.postMessage({terminusDrawio:"error",detail:String((e&&e.message)||e)},"*");}</script>' +
    "</body></html>"
  );
}
