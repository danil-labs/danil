import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import {
  bracketMatching,
  codeFolding,
  foldGutter,
  foldKeymap,
  indentOnInput,
  indentUnit,
  syntaxHighlighting,
} from "@codemirror/language";
import { type Diagnostic, forEachDiagnostic, setDiagnostics } from "@codemirror/lint";
import { search, searchKeymap } from "@codemirror/search";
import {
  Annotation,
  Compartment,
  EditorState,
  type Extension,
  Prec,
  RangeSet,
  RangeSetBuilder,
  StateEffect,
  StateField,
  Transaction,
} from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  GutterMarker,
  ViewPlugin,
  WidgetType,
  gutterLineClass,
  type ViewUpdate,
  crosshairCursor,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  rectangularSelection,
  highlightSpecialChars,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { Show, createEffect, createMemo, onCleanup, onMount, untrack } from "solid-js";
import { t } from "../../lib/i18n";
import { ajuste } from "../../lib/wrap";
import { frasesDelEditor } from "./editorPhrases";
import { sangriaDe } from "./indent";
import { RESALTADO, TEMA } from "./editorTheme";
import { MUESTRA, gramaticaDe, gramaticaLista } from "./languages";
import { type DondeTypst, autocompletadoTypst } from "./typstComplete";

/**
 * El archivo abierto para escribir, con CodeMirror 6 montado a mano. Entra con
 * `lazy()`: el editor se descarga al abrir un archivo, no al arrancar la app.
 * Letra, tamaño, fondo y columna de números son los de `CuerpoDeArchivo`
 * (`Changes.tsx`): si difieren, el texto salta al cambiar de vista. Cómo se
 * pinta, en `editorTheme.ts`.
 */

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

export default function EditorDeCodigo(props: {
  ruta: string;
  /** Lo que tiene que haber dentro. Cambiarlo desde fuera reemplaza el documento. */
  texto: string;
  readOnly?: boolean;
  onEscribir: (texto: string) => void;
  onGuardar: () => void;
  /** Dónde está el cursor, en línea y columna contadas desde 1: lo pinta la barra de estado. */
  onCursor?: (linea: number, columna: number) => void;
  /** El cursor se movió con un clic, no al escribir: la vista de Typst lo sigue solo entonces. */
  onClic?: (linea: number, columna: number) => void;
  /** Con marcas, el número de cada línea con error se pinta de su color. */
  marcas?: MarcaDelEditor[];
  /** Llevar el cursor a una línea; `n` distingue dos saltos al mismo sitio. */
  irA?: { linea: number; columna: number; n: number } | null;
  onIdoA?: (n: number) => void;
  /** En un `.typ`, de dónde pide el panel de propuestas (`typstComplete.ts`); se lee al montar. */
  typst?: () => DondeTypst;
}) {
  let caja!: HTMLDivElement;
  const lenguaje = new Compartment();
  const textos = new Compartment();
  const historial = new Compartment();
  const renglones = new Compartment();
  const editability = new Compartment();
  const grande = props.texto.length > RESALTADO_HASTA;

  const avisarCursor = (estado: EditorState) => {
    const cabeza = estado.selection.main.head;
    const linea = estado.doc.lineAt(cabeza);
    props.onCursor?.(linea.number, cabeza - linea.from + 1);
  };

  onMount(() => {
    const vista = new EditorView({
      parent: caja,
      state: EditorState.create({
        doc: props.texto,
        extensions: [
          lineNumbers(),
          editability.of([EditorState.readOnly.of(Boolean(props.readOnly)), EditorView.editable.of(!props.readOnly)]),
          EditorState.transactionFilter.of(transaction => props.readOnly && transaction.docChanged ? [] : transaction),
          props.marcas ? numerosMarcados : [],
          saltoMarcado,
          highlightActiveLineGutter(),
          highlightActiveLine(),
          conSeleccion,
          codeFolding(),
          foldGutter({ markerDOM: marcaDePliegue }),
          highlightSpecialChars(),
          historial.of(history()),
          // Sin parpadeo: la ventana no tiene animaciones continuas.
          drawSelection({ cursorBlinkRate: 0 }),
          EditorState.allowMultipleSelections.of(true),
          rectangularSelection(),
          crosshairCursor(),
          renglones.of(conAjuste()),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          indentUnit.of(sangriaDe(props.texto)),
          syntaxHighlighting(RESALTADO),
          search({ top: true }),
          // Sin `preventDefault` el webview se queda el atajo y no guarda.
          Prec.highest(
            keymap.of([
              {
                key: "Mod-s",
                preventDefault: true,
                run: () => {
                  props.onGuardar();
                  return true;
                },
              },
            ]),
          ),
          // Tab sangra; Escape y después Tab saca el foco del editor.
          keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, ...searchKeymap, ...foldKeymap, indentWithTab]),
          lenguaje.of((!grande && gramaticaLista(props.ruta)) || []),
          textos.of([]),
          props.typst ? autocompletadoTypst(props.typst) : [],
          TEMA,
          EditorView.updateListener.of((u) => {
            if (u.selectionSet || u.docChanged) avisarCursor(u.state);
            if (props.onClic && u.transactions.some((tr) => tr.isUserEvent("select.pointer"))) {
              const cabeza = u.state.selection.main.head;
              const linea = u.state.doc.lineAt(cabeza);
              props.onClic(linea.number, cabeza - linea.from + 1);
            }
            if (!u.docChanged || u.transactions.every((tr) => tr.annotation(deFuera))) return;
            props.onEscribir(u.state.doc.toString());
          }),
        ],
      }),
    });
    avisarCursor(vista.state);
    let vivo = true;
    onCleanup(() => {
      vivo = false;
      vista.destroy();
    });

    // Reconfigurar vuelve a medir el editor y mueve su scroll: solo cuando el texto cambia de verdad.
    const frases = createMemo(frasesDelEditor, undefined, {
      equals: (a, b) => JSON.stringify(a) === JSON.stringify(b),
    });
    const etiqueta = createMemo(() => t("code.editor.label", { ruta: props.ruta }));
    createEffect(() => {
      vista.dispatch({
        effects: textos.reconfigure([
          EditorState.phrases.of(frases()),
          EditorView.contentAttributes.of({
            "aria-label": etiqueta(),
            spellcheck: "false",
            autocorrect: "off",
            autocapitalize: "off",
          }),
        ]),
      });
    });

    createEffect(() => {
      vista.dispatch({ effects: renglones.reconfigure(conAjuste()) });
    });

    createEffect(() => {
      vista.dispatch({ effects: editability.reconfigure([EditorState.readOnly.of(Boolean(props.readOnly)), EditorView.editable.of(!props.readOnly)]) });
    });

    const marcar = (marcas: MarcaDelEditor[] | undefined) => {
      if (marcas) vista.dispatch(setDiagnostics(vista.state, diagnosticos(vista.state, marcas)));
    };
    createEffect(() => marcar(props.marcas));

    let apagarSalto: ReturnType<typeof setTimeout> | undefined;
    onCleanup(() => clearTimeout(apagarSalto));
    createEffect(() => {
      const destino = props.irA;
      if (!destino) return;
      const linea = vista.state.doc.line(Math.min(Math.max(destino.linea, 1), vista.state.doc.lines));
      const cabeza = linea.from + Math.min(Math.max(destino.columna - 1, 0), linea.length);
      vista.dispatch({ selection: { anchor: cabeza }, effects: marcarSalto.of(cabeza) });
      clearTimeout(apagarSalto);
      apagarSalto = setTimeout(() => vivo && vista.dispatch({ effects: marcarSalto.of(null) }), 1200);
      props.onIdoA?.(destino.n);
      // Solo el scroll del editor: el de CodeMirror sube por los ancestros y, con la
      // pestaña recién abierta, desplaza la ventana entera.
      requestAnimationFrame(() => {
        if (!vivo) return;
        const bloque = vista.lineBlockAt(cabeza);
        vista.scrollDOM.scrollTop = Math.max(0, bloque.top - vista.scrollDOM.clientHeight / 2);
        vista.contentDOM.focus({ preventScroll: true });
      });
    });

    if (!grande && !gramaticaLista(props.ruta)) {
      void gramaticaDe(props.ruta).then((gramatica) => {
        if (vivo && gramatica) vista.dispatch({ effects: lenguaje.reconfigure(gramatica) });
      });
    }

    // Un reemplazo desde fuera vacía el historial: deshacer aplicaría lo escrito
    // antes sobre un texto que ya es otro.
    createEffect(() => {
      const texto = props.texto;
      if (texto === vista.state.doc.toString()) return;
      vista.dispatch({
        changes: { from: 0, to: vista.state.doc.length, insert: texto },
        effects: historial.reconfigure([]),
        annotations: [deFuera.of(true), Transaction.addToHistory.of(false)],
      });
      vista.dispatch({ effects: historial.reconfigure(history()) });
      // Reemplazar el documento entero borra las marcas; las de la última compilación vuelven.
      untrack(() => marcar(props.marcas));
    });
  });

  return (
    <div class="flex min-h-0 min-w-0 flex-1 flex-col">
      <Show when={grande}>
        <p class="m-0 border-b border-border bg-surface-raised px-3 py-1.5 text-caption text-neutral-500">
          {t("code.editor.large")}
        </p>
      </Show>
      <div ref={caja} class="flex min-h-0 min-w-0 flex-1 flex-col" />
    </div>
  );
}
