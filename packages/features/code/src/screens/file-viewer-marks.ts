import { createEffect, createSignal, on, onCleanup, untrack } from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { nombreDeLenguaje } from "../model/languages";
import { direccionDePagina } from "../components/PagePreview";
import {
  type DiagnosticoTypst,
  ampliarVista,
  compiladoDe,
  diagnosticosDelArchivo,
  pedirArreglo,
  revelarEnElArbol,
  salto,
  saltarA,
} from "../queries/typst";
import { type VisorProps, esHtml } from "./file-viewer-model";
import { type EstadoDelVisor } from "./file-viewer-state";
import { type DisposicionDelVisor } from "./file-viewer-layout";

export function createMarcasDelVisor(props: VisorProps, deps: EstadoDelVisor & DisposicionDelVisor) {
  const {
    previa, contenido, hayCambios, typstVivo, disposicion, ladoCodigo, ladoPrevia, fijar,
  } = deps;
  const marcas = () =>
    typstVivo()
      ? diagnosticosDelArchivo(props.session, props.arbol, props.ruta).map((d) => ({
          linea: d.line ?? 1,
          columna: d.column ?? 1,
          severidad: d.severity,
          mensaje: d.message,
          accion:
            d.severity === "error"
              ? { nombre: t("code.typst.fix.one"), aplicar: () => arreglarUno(d) }
              : undefined,
        }))
      : undefined;
  function arreglarUno(d: DiagnosticoTypst) {
    const main = compiladoDe(props.session, props.arbol)?.main ?? props.ruta;
    pedirArreglo(props.project, props.session, main, [d]);
  }
  const irA = () => {
    const s = salto();
    return s && s.session === props.session && s.arbol === props.arbol && s.ruta === props.ruta ? s : null;
  };
  createEffect(() => {
    if (irA() && disposicion() === "previa") untrack(() => fijar("lado"));
  });
  function irAlDiagnostico(d: DiagnosticoTypst) {
    if (d.path === null || d.line === null) return;
    ampliarVista(props.session, props.arbol, false);
    if (d.path !== props.ruta) {
      props.onAbrirOtro?.(d.path);
      revelarEnElArbol(props.session, props.arbol, d.path);
    }
    saltarA(props.session, props.arbol, d.path, d.line, d.column ?? 1);
  }
  const partida = () => ladoCodigo() && ladoPrevia();

  /** Un `.html` de la tarea se ve servido de su carpeta, y se recarga con cada lectura del disco. */
  const [lecturas, setLecturas] = createSignal(0);
  createEffect(on(contenido, () => setLecturas((n) => n + 1), { defer: true }));
  const pagina = () =>
    esHtml(props.ruta) && !previa() && props.arbol !== "terminus-chat-visuals"
      ? direccionDePagina(props.project, props.session, props.arbol, props.ruta, lecturas())
      : null;

  /** Los cambios se piden al mirarlos y tapan el lado del código; la vista previa sigue a su lado. */
  const [verCambios, setVerCambios] = createSignal(Boolean(props.enCambios));
  const mostrarCambios = () => verCambios() && hayCambios() && !previa();
  function alternarCambios() {
    const ver = !verCambios();
    setVerCambios(ver);
    if (ver && disposicion() === "previa") fijar("codigo");
  }

  const [cursor, setCursor] = createSignal<{ linea: number; columna: number } | null>(null);
  const [lenguaje, setLenguaje] = createSignal<string | null>(null);
  createEffect(
    on(
      () => props.ruta,
      (ruta) => {
        let vivo = true;
        onCleanup(() => {
          vivo = false;
        });
        nombreDeLenguaje(ruta).then(
          (n) => vivo && setLenguaje(n),
          () => vivo && setLenguaje(null),
        );
      },
    ),
  );

  return {
    marcas, irA, irAlDiagnostico, partida, pagina, verCambios, mostrarCambios, alternarCambios, cursor,
    setCursor, lenguaje,
  };
}

export type MarcasDelVisor = ReturnType<typeof createMarcasDelVisor>;
