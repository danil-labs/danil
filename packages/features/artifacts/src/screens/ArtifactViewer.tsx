import { createEffect, createMemo, createSignal, on, onCleanup, type JSX } from "solid-js";
import { previewFile } from "../queries";
import { machineOf } from "../../../../host/src/machine";
import { FileMachine } from "../../../../ui/src/fileMachine";
import PreviewPane, { type Preview } from "../components/Preview";
import { prosaDe } from "../../../../ui/src/Failure";

/**
 * Un artefacto abierto como pestaña del espacio principal, con preview propio
 * por pestaña.
 *
 * **Carga al montarse y solo entonces.** Cada pestaña se monta una vez y se
 * esconde al cambiar de una a otra (`App.tsx`): volver a ella no vuelve a
 * pedir el archivo. Si el artefacto se reescribe durante un turno, se lee lo
 * que había al abrirlo; cerrar y reabrir lo trae otra vez. Un refresco
 * automático aquí pisaría una edición sin guardar del documento (ver
 * `FileViewer.tsx`).
 *
 * La ruta absoluta viaja en la pestaña y no se resuelve aquí: la lista es de
 * la columna y esta pantalla no la tiene.
 */
export default function VisorDeArtefacto(props: {
  /** Dónde vive: la carpeta de trabajo de la tarea más su `rel`. */
  path: string;
  /** Su ruta dentro de la carpeta de trabajo, que es lo que se lee. */
  rel: string;
  /** Lo produjo el agente («output»), lo adjuntó la persona («input») o vive fuera de la tarea («external»). */
  kind: "output" | "input" | "external";
  /** La tarea de la pestaña: si corre en otra máquina, el archivo está en su disco. */
  session?: string;
  renderPdf: (props: { base64: string; name: string }) => JSX.Element;
  renderImage: (props: { src: string; alt: string }) => JSX.Element;
  renderTable: (props: { text: string; delim: string }) => JSX.Element;
}) {
  const machine = createMemo(() => machineOf(props.session)?.headers["x-terminus-machine"]);
  const [preview, setPreview] = createSignal<Preview | null>(null);
  const [fallo, setFallo] = createSignal<string | null>(null);

  // La misma ruta puede pertenecer a otra tarea o máquina. Una lectura vieja
  // no puede reemplazar el documento que ya cambió de ámbito.
  createEffect(
    on(
      () => [props.path, props.rel, props.session, machine()] as const,
      ([path, rel]) => {
        let current = true;
        onCleanup(() => { current = false; });
        setPreview(null);
        setFallo(null);
        previewFile(path, rel, machineOf(props.session))
          .then((value) => { if (current) setPreview(value); })
          .catch((e) => {
            if (current) setFallo(prosaDe(e));
          });
      },
    ),
  );

  return (
    // El relleno lo decide `PreviewPane`, no esta pantalla: un artefacto web
    // va a sangre, y qué forma tiene lo sabe el visor. Es el mismo relleno que
    // la transcripción (`Chat.tsx`).
    <FileMachine.Provider value={machine}>
    <div class="h-full">
      <PreviewPane
        preview={preview()}
        absPath={props.path}
        /* Un adjunto no tiene cadena de versiones: la sesión no lo produjo, lo
           recibió. Editarlo aquí lo convertiría en producto sin que nadie lo
           decidiera. */
        esArtefacto={props.kind === "output"}
        error={fallo()}
        renderPdf={props.renderPdf}
        renderImage={props.renderImage}
        renderTable={props.renderTable}
      />
    </div>
    </FileMachine.Provider>
  );
}
