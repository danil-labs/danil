import { createEffect, createMemo, createSignal, on, onMount } from "solid-js";
import { invoke } from "../../../engine-client/src/client.ts";
import { copyText } from "../../../host/src/clipboard";
import { prosaDe } from "../../../ui/src/Failure";
import { type Cierre, HOT_CPU, type Puerto, type Puertos, type PuertosProps, type TaskProcess } from "./open-ports-types";

/** Lo que el panel sabe de los puertos y lo que hace con ellos: consultar, abrir, copiar y cerrar. */
export function createPuertos(props: PuertosProps) {
  const [datos, setDatos] = createSignal<Puertos | null>(null);
  const [abierto, setAbierto] = createSignal(false);
  const [externosAbiertos, setExternosAbiertos] = createSignal(false);
  const [consultando, setConsultando] = createSignal(false);
  /** El puerto que se está cerrando, por pid: la fila se bloquea sola. */
  const [cerrando, setCerrando] = createSignal<Record<number, boolean>>({});
  /** Lo que dijo el backend cuando no se pudo cerrar, en la fila que lo pidió. */
  const [fallo, setFallo] = createSignal<Record<number, string>>({});
  /** El puerto cuya dirección se acaba de copiar, para confirmarlo en su sitio. */
  const [copiado, setCopiado] = createSignal<string | null>(null);

  async function consultar() {
    setConsultando(true);
    try {
      setDatos(await invoke<Puertos>("list_ports"));
    } catch (e) {
      // Un fallo al preguntar no puede dejar el número de antes en pantalla
      // afirmando puertos que ya no se sabe si están. Y se dice por qué: un
      // panel vacío se lee como «no hay nada», que no es lo mismo.
      setDatos({ tareas: [], externos: [], aviso: prosaDe(e) });
    } finally {
      setConsultando(false);
    }
  }

  onMount(() => void consultar());

  // Al terminar el turno, no al empezarlo: lo que se busca es lo que dejó.
  createEffect(
    on(
      () => props.busy,
      (busy, antes) => {
        if (antes && !busy) void consultar();
      },
      { defer: true },
    ),
  );

  const mios = createMemo(
    () => datos()?.tareas.reduce((n, t) => n + t.puertos.length, 0) ?? 0,
  );
  const externos = createMemo(() => datos()?.externos.length ?? 0);
  const processes = createMemo(
    () => datos()?.tareas.reduce((n, t) => n + t.processes.length, 0) ?? 0,
  );
  // Un proceso de fondo que gasta un núcleo entero es lo que calienta la
  // máquina sin que nada lo diga: el disparador lo marca sin abrir el panel.
  const hot = createMemo(
    () => datos()?.tareas.some((t) => t.processes.some((p) => p.cpu_percent >= HOT_CPU)) ?? false,
  );

  async function abrir(p: Puerto) {
    // **Al navegador del sistema, que sigue sin ser lo mismo que «aquí».**
    // Navegar el webview de la app se la lleva entera —ese motivo no ha
    // cambiado, y es el de `Markdown.tsx` y `delivery/preview.rs`—; la tercera opción es
    // una capa nativa aparte (`src-tauri/src/environment/sites.rs`). Las dos conviven porque
    // no hacen lo mismo:
    // la de aquí no comparte la sesión de la persona, así que un panel que pide
    // login sigue queriendo su navegador.
    await invoke("open_external", { target: p.url }).catch(() => {});
  }

  async function copiar(p: Puerto) {
    try {
      await copyText(p.direccion);
      setCopiado(p.id);
      // Se limpia solo: un «copiado» que se queda puesto deja de significar
      // que **esto** se copió.
      setTimeout(() => setCopiado((v) => (v === p.id ? null : v)), 1400);
    } catch (e) {
      // Callarlo deja a quien pulsó creyendo que la dirección está copiada.
      setFallo((f) => ({ ...f, [p.pid]: prosaDe(e) }));
    }
  }

  async function cerrar(p: Puerto, session: string) {
    setCerrando((c) => ({ ...c, [p.pid]: true }));
    setFallo((f) => ({ ...f, [p.pid]: "" }));
    try {
      const r = await invoke<Cierre>("close_port", {
        session,
        pid: p.pid,
        puerto: p.puerto,
      });
      if (!r.cerrado) setFallo((f) => ({ ...f, [p.pid]: r.detalle }));
    } catch (e) {
      setFallo((f) => ({ ...f, [p.pid]: prosaDe(e) }));
    } finally {
      setCerrando((c) => ({ ...c, [p.pid]: false }));
      await consultar();
    }
  }

  async function stop(p: TaskProcess, session: string) {
    setCerrando((c) => ({ ...c, [p.pid]: true }));
    setFallo((f) => ({ ...f, [p.pid]: "" }));
    try {
      const r = await invoke<Cierre>("close_process", { session, pid: p.pid });
      if (!r.cerrado) setFallo((f) => ({ ...f, [p.pid]: r.detalle }));
    } catch (e) {
      setFallo((f) => ({ ...f, [p.pid]: prosaDe(e) }));
    } finally {
      setCerrando((c) => ({ ...c, [p.pid]: false }));
      await consultar();
    }
  }

  return {
    datos, abierto, setAbierto, externosAbiertos, setExternosAbiertos, consultando, cerrando, fallo, copiado,
    consultar, mios, externos, processes, hot, abrir, copiar, cerrar, stop,
  };
}

export type EstadoDePuertos = ReturnType<typeof createPuertos>;
