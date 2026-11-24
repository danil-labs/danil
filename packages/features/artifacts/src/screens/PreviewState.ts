import { createEffect, createSignal, on, onCleanup } from "solid-js";
import { useFileMachine } from "../../../../ui/src/fileMachine";
import { formaDe } from "../model/sandbox";
import { historiaDe, publicacionesDe, type History, type Publicacion, type VersionRef } from "../queries";
import { type Failure, detalleDe } from "../../../../ui/src/Failure";
import { t } from "../../../../ui/src/lib/i18n";
import type PreviewPane from "../components/Preview";

export function createPreviewState(props: Parameters<typeof PreviewPane>[0]) {
  // Lo que falla al preparar una impresión o al abrir una versión no
  // puede quedarse en la consola: desde fuera se ve igual que un botón que no
  // hace nada.
  const [fallo, setFallo] = createSignal<Failure | null>(null);
  /** La máquina de la tarea si no es esta: el historial vive allá, y lo que sale se escribe aquí. */
  const enSuMaquina = useFileMachine();
  const remota = () => enSuMaquina() !== undefined;

  const [historia, setHistoria] = createSignal<History | null>(null);
  /** La versión que se está mirando, o `null` si es la que está en disco. */
  const [viendo, setViendo] = createSignal<VersionRef | null>(null);
  /** Lo que hay en disco. */
  const [actual, setActual] = createSignal<string | null>(null);
  /** Lo que se está pintando: `actual`, o una versión anterior. */
  const [mostrado, setMostrado] = createSignal<string | null>(null);

  const [gen, setGen] = createSignal(0);
  /**
   * Pintar el Markdown, o enseñar el texto tal como está en el archivo.
   * Pintado por omisión: un `.md` se escribe para leerse con formato.
   * Se pinta con el mismo componente que la respuesta del agente en el chat,
   * que filtra el esquema de enlaces e imágenes (`ui/Markdown.tsx`). Un
   * artefacto HTML sigue yendo al contenedor cerrado: HTML sí ejecuta.
   */
  const [pintarMarkdown, setPintarMarkdown] = createSignal(true);
  const [filas, setFilas] = createSignal(0);
  const [ocupado, setOcupado] = createSignal(false);
  /** Lo que ya salió de esta sesión. Es el rastro del gate, no un permiso. */
  const [publicaciones, setPublicaciones] = createSignal<Publicacion[]>([]);
  /** La última salida, para poder decir qué pasó: el diálogo del sistema se
      cierra y desde fuera un archivo escrito en otra carpeta no se ve. */
  const [salida, setSalida] = createSignal<{
    destino: string;
    bytes: number;
  } | null>(null);
  // Todo esto se va con el documento al que pertenece: un error, un historial o
  // una versión abierta de otro archivo, encima del que estás mirando, es
  // información inventada.
  //
  // Con `on(...)` y la lista escrita: el cuerpo lee y escribe casi todas las
  // señales de arriba; rastreando solo, se relanzaría a sí mismo.
  createEffect(
    on(
      () =>
        [
          props.preview?.rel,
          props.preview?.text,
          props.preview?.kind,
          props.absPath,
          props.esArtefacto,
        ] as const,
      ([, , kind, absPath, esArtefacto]) => {

        const texto =
          kind === "html" || kind === "text" ? (props.preview?.text ?? null) : null;
        setActual(texto);
        setMostrado(texto);
        setViendo(null);
        setHistoria(null);
        setFilas(0);
        setFallo(null);
        setSalida(null);
        setPublicaciones([]);
        setGen((g) => g + 1);

        if (!esArtefacto || (kind !== "html" && kind !== "text") || !absPath) return;
        /* Un artefacto web no abre cadena, y no es un olvido: sellar una
           versión le da nombre a lo que sale de la máquina (`workspace/versions.rs`), y
           de un sitio no sale nada — su pestaña no tiene descargar, exportar,
           imprimir ni abrir afuera. Una cadena sin nombre sería una copia por
           cada apertura, para un registro que nadie lee. */
        if (formaDe(texto ?? "") === "web") return;
        let vivo = true;
        historiaDe(absPath, enSuMaquina())
          .then((h) => {
            if (!vivo) return;
            setHistoria(h);
            // Y lo que ya salió de aquí: sin esto la cadena diría qué versiones
            // hay pero no cuál cruzó el límite, que es la mitad que importa.
            if (h.current) {
              publicacionesDe(h.current.project, h.current.session)
                .then(
                  (ps) =>
                    vivo &&
                    setPublicaciones(
                      ps.filter((x) => x.version?.artifact === h.current!.artifact),
                    ),
                )
                .catch(() => {});
            }
          })
          .catch(
            (e) =>
              vivo &&
              setFallo({
                what: t("artifacts.history.failed"),
                detail: detalleDe(e),
              }),
          );

        onCleanup(() => { vivo = false; });
      },
    ),
  );
  return {
    mostrado, setFallo, remota, historia, viendo, enSuMaquina, setPublicaciones, setSalida, setOcupado,
    setHistoria, setMostrado, actual, setViendo, setGen, setActual, filas, publicaciones, pintarMarkdown,
    setPintarMarkdown, ocupado, salida, fallo, gen, setFilas,
  };
}
