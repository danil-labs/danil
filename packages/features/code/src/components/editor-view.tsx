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
import { setDiagnostics } from "@codemirror/lint";
import { search, searchKeymap } from "@codemirror/search";
import { Compartment, EditorState, Prec, Transaction } from "@codemirror/state";
import {
  EditorView,
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
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { frasesDelEditor } from "../model/editorPhrases";
import { sangriaDe } from "../model/indent";
import { RESALTADO, TEMA } from "../model/editorTheme";
import { gramaticaDe, gramaticaLista } from "../model/languages";
import { type DondeTypst, autocompletadoTypst } from "../queries/typstComplete";
import {
  RESALTADO_HASTA,
  conAjuste,
  conSeleccion,
  deFuera,
  diagnosticos,
  marcaDePliegue,
  marcarSalto,
  numerosMarcados,
  saltoMarcado,
  type MarcaDelEditor,
} from "./editor-extensions";

/**
 * El archivo abierto para escribir, con CodeMirror 6 montado a mano. Entra con
 * `lazy()`: el editor se descarga al abrir un archivo, no al arrancar la app.
 * Letra, tamaño, fondo y columna de números son los de `CuerpoDeArchivo`
 * (`Changes.tsx`): si difieren, el texto salta al cambiar de vista. Cómo se
 * pinta, en `editorTheme.ts`.
 */


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
