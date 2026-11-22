import { createEffect, createSignal, on, onCleanup } from "solid-js";
import { type Failure } from "../../../../ui/src/Failure";
import { type ArchivoDiff } from "../model/diff";
import { cargarEditor } from "../model/editorLoad";
import { gramaticaDe } from "../model/languages";
import { esArbolDeCodigo } from "../queries/treeKind";
import { type VisorProps, type Contenido } from "./file-viewer-model";

export function createEstadoDelVisor(props: VisorProps) {
  // El editor y su gramática se piden a la vez y al abrir la pestaña, no uno detrás de otro.
  void cargarEditor();
  void gramaticaDe(props.ruta);
  /** Sin copia de trabajo detrás no hay dónde escribir ni con qué comparar. */
  const previa = () => props.session === "" || Boolean(props.suelto);
  const [contenido, setContenido] = createSignal<Contenido | null>(null);
  const [diff, setDiff] = createSignal<ArchivoDiff | null>(null);
  const [leyendo, setLeyendo] = createSignal(false);
  const [comparando, setComparando] = createSignal(false);
  const [fallo, setFallo] = createSignal<Failure | null>(null);
  /** Lo escrito en el editor. `null` es «no se ha tocado»: el editor enseña el disco. */
  const [borrador, setBorrador] = createSignal<string | null>(null);
  const [guardando, setGuardando] = createSignal(false);
  /** El archivo cambió en disco con algo escrito sin guardar. Guardar o descartar lo resuelven. */
  const [desincronizado, setDesincronizado] = createSignal(false);
  /** Se borró con algo escrito: se avisa y se deja guardarlo de nuevo o cerrar. */
  const [borrado, setBorrado] = createSignal(false);
  /** Aparte de `fallo`, que tapa el archivo entero. */
  const [falloAfuera, setFalloAfuera] = createSignal<Failure | null>(null);

  /**
   * Si hoy tiene diff. Arranca en el `cambiado` del árbol y después lo decide el
   * patch: un archivo que el turno reescriba gana su vista de cambios sin
   * reabrir la pestaña, y uno que el agente revierta la pierde.
   */
  const [hayCambios, setHayCambios] = createSignal(props.cambiado);
  createEffect(on(() => props.cambiado, setHayCambios, { defer: true }));

  /** `null` mientras no se sabe: se pinta como código, que es lo que abre casi siempre. */
  const [deCodigo, setDeCodigo] = createSignal<boolean | null>(props.suelto ? true : null);
  createEffect(
    on([() => props.session, () => props.arbol], ([session, arbol]) => {
      if (props.suelto) return;
      let vivo = true;
      onCleanup(() => {
        vivo = false;
      });
      esArbolDeCodigo(props.project, session, arbol).then(
        (si) => vivo && setDeCodigo(si),
        () => vivo && setDeCodigo(true),
      );
    }),
  );

  /** Un archivo recortado se guardaría recortado, y eso borra lo que no llegó a cruzar. */
  const editable = () => {
    const c = contenido();
    return Boolean(c && c.kind === "text" && !c.truncated && !previa());
  };
  const esTexto = () => contenido()?.kind === "text";
  const sucio = () => borrador() !== null && borrador() !== contenido()?.text;
  const textoActual = () => borrador() ?? contenido()?.text ?? "";
  return {
    previa, contenido, setContenido, diff, setDiff, leyendo, setLeyendo, comparando, setComparando, fallo,
    setFallo, borrador, setBorrador, guardando, setGuardando, desincronizado, setDesincronizado, borrado,
    setBorrado, falloAfuera, setFalloAfuera, hayCambios, setHayCambios, deCodigo, editable, esTexto, sucio,
    textoActual,
  };
}

export type EstadoDelVisor = ReturnType<typeof createEstadoDelVisor>;
