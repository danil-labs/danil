import { createEffect, createSignal, on, onCleanup } from "solid-js";
import {
  officePreview,
  openFileExternal,
  openTreeExternal,
  previewFile,
  previewTreeShow,
  readTreePart,
  treeOfficePreview,
  treePatch,
  treeShow,
  treeWrite,
} from "../queries";
import { machineOf } from "../../../../host/src/machine";
import { asFailure } from "../../../../ui/src/Failure";
import { capabilities } from "../../../../host/src/platform";
import type { FilePreview as Preview, TreePart } from "../../../../engine-client/src/index.ts";
import type { LeerParte } from "../../../../host/src/tree-download";
import { parsearDiff } from "../model/diff";
import { IDOS, alMoverseElArbol, comoEntra, esBorrado, type DetalleDeIdos } from "../queries/refresh";
import { type VisorProps, type Contenido, ESPERA_DEL_BORRADO } from "./file-viewer-model";
import { type EstadoDelVisor } from "./file-viewer-state";
import { type DisposicionDelVisor } from "./file-viewer-layout";
import { type MarcasDelVisor } from "./file-viewer-marks";

export function createLecturaDelVisor(props: VisorProps, deps: EstadoDelVisor & DisposicionDelVisor & MarcasDelVisor) {
  const {
    previa, contenido, setContenido, diff, setDiff, setLeyendo, setComparando, setFallo, borrador,
    setBorrador, guardando, setGuardando, desincronizado, setDesincronizado, setBorrado, setFalloAfuera,
    setHayCambios, editable, sucio, guardaSolo, ladoCodigo, mostrarCambios,
  } = deps;
  /** Cuenta los guardados: una relectura que se cruzó con uno no pisa el editor con lo de antes. */
  let escrituras = 0;

  /** `false` si no se pudo: el fallo se pinta y el borrador sigue en el editor. */
  async function guardar(): Promise<boolean> {
    const texto = borrador();
    if (texto === null || !sucio()) return true;
    if (guardando() || props.readOnly) return false;
    setGuardando(true);
    setFallo(null);
    try {
      await treeWrite({
        project: props.project,
        session: props.session,
        tree: props.arbol,
        path: props.ruta,
        text: texto,
      }, machineOf(props.session));
      // Sin tirar el diff cacheado, la vista de cambios seguiría enseñando el de antes de escribir.
      setContenido({ ...contenido()!, text: texto });
      setDiff(null);
      setHayCambios(true);
      setDesincronizado(false);
      setBorrado(false);
      // Lo tecleado mientras viajaba el guardado no está en disco: soltarlo lo borraría del editor.
      if (borrador() === texto) setBorrador(null);
      escrituras++;
      props.onGuardado();
      return true;
    } catch (e) {
      setFallo(asFailure(e));
      return false;
    } finally {
      setGuardando(false);
    }
  }

  createEffect(() => props.onSucio(sucio()));
  props.onGuardador(guardar);
  onCleanup(() => {
    props.onGuardador(null);
    props.onSucio(false);
  });

  /** Fuera de esta computadora (la web, o una tarea de otra máquina) el archivo se baja aquí en vez de abrirse allá. */
  const conDescarga = () => leerParte() !== null && (!capabilities().nativeWindow || !!machineOf(props.session));
  /** La salida usa lo que hay en disco, no lo escrito sin guardar. */
  const canOpenExternal = () => !conGuardadoManual() && (props.suelto || props.session !== "") && !machineOf(props.session) && !conDescarga();
  const [bajando, setBajando] = createSignal(false);
  async function bajar() {
    const leer = leerParte();
    if (!leer || bajando()) return;
    setBajando(true);
    setFalloAfuera(null);
    try {
      const { descargar } = await import("../../../../host/src/tree-download");
      await descargar(props.ruta, leer);
    } catch (e) {
      setFalloAfuera(asFailure(e));
    } finally {
      setBajando(false);
    }
  }

  async function openExternal() {
    setFalloAfuera(null);
    try {
      if (props.suelto) {
        await openFileExternal({ target: props.ruta });
      } else {
        await openTreeExternal({
          project: props.project,
          session: props.session,
          tree: props.arbol,
          path: props.ruta,
        });
      }
    } catch (e) {
      setFalloAfuera(asFailure(e));
    }
  }

  /** El editor se monta la primera vez que se mira el código, y se queda: desmontarlo tira el deshacer. */
  const [conEditor, setConEditor] = createSignal(false);
  createEffect(() => {
    if (props.visible && ladoCodigo() && !mostrarCambios() && editable()) setConEditor(true);
  });

  /** Los bytes del archivo por partes (`tree_parts_v1`): el video, el audio y la descarga. */
  const leerParte = (): LeerParte | null =>
    props.suelto || props.session === ""
      ? null
      : (offset, size, revision) =>
          readTreePart<TreePart>({
            project: props.project,
            session: props.session,
            tree: props.arbol,
            path: props.ruta,
            offset,
            size,
            revision: revision ?? null,
          }, machineOf(props.session));

  // El PDF de un documento de Office; sin archivo en disco (una rama base) no hay.
  function pedirOffice(): Promise<Preview> | null {
    if (props.suelto) return officePreview<Preview>({ path: props.ruta }, machineOf(props.session));
    if (props.session === "") return null;
    return treeOfficePreview<Preview>({
      project: props.project,
      session: props.session,
      tree: props.arbol,
      path: props.ruta,
    }, machineOf(props.session));
  }

  const pedirContenido = async (): Promise<Contenido> => {
    if (props.suelto) {
      const p = await previewFile<Preview>({ path: props.ruta, rel: props.ruta }, machineOf(props.session));
      return {
        kind: p.kind === "html" ? "text" : p.kind,
        text: p.text ?? "",
        data_url: p.data_url ?? null,
        pdf: p.pdf ?? null,
        bytes: p.bytes,
        truncated: p.truncated,
      };
    }
    return props.session === ""
      ? previewTreeShow<Contenido>({
          project: props.project,
          baseRef: props.base,
          path: props.ruta,
        })
      : treeShow<Contenido>({
          project: props.project,
          session: props.session,
          tree: props.arbol,
          path: props.ruta,
        }, machineOf(props.session));
  };

  /** Su diff con el archivo entero de contexto (`tree_patch`, `-U100000`). Vacío = no cambió. */
  const pedirDiff = () =>
    previa()
      ? Promise.resolve(null)
      : treePatch({
          project: props.project,
          session: props.session,
          tree: props.arbol,
          path: props.ruta,
        }, machineOf(props.session)).then((patch) => parsearDiff(patch)[0] ?? null);

  // Siempre y no solo al mirarlo: sin saber si es texto no se sabe si se puede escribir.
  createEffect(
    on([() => props.ruta, () => props.arbol], async () => {
      setLeyendo(true);
      try {
        setContenido(await pedirContenido());
      } catch (e) {
        if (esBorrado(e)) void alBorrarse();
        else setFallo(asFailure(e));
      } finally {
        setLeyendo(false);
      }
    }),
  );

  // Una sola vez: cambiar de vista y volver no lo vuelve a pedir.
  createEffect(
    on([mostrarCambios, () => props.ruta, () => props.arbol], async ([ver]) => {
      if (!ver || diff() !== null) return;
      setComparando(true);
      try {
        setDiff(await pedirDiff());
      } catch (e) {
        setFallo(asFailure(e));
      } finally {
        setComparando(false);
      }
    }),
  );

  /**
   * Volver a leer el archivo porque el árbol se movió (`refresh.ts`). Pide
   * también el patch: sin él, la vista de cambios seguiría lo que dijo el árbol
   * la última vez. Con el borrador tocado no entra encima: enciende el aviso.
   */
  async function refrescar() {
    if (props.suelto) return;
    const vista = escrituras;
    try {
      // En serie: leer el contenido pone al día el índice del que sale el diff.
      const c = await pedirContenido();
      const d = await pedirDiff();
      if (escrituras !== vista) return;
      setDiff(d);
      setHayCambios(d !== null);
      // El disco dice lo que ya se sabía: lo guardó esta pestaña o cambió otro archivo de la tarea.
      // Tocar el editor ahí borraría lo tecleado desde entonces.
      // Con el peso: de un archivo recortado solo cruzan sus primeros 400 KB.
      if (c.kind === contenido()?.kind && c.text === contenido()?.text && c.bytes === contenido()?.bytes) return;
      const entrada = comoEntra(borrador() !== null, sucio());
      if (entrada === "avisa") {
        setDesincronizado(true);
        return;
      }
      setContenido(c);
      if (entrada === "arrastra") setBorrador(c.text);
    } catch (e) {
      if (esBorrado(e)) void alBorrarse();
      else setFallo(asFailure(e));
    }
  }

  alMoverseElArbol(
    () => props.session,
    () => props.visible,
    () => void refrescar(),
  );

  /**
   * El archivo ya no está en el disco. Se mira otra vez tras una pausa: quien lo reescribe
   * borrándolo y creándolo no cierra la pestaña. Sin nada escrito se cierra; con algo, avisa.
   */
  let confirmando = false;
  async function alBorrarse() {
    if (confirmando || props.suelto || previa()) return;
    confirmando = true;
    try {
      await new Promise((listo) => setTimeout(listo, ESPERA_DEL_BORRADO));
      await pedirContenido();
      setBorrado(false);
      void refrescar();
    } catch (e) {
      if (!esBorrado(e)) return void setFallo(asFailure(e));
      if (sucio()) setBorrado(true);
      else props.onBorrado?.();
    } finally {
      confirmando = false;
    }
  }

  // Escondida también: el árbol avisa de lo que dejó de listar y solo esa pestaña lee.
  const alIrse = (e: Event) => {
    const d = (e as CustomEvent<DetalleDeIdos>).detail;
    if (d.session === props.session && d.arbol === props.arbol && d.rutas.includes(props.ruta)) void alBorrarse();
  };
  window.addEventListener(IDOS, alIrse);
  onCleanup(() => window.removeEventListener(IDOS, alIrse));

  function descartar() {
    if (props.readOnly) return;
    // Con el archivo movido por debajo, lo que está en la mano es lo de antes: hay que traer lo del agente.
    const traer = desincronizado();
    setFallo(null);
    setBorrador(null);
    setDesincronizado(false);
    if (traer) void refrescar();
  }

  /** Con el plugin, el archivo se guarda solo en la copia: Guardar y Descartar sobran salvo ante un cambio ajeno. */
  const conGuardadoManual = () => sucio() && (!guardaSolo() || !editable() || desincronizado());
  return {
    guardar, conDescarga, canOpenExternal, bajando, bajar, openExternal, conEditor, leerParte, pedirOffice,
    descartar, conGuardadoManual,
  };
}

export type LecturaDelVisor = ReturnType<typeof createLecturaDelVisor>;
