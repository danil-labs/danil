import { createEffect, on, onCleanup, onMount } from "solid-js";
import { attachRepo, gitHostProjects } from "../queries/engine-git";
import { asFailure } from "../../../../ui/src/Failure";
import { listGitHosts } from "../../../../session/src/gitHosts.ts";
import { type Provider, type ProyectoRemoto, rankOf } from "./ProvidersModel";
import type { ProvidersProps } from "./ProvidersView";
import type { createProveedores } from "./ProvidersState";

export function createAccionesDeProveedores(props: ProvidersProps, proveedores: ReturnType<typeof createProveedores>) {
  const { setCargando, setLista, scope, setFallo, lista, montajes, actualizarAcceso, ocupado, setRepos, verAreas, comprobado, setComprobado, comprobar, abierta, setAbierta, repos, setOcupado, setFallas, setTrayendo, setTraidos } = proveedores;
  async function cargar() {
    setCargando(true);
    try {
      setLista(await listGitHosts<Provider>(await scope));
      setFallo(null);
    } catch (e) {
      // Cargando, vacío y error son tres pantallas distintas: dejar la lista
      // vacía haría que el catálogo apareciera como si no hubiera proveedores.
      setLista(null);
      setFallo(asFailure(e));
    } finally {
      setCargando(false);
    }
  }

  onMount(() => {
    void cargar();
  });

  onMount(() => {
    const refresh = () => {
      for (const p of lista() ?? []) {
        if (montajes()[p.id]) void actualizarAcceso(p.id);
        else if (p.connected && p.select_area && !ocupado()[p.id]) {
          setRepos({});
          void verAreas(p.id);
        }
      }
    };
    window.addEventListener("focus", refresh);
    onCleanup(() => window.removeEventListener("focus", refresh));
  });

  // Revalidar al abrir: "conectado" tiene que ser algo comprobado hoy y no algo
  // que se dijo una vez. Un token revocado se descubre aquí, no cuando alguien
  // intente usarlo.
  //
  // Con `on(lista, …)`: el cuerpo lee `comprobado` y `ocupado`, y rastreándolos
  // se relanzaría a sí mismo — `setComprobado` es lo primero que hace.
  createEffect(
    on(lista, (l) => {
      if (!l) return;
      for (const p of l) {
        if (p.connected && !comprobado()[p.id] && !ocupado()[p.id]) {
          setComprobado((c) => ({ ...c, [p.id]: true }));
          void comprobar(p.id);
        }
      }
    }),
  );

  async function verProyectos(id: string, area: string) {
    const clave = `${id}/${area}`;
    if (abierta()[id] === area) {
      setAbierta((a) => ({ ...a, [id]: null }));
      return;
    }
    setAbierta((a) => ({ ...a, [id]: area }));
    if (repos()[clave]) return;
    setOcupado((o) => ({ ...o, [id]: "listando" }));
    setFallas((f) => ({ ...f, [id]: null }));
    try {
      const r = await gitHostProjects<ProyectoRemoto[]>({ id, area, scope: await scope });
      setRepos((x) => ({ ...x, [clave]: r }));
    } catch (e) {
      setFallas((f) => ({ ...f, [id]: asFailure(e) }));
      setAbierta((a) => ({ ...a, [id]: null }));
    } finally {
      setOcupado((o) => ({ ...o, [id]: null }));
    }
  }

  /**
   * Trae una copia del repositorio al workspace activo.
   *
   * Sin proyecto: aquí se está mirando lo que hay en la organización, no
   * trabajando en algo concreto. La fuente queda dada de alta en el
   * workspace, y se adjunta a un proyecto desde la pantalla que sabe a cuál.
   */
  async function traer(id: string, r: ProyectoRemoto) {
    setTrayendo(r.clone_url);
    setFallas((f) => ({ ...f, [id]: null }));
    try {
      await attachRepo({
        project: "",
        gitHost: id,
        cloneUrl: r.clone_url,
        branch: r.branch || undefined,
        name: r.name,
      });
      setTraidos((x) => ({ ...x, [r.clone_url]: true }));
    } catch (e) {
      setFallas((f) => ({ ...f, [id]: asFailure(e) }));
    } finally {
      setTrayendo(null);
    }
  }

  const visibles = () => {
    const l = lista();
    if (!l) return [];
    const solo = props.solo ? [props.solo].flat() : null;
    // Uno por id, el conectado si hay: el estado va por id, y con dos `github` del motor la sección sale dos veces.
    const unicos = new Map<string, Provider>();
    for (const p of solo ? l.filter((p) => solo.includes(p.id)) : l) {
      if (!unicos.has(p.id) || (p.connected && !unicos.get(p.id)!.connected)) unicos.set(p.id, p);
    }
    return [...unicos.values()].sort((a, b) => rankOf(a.id) - rankOf(b.id));
  };
  return { visibles, verProyectos, traer };
}
