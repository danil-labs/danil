/**
 * Tipos y estado compartido del workspace: el cliente del que cuelgan
 * proyectos, sesiones, artefactos, consumo y token. No pinta nada; lo consumen
 * la columna de workspaces, el panel de administrar y `App.tsx`.
 *
 * No puede llamarse `workspaces.ts`: al lado vive `Workspaces.tsx`, en macOS el
 * sistema de archivos no distingue mayúsculas y `tsc` falla con TS1261 — en
 * Linux no, así que el CI de Ubuntu daría verde.
 */
import { createEffect, createMemo, createSignal, on, onCleanup, onMount } from "solid-js";
import { invoke } from "../../lib/invoke.ts";
import { asFailure, type Failure } from "../../ui/Failure";
import { t } from "../../lib/i18n";
import { createNavigationOrder } from "../../lib/navigation-order";
import type { Frase } from "../../lib/prose";

export type Workspace = {
  id: string;
  name: string;
  /**
   * Su raíz de gobierno: el id de la única fuente de contexto propia del
   * workspace. `null` es uno recién creado; su estado vacío es el que la pide.
   */
  context_root: string | null;
  /** En qué lengua se pinta la app aquí. `null` hereda la de la máquina. */
  lengua: string | null;
  /** Perfil opcional que decide el idioma de salida del agente. */
  lengua_de_salida: string | null;
  /** Qué tema pinta terminal, código y diff. `null` es el de por omisión. */
  terminal_theme: string | null;
  /**
   * Dónde nacen los árboles de las tareas nuevas. `null` es la carpeta de
   * datos de la app; los árboles ya creados no se mueven al cambiarlo.
   */
  worktrees_root: string | null;
  /** Con qué modo de permisos arranca lo nuevo. `null` es el último elegido a mano. */
  default_permission_mode: string | null;
  /** «Usar el GitHub de esta computadora». Un motor anterior no lo manda. */
  host_github?: boolean;
  git_host: string | null;
  remote: string | null;
  /** Dónde vive la memoria de este workspace — espejo de `memoria::Proveedor`. */
  memoria: MemoriaProveedor;
  created_at: number;
  /** Cuántas tareas hay dentro. Se cuenta en disco al leer, no se guarda. */
  sessions: number;
  /** Ruta de la copia dentro del workspace. `null` pinta las iniciales. */
  logo: string | null;
  /** La cuenta de Danil con que se ve desde la web y el teléfono; un motor anterior no la manda. */
  danil?: { user_id: string; email?: string | null; name?: string | null } | null;
};

/**
 * El proveedor de memoria del workspace. `origen` es solo de dónde sale
 * (esquema y host, o el programa), nunca el bloque: ningún cliente lo
 * reconstruye ni lo reenvía.
 */
export type MemoriaProveedor =
  | { tipo: "local" }
  | { tipo: "mcp_externo"; origen: { url: string } | { command: string }; lectura_escritura: boolean };

/**
 * Una migración de los datos en disco que hace el motor.
 * `moved` es lo que se movió y `problems` lo que quedó fuera; nada de esto se
 * pinta, vive en `migrations.json`. El tipo se queda porque el contrato con
 * Rust lo trae: describirlo mal rompe el puente sin aviso.
 */
export type Run = {
  version: number;
  at: number;
  moved: { what: string; count: number }[];
  problems: string[];
};

/**
 * Lo que devuelven `workspaces_startup` y `list_workspaces`. Se declara una
 * sola vez: una segunda copia compila igual con el campo renombrado y falla al
 * primer clic, en el sitio que nadie miró.
 */
export type Startup = {
  workspaces: Workspace[];
  /** `null` en el primer arranque: todavía no hay ninguno. */
  active: string | null;
  /** Todas las que corrieron, en orden. Los datos pasaron por más de una. */
  migrations: Run[];
  /**
   * Por qué esta ventana no puede abrir estos datos. Con esto puesto,
   * `workspaces` y `active` vienen vacíos y NO significan «primer arranque»:
   * no hay que abrir el alta, hay que tapar la app.
   */
  bloqueo?: Frase;
};

/**
 * Avisa al resto de la app de que cambió el workspace: lo que hay en pantalla
 * es de otro cliente y no puede quedarse. El evento es una mudanza y solo lo
 * emite quien muda; quien escucha tira la conversación abierta. Para «cambió el
 * material» está `harness:sources`, que recarga sin cerrar nada.
 */
export function anunciarMudanza() {
  window.dispatchEvent(new CustomEvent("harness:workspace"));
}

/**
 * Avisa de que un workspace se llama de otra forma. Quien escucha relee la
 * lista y no cierra nada: `harness:workspace` tira la conversación abierta, y
 * cambiar un nombre no muda de cliente.
 */
export function anunciarRenombrado() {
  window.dispatchEvent(new CustomEvent("harness:workspace-name"));
}

/**
 * La consulta en vuelo, si la hay: una sola ida a Rust aunque la columna
 * y el panel de Configuración monten a la vez. No es una caché — se suelta al
 * llegar la respuesta; cachearla dejaría viejo uno de los dos paneles al
 * cambiar de workspace.
 */
let enVuelo: Promise<Startup> | null = null;

function pedirEspacios(): Promise<Startup> {
  enVuelo ??= invoke<Startup>("list_workspaces").finally(() => {
    enVuelo = null;
  });
  return enVuelo;
}

/**
 * Estado que comparten los montajes —la columna, el riel y el panel de
 * Configuración—: la lista, cuál está activo, si hay un turno vivo, y cómo se
 * cambia.
 *
 * Cambiar con una tarea contestando es válido: el turno captura su workspace al
 * arrancar y su transcripción y consumo aterrizan donde salieron
 * (`chat::Cierre`). `turnosVivos` solo bloquea BORRAR un workspace — la carpeta
 * donde el turno escribe dejaría de existir; `remove_workspace` lo niega en el
 * backend y aquí no se ofrece un clic que va a fallar.
 */
export function createWorkspaces() {
  const [lista, setLista] = createSignal<Workspace[] | null>(null);
  const order = createNavigationOrder(() => "workspaces.order");
  const orderedList = createMemo(() => {
    const items = lista();
    return items === null ? null : order.arrange(items);
  });
  const [activo, setActivo] = createSignal<string | null>(null);
  const [cargando, setCargando] = createSignal(true);
  const [fallo, setFallo] = createSignal<Failure | null>(null);
  // Cuántas sesiones están contestando. Lo emite la pantalla del chat; aquí
  // solo decide no ofrecer el borrado.
  const [turnosVivos, setTurnosVivos] = createSignal(0);

  async function cargar() {
    setCargando(true);
    try {
      const a = await pedirEspacios();
      setLista(a.workspaces);
      setActivo(a.active);
      setFallo(null);
    } catch (e) {
      // Cargando, vacío y error son tres estados distintos: «vacío» es el
      // primer arranque, no un fallo.
      setLista(null);
      setFallo(asFailure(e));
    } finally {
      setCargando(false);
    }
  }

  onMount(() => {
    void cargar();

    // Los montajes existen a la vez —la columna, el riel y el panel abierto—,
    // así que cambiar en uno tiene que verse en el otro sin recargar nada.
    const alMudar = () => void cargar();
    window.addEventListener("harness:workspace", alMudar);
    window.addEventListener("harness:workspace-name", alMudar);
    onCleanup(() => {
      window.removeEventListener("harness:workspace", alMudar);
      window.removeEventListener("harness:workspace-name", alMudar);
    });

    const alTurno = (e: Event) =>
      setTurnosVivos((e as CustomEvent<number>).detail ?? 0);
    window.addEventListener("harness:turn", alTurno);
    onCleanup(() => window.removeEventListener("harness:turn", alTurno));
  });

  async function cambiarA(id: string) {
    if (id === activo()) return;
    try {
      await invoke("set_active_workspace", { id });
      // Una lista pedida antes del cambio trae el anterior como activo; los
      // demás montajes la heredarían y un clic de vuelta a él no haría nada.
      enVuelo = null;
      setActivo(id);
      setFallo(null);
      anunciarMudanza();
    } catch (e) {
      setFallo(asFailure(e));
    }
  }

  /** Por qué no se puede borrar ahora mismo, o `null` si sí se puede. */
  const bloqueado = () => {
    const n = turnosVivos();
    return n > 0
      ? t("settings.workspaces.blocked", { count: n })
      : null;
  };

  return {
    lista: orderedList,
    reorder: order.save,
    activo,
    actual: () => lista()?.find((w) => w.id === activo()) ?? null,
    cargando,
    fallo,
    setFallo,
    cargar,
    cambiarA,
    turnosVivos,
    bloqueado,
  };
}

/**
 * Cierra un menú con Escape antes que quien esté detrás. Se escucha en fase de
 * captura para llegar antes que la hoja de Configuración; si no, Esc cierra la
 * hoja entera en vez del menú. El clic fuera lo maneja el popover.
 */
export function cerrarConEscape(abierto: () => boolean, cerrar: () => void) {
  createEffect(
    on(abierto, (a) => {
      if (!a) return;
      const tecla = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          cerrar();
        }
      };
      window.addEventListener("keydown", tecla, true);
      onCleanup(() => window.removeEventListener("keydown", tecla, true));
    }),
  );
}
