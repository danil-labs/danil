import {
  type Completion,
  type CompletionContext,
  type CompletionResult,
  autocompletion,
  snippet,
  startCompletion,
} from "@codemirror/autocomplete";
import type { Extension, Text } from "@codemirror/state";
import { EditorView, ViewPlugin } from "@codemirror/view";
import { t } from "../../../../ui/src/lib/i18n";
import { callEngine } from "../../../../engine-client/src/client.ts";
import { machineOf } from "../../../../host/src/machine";
import type { InsercionDeRuta } from "./typst";

/**
 * El panel de propuestas de un `.typ`: referencias y citas tras `@`, rutas en `image("…")`
 * o `#include "…"` y funciones tras `#`. Las da el Tinymist de la vista en vivo
 * (`typst_live_complete`), el mismo que compila; aquí solo se filtran y se pintan como tarjetas.
 * También mete rutas relativas al archivo abierto, arrastradas desde el árbol o con su menú.
 */

/** `typst_live.rs` · `Sugerencia`. */
type Sugerencia = {
  kind: "cite" | "heading" | "figure" | "table" | "equation" | "label" | "file" | "folder" | "function" | "other";
  label: string;
  insert: string;
  snippet: boolean;
  line: number | null;
  column: number | null;
  detail: string | null;
  authors: string | null;
  year: string | null;
  image: string | null;
};

type Opcion = Completion & { sugerencia: Sugerencia };

/** El archivo del editor y, con la vista en vivo, la clave de su Tinymist. */
export type DondeTypst = { project: string; session: string; arbol: string; ruta: string; key: string | null };

/** Los caracteres con los que Tinymist sabe qué se le pide; otro se pide como invocación. */
const DISPAROS = new Set(["#", "(", "<", ",", ".", ":", "/", '"', "@"]);
const TOPE_DE_OPCIONES = 120;

const IMAGENES = ["png", "jpg", "jpeg", "gif", "webp", "svg"];
const extensionDe = (ruta: string) => ruta.slice(ruta.lastIndexOf(".") + 1).toLowerCase();

/** `destino` escrito desde `archivo`, los dos relativos a la carpeta de la tarea. */
function rutaRelativa(archivo: string, destino: string): string {
  const desde = archivo.split("/").slice(0, -1);
  const hasta = destino.split("/");
  let comunes = 0;
  while (comunes < desde.length && comunes < hasta.length && desde[comunes] === hasta[comunes]) comunes++;
  const relativa = [...Array<string>(desde.length - comunes).fill(".."), ...hasta.slice(comunes)].join("/");
  return relativa || ".";
}

/** Dentro de una cadena va la ruta sola; fuera, la llamada que la usa según el tipo de archivo. */
function textoDeRuta(doc: Text, pos: number, relativa: string): string {
  const linea = doc.lineAt(pos);
  const antes = linea.text.slice(0, pos - linea.from);
  if ((antes.match(/(?<!\\)"/g)?.length ?? 0) % 2 === 1) return relativa;
  // En argumentos ya se está en código: sin `#`.
  const codigo = /[(,:]\s*$/.test(antes);
  const ext = extensionDe(relativa);
  const llamada = IMAGENES.includes(ext)
    ? `image("${relativa}")`
    : ext === "typ"
      ? `include "${relativa}"`
      : ext === "bib"
        ? `bibliography("${relativa}")`
        : null;
  if (!llamada) return `"${relativa}"`;
  return codigo ? llamada : `#${llamada}`;
}

function meterRuta(vista: EditorView, archivo: string, destino: string, pos: number) {
  const texto = textoDeRuta(vista.state.doc, pos, rutaRelativa(archivo, destino));
  vista.dispatch({
    changes: { from: pos, insert: texto },
    selection: { anchor: pos + texto.length },
    userEvent: "input",
  });
  vista.focus();
}

/** Dónde empieza lo que se escribe, si ese sitio pide propuestas. */
function inicioDe(antes: string, explicito: boolean): number | null {
  const ref = /@[\p{L}\p{N}_\-:.]*$/u.exec(antes);
  if (ref) return ref.index + 1;
  if (/(?:ref|cite)\(\s*<[\p{L}\p{N}_\-:.]*$/u.test(antes)) return antes.lastIndexOf("<") + 1;
  if (/(?:image|include|import|bibliography|read|json|yaml|toml|csv|xml|cbor|plugin)\s*\(?\s*"[^"]*$/.test(antes)) {
    return antes.lastIndexOf('"') + 1;
  }
  const funcion = /#[\p{L}_][\p{L}\p{N}_\-]*$|#$/u.exec(antes);
  if (funcion) return funcion.index + 1;
  if (!explicito) return null;
  return antes.length - (/[\p{L}\p{N}_\-]*$/u.exec(antes)?.[0].length ?? 0);
}

const normal = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

/** Por la clave, el título, los autores, el año o la leyenda; primero lo que empieza igual. */
function filtrar(sugerencias: Sugerencia[], consulta: string): Sugerencia[] {
  const q = normal(consulta);
  if (!q) return sugerencias.slice(0, TOPE_DE_OPCIONES);
  const puntuadas: [number, Sugerencia][] = [];
  for (const s of sugerencias) {
    const label = normal(s.label);
    const resto = normal([s.detail, s.authors, s.year].filter(Boolean).join(" "));
    const puntos = label.startsWith(q) ? 0 : label.includes(q) ? 1 : resto.includes(q) ? 2 : -1;
    if (puntos >= 0) puntuadas.push([puntos, s]);
  }
  return puntuadas
    .sort((a, b) => a[0] - b[0])
    .slice(0, TOPE_DE_OPCIONES)
    .map(([, s]) => s);
}

/** Fragmento del LSP (`$1`, `${1:x}`, `$0`) a la sintaxis de CodeMirror. */
const fragmento = (lsp: string) => lsp.replace(/\$(\d+)/g, (_, n: string) => (n === "0" ? "${}" : `\${${n}}`));

function posicion(doc: Text, linea: number, columna: number): number | null {
  if (linea < 1 || linea > doc.lines) return null;
  const l = doc.line(linea);
  return columna - 1 <= l.length ? l.from + columna - 1 : null;
}

const MARCAS: Record<Sugerencia["kind"], string> = {
  cite: "❞",
  heading: "§",
  figure: "▣",
  table: "▦",
  equation: "∑",
  label: "‹›",
  file: "▤",
  folder: "▸",
  function: "ƒ",
  other: "·",
};

const nombreDe = (kind: Sugerencia["kind"]): string =>
  ({
    cite: () => t("code.typst.complete.cite"),
    heading: () => t("code.typst.complete.heading"),
    figure: () => t("code.typst.complete.figure"),
    table: () => t("code.typst.complete.table"),
    equation: () => t("code.typst.complete.equation"),
    label: () => t("code.typst.complete.label"),
    file: () => t("code.typst.complete.file"),
    folder: () => t("code.typst.complete.folder"),
    function: () => t("code.typst.complete.function"),
    other: () => "",
  })[kind]();

const CON_CLAVE = new Set<Sugerencia["kind"]>(["cite", "heading", "figure", "table", "equation", "label"]);

function elemento(clase: string, texto?: string) {
  const e = document.createElement("div");
  e.className = clase;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

/** Las miniaturas, por árbol y ruta: el mismo `tree_show` que abre la imagen en su pestaña. */
const miniaturas = new Map<string, Promise<string | null>>();
function miniatura(donde: DondeTypst, ruta: string): Promise<string | null> {
  const clave = `${donde.session}\n${donde.arbol}\n${ruta}`;
  let pedida = miniaturas.get(clave);
  if (!pedida) {
    if (miniaturas.size > 200) miniaturas.clear();
    pedida = callEngine<{ kind: string; data_url: string | null }>("tree_show", {
      project: donde.project,
      session: donde.session,
      tree: donde.arbol,
      path: ruta,
    }, machineOf(donde.session)).then(
      (c) => (c.kind === "image" ? c.data_url : null),
      () => null,
    );
    miniaturas.set(clave, pedida);
  }
  return pedida;
}

function tarjeta(s: Sugerencia, donde: DondeTypst | null): HTMLElement {
  const caja = elemento("cm-typst-card");
  const marca = elemento("cm-typst-mark", MARCAS[s.kind]);
  marca.setAttribute("aria-hidden", "true");
  if (s.image && donde) {
    const imagen = document.createElement("img");
    imagen.alt = "";
    void miniatura(donde, s.image).then((url) => {
      if (!url) return;
      imagen.src = url;
      marca.replaceChildren(imagen);
    });
  }
  const textos = elemento("cm-typst-text");
  const conClave = CON_CLAVE.has(s.kind);
  textos.append(elemento("cm-typst-title", conClave ? (s.detail ?? s.label) : s.label));
  const sub =
    s.kind === "cite"
      ? [s.authors, s.year, `@${s.label}`]
      : conClave
        ? [nombreDe(s.kind), s.detail ? `@${s.label}` : null]
        : [s.kind === "function" || s.kind === "other" ? s.detail : nombreDe(s.kind)];
  const linea = sub.filter(Boolean).join(" · ");
  if (linea) textos.append(elemento("cm-typst-sub", linea));
  caja.append(marca, textos);
  return caja;
}

const ESTILO = EditorView.theme({
  ".cm-tooltip.cm-tooltip-autocomplete.cm-typst-panel > ul": {
    maxHeight: "20rem",
    minWidth: "18rem",
    maxWidth: "28rem",
    fontFamily: "var(--font-sans)",
    padding: "0.25rem",
  },
  ".cm-tooltip.cm-typst-panel > ul > li": {
    padding: "0.3125rem 0.5rem",
    borderRadius: "var(--radius-sm)",
    lineHeight: "1.3",
  },
  ".cm-tooltip.cm-typst-panel > ul > li[aria-selected]": {
    backgroundColor: "var(--color-editor-selection)",
    color: "var(--color-neutral-950)",
  },
  ".cm-typst-panel .cm-completionLabel, .cm-typst-panel .cm-completionDetail": { display: "none" },
  ".cm-typst-card": { display: "flex", alignItems: "center", gap: "0.5rem", minWidth: "0" },
  ".cm-typst-mark": {
    flex: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "2rem",
    height: "2rem",
    overflow: "hidden",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-sm)",
    backgroundColor: "var(--color-surface)",
    color: "var(--color-neutral-500)",
    fontSize: "0.8125rem",
  },
  ".cm-typst-mark img": { width: "100%", height: "100%", objectFit: "cover" },
  ".cm-typst-text": { flex: "1", minWidth: "0" },
  ".cm-typst-title, .cm-typst-sub": { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  ".cm-typst-title": { color: "var(--color-neutral-950)" },
  ".cm-typst-sub": { color: "var(--color-neutral-500)", fontSize: "0.6875rem" },
});

export function autocompletadoTypst(donde: () => DondeTypst): Extension {
  let ultimo: { clave: string; inicio: number; pedido: Promise<Sugerencia[] | null> } | null = null;

  async function fuente(ctx: CompletionContext): Promise<CompletionResult | null> {
    const d = donde();
    if (!d.key) return null;
    const linea = ctx.state.doc.lineAt(ctx.pos);
    const antes = linea.text.slice(0, ctx.pos - linea.from);
    const desde = inicioDe(antes, ctx.explicit);
    if (desde === null) return null;
    const inicio = linea.from + desde;
    // Lo que se escribe después del inicio se filtra aquí: Tinymist responde una vez por sitio.
    const clave = [d.key, d.ruta, inicio, ctx.state.doc.length - (ctx.pos - inicio), antes.slice(0, desde)].join("\n");
    if (ultimo?.clave !== clave) {
      const previo = desde > 0 ? antes[desde - 1] : "";
      ultimo = {
        clave,
        inicio,
        pedido: callEngine<Sugerencia[]>("typst_live_complete", {
          key: d.key,
          path: d.ruta,
          text: ctx.state.doc.toString(),
          line: linea.number,
          column: desde + 1,
          trigger: DISPAROS.has(previo) ? previo : null,
        }).catch(() => null),
      };
    }
    const sugerencias = await ultimo.pedido;
    if (!sugerencias || ctx.aborted) return null;
    const opciones: Opcion[] = filtrar(sugerencias, ctx.state.sliceDoc(inicio, ctx.pos)).map((s) => ({
      label: s.label,
      type: s.kind,
      sugerencia: s,
      apply: (vista, opcion, _from, to) => {
        const propio = s.line !== null && s.column !== null ? posicion(vista.state.doc, s.line, s.column) : null;
        const de = propio !== null && propio <= to && propio >= vista.state.doc.lineAt(to).from ? propio : inicio;
        if (s.snippet) {
          snippet(fragmento(s.insert))(vista, opcion, de, to);
        } else {
          vista.dispatch({
            changes: { from: de, to, insert: s.insert },
            selection: { anchor: de + s.insert.length },
            userEvent: "input.complete",
          });
        }
        if (s.kind === "folder") startCompletion(vista);
      },
    }));
    if (opciones.length === 0) return null;
    return { from: inicio, to: ctx.pos, options: opciones, filter: false };
  }

  // `data-typst-editor` es a donde apunta el arrastre desde el árbol (`typst.ts` · `arrastrarRuta`).
  const insercion = ViewPlugin.define((vista) => {
    vista.dom.dataset.typstEditor = donde().ruta;
    const alPedir = (e: Event) => {
      const p = (e as CustomEvent<InsercionDeRuta>).detail;
      const d = donde();
      if (p.session !== d.session || p.arbol !== d.arbol || p.editor !== d.ruta) return;
      const soltada = p.x !== undefined && p.y !== undefined ? vista.posAtCoords({ x: p.x, y: p.y }) : null;
      meterRuta(vista, d.ruta, p.destino, soltada ?? vista.state.selection.main.head);
    };
    window.addEventListener("harness:insertar-ruta", alPedir);
    return {
      update: () => {
        vista.dom.dataset.typstEditor = donde().ruta;
      },
      destroy: () => window.removeEventListener("harness:insertar-ruta", alPedir),
    };
  });

  return [
    autocompletion({
      override: [fuente],
      icons: false,
      maxRenderedOptions: TOPE_DE_OPCIONES,
      tooltipClass: () => "cm-typst-panel",
      addToOptions: [{ render: (opcion) => tarjeta((opcion as Opcion).sugerencia, donde()), position: 20 }],
    }),
    insercion,
    ESTILO,
  ];
}
