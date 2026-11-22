import { createEffect, createSignal, on, onCleanup } from "solid-js";
import { typstLiveChange, typstLiveCloseDoc, typstLiveReveal } from "../queries";
import { pedirReapertura, vivaDe, mirarEditorTypst, dejarDeMirarEditorTypst } from "../queries/typst";
import { type VisorProps, PAUSA_DE_LA_PREVIA, PAUSA_DEL_INDICE } from "./file-viewer-model";
import { type EstadoDelVisor } from "./file-viewer-state";
import { type DisposicionDelVisor } from "./file-viewer-layout";
import { type LecturaDelVisor } from "./file-viewer-io";

export function createTypstDelVisor(props: VisorProps, deps: EstadoDelVisor & DisposicionDelVisor & LecturaDelVisor) {
  const {
    contenido, borrador, desincronizado, borrado, editable, sucio, textoActual, typst, typstVivo, guardaSolo,
    guardar,
  } = deps;
  const [textoDeLaPrevia, setTextoDeLaPrevia] = createSignal("");
  createEffect(
    on(textoActual, (texto) => {
      if (borrador() === null) return void setTextoDeLaPrevia(texto);
      const espera = setTimeout(() => setTextoDeLaPrevia(texto), PAUSA_DE_LA_PREVIA);
      onCleanup(() => clearTimeout(espera));
    }),
  );

  // El texto del editor es la única fuente de un `.typ` abierto: viaja entero a Tinymist en
  // cada cambio, uno a la vez y sin pasos intermedios. El disco lo escribe el guardado, al dejar de teclear.
  const vivaDelArbol = () => (typstVivo() ? vivaDe(props.session, props.arbol) : null);
  let enviando = false;
  let porEnviar: { key: string; texto: string } | null = null;
  let abiertoEn: { key: string; path: string } | null = null;
  async function enviar(key: string, texto: string) {
    porEnviar = { key, texto };
    if (enviando) return;
    enviando = true;
    while (porEnviar) {
      const envio: { key: string; texto: string } = porEnviar;
      porEnviar = null;
      try {
        const path = props.ruta;
        await typstLiveChange({ key: envio.key, path, text: envio.texto });
        abiertoEn = { key: envio.key, path };
      } catch {
        // Sin reabrir, los errores que se ven son los de un texto que ya no es: la vista nueva lo vuelve a mandar.
        pedirReapertura(props.session, props.arbol);
      }
    }
    enviando = false;
  }
  createEffect(() => {
    const viva = vivaDelArbol();
    const texto = borrador() ?? contenido()?.text ?? null;
    if (viva?.estado !== "lista" || texto === null) return;
    void enviar(viva.key, texto);
  });
  onCleanup(() => {
    // Sin `props.ruta`: al desmontar puede venir de un `<Show>` que ya no se cumple y lanzar «Stale read».
    if (abiertoEn) void typstLiveCloseDoc(abiertoEn).catch(() => {});
  });

  // El panel de «@» y las rutas pide a la vista de este árbol; sin ella, el editor no propone nada.
  const dondeTypst = () => {
    const viva = vivaDelArbol();
    return {
      project: props.project,
      session: props.session,
      arbol: props.arbol,
      ruta: props.ruta,
      key: viva?.estado === "lista" ? viva.key : null,
    };
  };
  createEffect(() => {
    if (!props.visible || !typst() || !editable()) return;
    const editor = { session: props.session, arbol: props.arbol, ruta: props.ruta };
    mirarEditorTypst(editor);
    onCleanup(() => dejarDeMirarEditorTypst(editor));
  });

  function mostrarEnLaVista(linea: number, columna: number) {
    const viva = vivaDelArbol();
    if (viva?.estado !== "lista") return;
    void typstLiveReveal({ key: viva.key, path: props.ruta, line: linea, column: columna }).catch(() => {});
  }

  let guardadoEnEspera: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(guardadoEnEspera));
  createEffect(
    on(borrador, () => {
      clearTimeout(guardadoEnEspera);
      if (!guardaSolo() || !editable() || !sucio() || desincronizado() || borrado()) return;
      guardadoEnEspera = setTimeout(() => {
        if (sucio() && !desincronizado() && !borrado()) void guardar();
      }, PAUSA_DEL_INDICE);
    }),
  );

  return {
    textoDeLaPrevia, dondeTypst, mostrarEnLaVista,
  };
}

export type TypstDelVisor = ReturnType<typeof createTypstDelVisor>;
