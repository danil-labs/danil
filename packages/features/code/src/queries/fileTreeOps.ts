import { treeCreateFile, treeCreateFolder, treeDelete, treeRename } from "../queries";
import { machineOf } from "../../../../host/src/machine";
import { createSignal, onCleanup, onMount } from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { asFailure, type Failure } from "../../../../ui/src/Failure";
import { avisarDeLosArboles } from "./refresh";
import { conVistaTypst, esTypst, seguirPluginTypst } from "./typst";
import type { Nodo } from "../model/tree";
import { type ArbolProps, debajoDe, nombreDe, padreDe, type Tipo, unir } from "../model/fileTree";
import type { CargaDelArbol } from "./fileTreeLoad";

/** Lo que se hace sobre el árbol: seleccionar, crear, renombrar y borrar, y el menú que lo ofrece. */
export function createOperacionesDelArbol(props: ArbolProps, carga: CargaDelArbol) {
  const { setBusca, setAbiertas, abiertas, ids, paths, locales, falloEstado, leyendoEstado } = carga;
  // La vista previa lee un commit: ahí no hay árbol que escribir. Crear sí,
  // en la tarea que nace para eso (`crearSinTarea`).
  const editable = () => !props.preview;
  const creable = () => editable() || Boolean(props.crearSinTarea);
  seguirPluginTypst();
  const conOjo = (ruta: string) => !props.preview && conVistaTypst() && esTypst(ruta);
  const [seleccion, setSeleccion] = createSignal<{ ruta: string; tipo: Tipo } | null>(null);

  // Un archivo que se abrió desde fuera del árbol (el doble clic en la vista de Typst) se enseña aquí.
  onMount(() => {
    const revelar = (e: Event) => {
      const d = (e as CustomEvent<{ session: string; arbol: string; ruta: string }>).detail;
      if (d.session !== props.session || d.arbol !== props.arbol) return;
      const carpetas: string[] = [];
      for (let p = padreDe(d.ruta); p; p = padreDe(p)) carpetas.push(p);
      setBusca("");
      setAbiertas(new Set([...abiertas(), ...carpetas]));
      setSeleccion({ ruta: d.ruta, tipo: "archivo" });
      requestAnimationFrame(() =>
        document.querySelector(`[data-ruta="${CSS.escape(d.ruta)}"]`)?.scrollIntoView({ block: "nearest" }),
      );
    };
    window.addEventListener("harness:revelar-en-arbol", revelar);
    onCleanup(() => window.removeEventListener("harness:revelar-en-arbol", revelar));
  });
  const [nuevo, setNuevo] = createSignal<{ padre: string; tipo: Tipo } | null>(null);
  const [renombrando, setRenombrando] = createSignal<string | null>(null);
  const [menu, setMenu] = createSignal<{
    nodo: Nodo | null;
    x: number;
    y: number;
    borrando: boolean;
  } | null>(null);
  const [falloOp, setFalloOp] = createSignal<Failure | null>(null);

  async function operar(comando: () => Promise<unknown>): Promise<boolean> {
    setFalloOp(null);
    try {
      await comando();
      avisarDeLosArboles(props.session);
      return true;
    } catch (e) {
      setFalloOp(asFailure(e));
      return false;
    }
  }

  // Una barra haría de un nombre una ruta, y la carpeta intermedia no existe.
  function nombreInvalido(nombre: string) {
    if (!/[\\/]/.test(nombre)) return false;
    setFalloOp({ what: t("code.tree.name.invalid"), detail: nombre });
    return true;
  }

  function empezarNuevo(tipo: Tipo, padre?: string) {
    const s = seleccion();
    const donde = padre ?? (s ? (s.tipo === "carpeta" ? s.ruta : padreDe(s.ruta)) : "");
    setMenu(null);
    setRenombrando(null);
    setFalloOp(null);
    setBusca("");
    if (donde) setAbiertas(new Set([...abiertas(), donde]));
    setNuevo({ padre: donde, tipo });
  }

  async function crear(nombre: string): Promise<boolean> {
    const n = nuevo();
    if (!n || nombreInvalido(nombre)) return false;
    const path = unir(n.padre, nombre);
    const sinTarea = props.preview ? props.crearSinTarea : undefined;
    const hecho = await operar(() =>
      sinTarea
        ? sinTarea(n.tipo, path)
        : n.tipo === "archivo"
          ? treeCreateFile({ ...ids(), path }, machineOf(props.session))
          : treeCreateFolder({ ...ids(), path }, machineOf(props.session)),
    );
    if (!hecho) return false;
    setNuevo(null);
    // La tarea que nació abre su árbol y el archivo.
    if (sinTarea) return true;
    setSeleccion({ ruta: path, tipo: n.tipo });
    if (n.tipo === "archivo") props.onAbrir(path, false);
    return true;
  }

  function empezarARenombrar(ruta: string) {
    setMenu(null);
    setNuevo(null);
    setFalloOp(null);
    setRenombrando(ruta);
  }

  async function renombrar(desde: string, nombre: string): Promise<boolean> {
    if (nombreInvalido(nombre)) return false;
    const hasta = unir(padreDe(desde), nombre);
    const hecho = await operar(() => treeRename({ ...ids(), from: desde, to: hasta }, machineOf(props.session)));
    if (!hecho) return false;
    setRenombrando(null);
    const s = seleccion();
    if (s && debajoDe(s.ruta, desde)) setSeleccion({ ...s, ruta: hasta + s.ruta.slice(desde.length) });
    props.onMovido?.(desde, hasta);
    return true;
  }

  async function borrar(nodo: Nodo) {
    setMenu(null);
    const hecho = await operar(() => treeDelete({ ...ids(), path: nodo.ruta }, machineOf(props.session)));
    if (!hecho) return;
    const s = seleccion();
    if (s && debajoDe(s.ruta, nodo.ruta)) setSeleccion(null);
    props.onBorrado?.(nodo.ruta);
  }

  // Lo que git ignora no entra en la cuenta; el aviso de una carpeta lo dice aparte.
  const archivosBajo = (ruta: string) =>
    [...new Set([...paths(), ...locales().keys()])].filter((p) => debajoDe(p, ruta));

  // Sin el estado local leído no se sabe qué está sin guardar, y se afirma el peor caso.
  function comoSeRecupera(nodo: Nodo): string {
    if (props.kind === "folder") return t("code.tree.delete.lost");
    const intacto =
      !falloEstado() &&
      !leyendoEstado() &&
      archivosBajo(nodo.ruta).every((p) => !locales().has(p));
    if (props.kind === "kn")
      return intacto ? t("code.tree.delete.kn_restorable") : t("code.tree.delete.kn_partial");
    return intacto ? t("code.tree.delete.git_restorable") : t("code.tree.delete.git_partial");
  }

  function preguntaDeBorrado(nodo: Nodo): string {
    const count = nodo.tipo === "carpeta" ? archivosBajo(nodo.ruta).length : 0;
    return count > 0
      ? t("code.tree.delete.folder", { name: nombreDe(nodo.ruta), count })
      : t("code.tree.delete.file", { name: nombreDe(nodo.ruta) });
  }


  return {
    editable, creable, conOjo, seleccion, setSeleccion, nuevo, setNuevo, renombrando, setRenombrando,
    menu, setMenu, falloOp, empezarNuevo, crear, empezarARenombrar, renombrar, borrar, comoSeRecupera,
    preguntaDeBorrado,
  };
}

export type OperacionesDelArbol = ReturnType<typeof createOperacionesDelArbol>;
