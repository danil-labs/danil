import { foldGutter, syntaxHighlighting } from "@codemirror/language";
import { type Diagnostic, forEachDiagnostic } from "@codemirror/lint";
import { Annotation, EditorState, type Extension, RangeSet, RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  GutterMarker,
  ViewPlugin,
  WidgetType,
  gutterLineClass,
  type ViewUpdate,
  drawSelection,
  lineNumbers,
} from "@codemirror/view";
import { ajuste } from "../../../../ui/src/lib/wrap";
import { RESALTADO, TEMA } from "../model/editorTheme";
import { MUESTRA } from "../model/languages";

/** Por encima, el archivo abre sin resaltado: analizarlo entero congela la ventana al teclear. */
const RESALTADO_HASTA = 500_000;

/** El chevron de lucide que usa el árbol de archivos: abajo si el bloque está abierto, a la derecha si está plegado. */
function marcaDePliegue(abierto: boolean): HTMLElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  for (const [k, v] of Object.entries({
    width: "12",
    height: "12",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
  })) {
    svg.setAttribute(k, v);
  }
  const trazo = document.createElementNS(ns, "path");
  trazo.setAttribute("d", abierto ? "m6 9 6 6 6-6" : "m9 18 6-6-6-6");
  svg.append(trazo);
  const caja = document.createElement("span");
  caja.classList.add("cm-fold-marker");
  caja.dataset.open = String(abierto);
  caja.append(svg);
  return caja;
}

/** Sin ella el navegador corta justo tras la sangría y deja vacío el primer renglón de una línea larga. */
const sangriaSinCorte = Decoration.mark({ attributes: { style: "white-space: nowrap" } });

// Con el ajuste de línea, el renglón partido sigue bajo su sangría en vez de volver al borde.
// Cubre todo lo dibujado, no solo lo visible: una línea que ganara su sangría después cambiaría de alto y movería el scroll.
function sangrias(vista: EditorView): DecorationSet {
  const marcas = new RangeSetBuilder<Decoration>();
  const { from, to } = vista.viewport;
  for (let pos = from; pos <= to; ) {
    const linea = vista.state.doc.lineAt(pos);
    const blancos = /^[ \t]*/.exec(linea.text)?.[0] ?? "";
    const columnas = blancos.replace(/\t/g, " ".repeat(vista.state.tabSize)).length;
    if (columnas > 0) {
      marcas.add(
        linea.from,
        linea.from,
        Decoration.line({ attributes: { style: `padding-left: calc(${columnas}ch + 0.25rem); text-indent: -${columnas}ch` } }),
      );
      if (blancos.length < linea.length) {
        marcas.add(linea.from, linea.from + blancos.length, sangriaSinCorte);
      }
    }
    pos = linea.to + 1;
  }
  return marcas.finish();
}

const sangriaColgante = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(vista: EditorView) {
      this.decorations = sangrias(vista);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) this.decorations = sangrias(u.view);
    }
  },
  { decorations: (v) => v.decorations },
);

class NumeroMarcado extends GutterMarker {
  constructor(readonly elementClass: string) {
    super();
  }
}
const numeroConError = new NumeroMarcado("cm-numero-error");
const numeroConAviso = new NumeroMarcado("cm-numero-aviso");

// La línea con un error pinta su número, sin una columna aparte junto al texto.
const numerosMarcados = StateField.define<RangeSet<GutterMarker>>({
  create: () => RangeSet.empty,
  update(_, tr) {
    const porLinea = new Map<number, GutterMarker>();
    forEachDiagnostic(tr.state, (d) => {
      const inicio = tr.state.doc.lineAt(d.from).from;
      if (d.severity === "error") porLinea.set(inicio, numeroConError);
      else if (!porLinea.has(inicio)) porLinea.set(inicio, numeroConAviso);
    });
    const marcas = [...porLinea].sort(([a], [b]) => a - b).map(([pos, marca]) => marca.range(pos));
    return RangeSet.of(marcas);
  },
  provide: (campo) => gutterLineClass.from(campo),
});

/** El lugar al que se saltó: una gota en el punto y la línea encendida, como en la vista de Typst. */
const marcarSalto = StateEffect.define<number | null>();

class Gota extends WidgetType {
  toDOM() {
    const gota = document.createElement("span");
    gota.classList.add("cm-gota");
    gota.setAttribute("aria-hidden", "true");
    return gota;
  }
  ignoreEvent() {
    return true;
  }
}

const saltoMarcado = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(marcas, tr) {
    for (const e of tr.effects) {
      if (!e.is(marcarSalto)) continue;
      if (e.value === null) return Decoration.none;
      const linea = tr.state.doc.lineAt(e.value);
      return Decoration.set(
        [
          Decoration.line({ class: "cm-linea-saltada" }).range(linea.from),
          Decoration.widget({ widget: new Gota(), side: 1 }).range(e.value),
        ],
        true,
      );
    }
    return marcas.map(tr.changes);
  },
  provide: (campo) => EditorView.decorations.from(campo),
});

const conAjuste = () => (ajuste() ? [EditorView.lineWrapping, sangriaColgante] : []);

/** Con texto seleccionado la línea activa se apaga: encima de la selección deja el comentario por debajo de 4,5:1. */
const conSeleccion = EditorView.editorAttributes.compute(["selection"], (estado): Record<string, string> =>
  estado.selection.ranges.some((r) => !r.empty) ? { class: "cm-has-selection" } : {},
);

/** Lo que llega de fuera —disco, refresco, descarte— y no es algo que se escribió. */
const deFuera = Annotation.define<boolean>();

/**
 * Monta un editor fuera de la pantalla y lo tira. La primera apertura cuesta
 * sobre todo inicializar CodeMirror —estilos, medidas, el primer análisis—, no
 * descargarlo: hecho en un rato ocioso, abrir el primer archivo cuesta como el segundo.
 */
export function calentar(gramaticas: Extension[]) {
  const caja = document.createElement("div");
  caja.style.cssText = "position:fixed;left:-10000px;top:0;width:600px;height:300px";
  document.body.append(caja);
  const vistas = [null, ...gramaticas].map(
    (g) =>
      new EditorView({
        parent: caja,
        doc: MUESTRA,
        extensions: [
          lineNumbers(),
          foldGutter({ markerDOM: marcaDePliegue }),
          drawSelection({ cursorBlinkRate: 0 }),
          syntaxHighlighting(RESALTADO),
          TEMA,
          g ?? [],
        ],
      }),
  );
  requestAnimationFrame(() => {
    for (const v of vistas) v.destroy();
    caja.remove();
  });
}

/** Un error o aviso sobre una línea, con lo que se puede hacer desde su tooltip. */
export type MarcaDelEditor = {
  linea: number;
  columna: number;
  severidad: "error" | "warning";
  mensaje: string;
  accion?: { nombre: string; aplicar: () => void };
};

function diagnosticos(estado: EditorState, marcas: MarcaDelEditor[]): Diagnostic[] {
  return marcas
    .filter((m) => m.linea >= 1 && m.linea <= estado.doc.lines)
    .map((m) => {
      const linea = estado.doc.line(m.linea);
      const from = linea.from + Math.min(Math.max(m.columna - 1, 0), linea.length);
      return {
        from,
        to: Math.max(from, linea.to),
        severity: m.severidad,
        message: m.mensaje,
        actions: m.accion ? [{ name: m.accion.nombre, apply: m.accion.aplicar }] : undefined,
      };
    });
}

export { RESALTADO_HASTA, conAjuste, conSeleccion, deFuera, diagnosticos, marcaDePliegue, marcarSalto, numerosMarcados, saltoMarcado };
