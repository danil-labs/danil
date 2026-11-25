import { createSignal, onCleanup, onMount } from "solid-js";
import { listen } from "../../../../host/src/serviceEvents.ts";
import { checkMcp, connectKnownMcp, disconnectKnownMcp, listKnownMcp, listMcpProviders, listMcpServers, mcpLogin, mcpLogout } from "../queries/engine-mcp";
import { asFailure, type Failure } from "../../../../ui/src/Failure";
import { prosa, type Frase } from "../../../../ui/src/lib/prose";
import { lockedBy } from "../../../../session/src/governance";
import { type Conocido, type Puesto, type AgenteMcp, MOTOR, sinSecretos, autorizaElMotor } from "./ToolsModel";
import type Herramientas from "./ToolsView";

export function createHerramientas(props: Parameters<typeof Herramientas>[0]) {
  const [conocidos, setConocidos] = createSignal<Conocido[]>([]);
  const [puestos, setPuestos] = createSignal<Puesto[]>([]);
  const [ocupado, setOcupado] = createSignal<string | null>(null);
  const [fallo, setFallo] = createSignal<Failure | null>(null);
  const [aviso, setAviso] = createSignal<string | null>(null);
  const [agentes, setAgentes] = createSignal<AgenteMcp[]>([]);
  const [pegando, setPegando] = createSignal(false);
  /** Cómo contestó cada servidor cuando se le habló en MCP. */
  const [salud, setSalud] = createSignal<Record<string, string>>({});
  const [probando, setProbando] = createSignal(false);
  const [bloque, setBloque] = createSignal("");
  /**
   * Qué inicios de sesión están en curso, por fila (agente + servicio). No
   * global: con varios agentes solo se bloquea el que se pulsó.
   *
   * Sin él se dispara varias veces: `mcp_login` abre el navegador, la fila no
   * cambia, y volver a pulsar sin verlo abre cuatro ventanas. El botón
   * deshabilitado mientras dura lo impide.
   */
  const [enCurso, setEnCurso] = createSignal<Set<string>>(new Set());
  /**
   * La dirección que imprimió el CLI del login en curso, si la dijo. Es la
   * salida cuando el navegador no se abre solo, que en Windows pasa: un
   * proceso lanzado sin consola no siempre lo consigue. Una sola y no por
   * fila: solo hay un login corriendo a la vez.
   */
  const [urlDeLogin, setUrlDeLogin] = createSignal<string | null>(null);
  /**
   * El tope por fila. Si cierra el navegador sin autorizar, `codex mcp login`
   * sigue esperando su callback y el evento `mcp` no llega: sin esto el botón
   * quedaría bloqueado para siempre. Pasado el plazo la fila vuelve a «Iniciar
   * sesión». Se limpian al desmontar y cuando el evento `mcp` resuelve antes.
   */
  const temporizadores = new Map<string, number>();
  const claveLogin = (agentId: string, servicioId: string) => `${agentId}:${servicioId}`;

  function quitarEnCurso(k: string) {
    const tope = temporizadores.get(k);
    if (tope !== undefined) {
      clearTimeout(tope);
      temporizadores.delete(k);
    }
    setEnCurso((s) => {
      const n = new Set(s);
      n.delete(k);
      return n;
    });
    setUrlDeLogin(null);
  }

  /**
   * Abre el inicio de sesión de un servidor con un agente, y marca la fila en
   * curso hasta que el proceso termine (evento `mcp`) o venza el tope.
   *
   * `mcp_login` vuelve en cuanto lanza el proceso, no cuando la persona
   * autoriza: el estado en curso no se quita al resolver la promesa, se quita
   * con el evento `mcp`, cuando el CLI cierra. Si la llamada falla, no hay
   * proceso que emita `mcp`, y ahí se limpia a mano.
   */
  async function iniciarSesion(agentId: string, servicioId: string) {
    const k = claveLogin(agentId, servicioId);
    setEnCurso((s) => new Set(s).add(k));
    setFallo(null);
    temporizadores.set(k, window.setTimeout(() => quitarEnCurso(k), 120_000));
    // La del motor no es de un agente: `provider` solo dice quién la pidió.
    const provider = agentId === MOTOR ? (reciben()[0]?.id ?? "") : agentId;
    try {
      const m = await mcpLogin<Frase>({ provider, id: servicioId });
      setAviso(prosa(m));
    } catch (e) {
      setFallo(asFailure(e));
      quitarEnCurso(k);
    }
  }

  /**
   * Cierra la sesión de un servidor en un agente. Sin esto, una credencial
   * caducada deja la fila diciendo «sesión iniciada» y sin nada que pulsar:
   * iniciarla otra vez se esconde a propósito, y no había otra salida.
   */
  async function cerrarSesion(agentId: string, servicioId: string) {
    setFallo(null);
    try {
      await mcpLogout({ provider: agentId, id: servicioId });
    } catch (e) {
      setFallo(asFailure(e));
    }
    await cargar();
  }

  async function cargar() {
    try {
      const [c, p, a] = await Promise.all([
        listKnownMcp<Conocido[]>(),
        listMcpServers<Puesto[]>(),
        listMcpProviders<AgenteMcp[]>(),
      ]);
      setConocidos(c);
      setPuestos(sinSecretos(p));
      setAgentes(a);
    } catch (e) {
      setFallo(asFailure(e));
    }
  }
  onMount(() => {
    void cargar();
    // El backend avisa cuando un inicio de sesión termina, y se vuelve a
    // preguntar cómo quedó en vez de creerse que salió bien: sin esto la
    // tarjeta seguiría diciendo «pide sesión» después de autorizar.
    // El nombre va como literal: `scripts/guards/bridge.mjs` solo sabe leer
    // literales en el sitio de la llamada.
    const dice = listen<string>("mcp-login", (e) => setUrlDeLogin(e.payload));
    onCleanup(() => void dice.then((f) => f()));

    const fin = listen("mcp", () => {
      // Un login terminó (el CLI cerró su salida). El evento no dice cuál:
      // se limpian todas las filas en curso. Reactivar de más solo vuelve a
      // ofrecer «Iniciar sesión», nunca deja una colgada.
      for (const k of Array.from(enCurso())) quitarEnCurso(k);
      void cargar();
      void probar();
    });
    onCleanup(() => {
      void fin.then((f) => f());
      // Los topes pendientes no pueden sobrevivir al desmontaje.
      for (const tope of temporizadores.values()) clearTimeout(tope);
    });
  });

  /**
   * Los de la tabla, filtrados si esta pantalla es la de un servicio
   * concreto. Por grupo y con igualdad exacta: con `startsWith` el filtro de
   * «figma» se llevaba también `figma-escritorio`. El grupo es el servicio;
   * el id es la forma de llegar.
   */
  const visibles = () => {
    const solo = props.solo
      ? Array.isArray(props.solo)
        ? props.solo
        : [props.solo]
      : null;
    return solo ? conocidos().filter((c) => solo.includes(c.grupo)) : conocidos();
  };

  /**
   * Un servicio por tarjeta, con sus caminos dentro. «Figma» y «Figma (app de
   * escritorio)» como tarjetas hermanas del mismo tamaño se leen como la
   * lista repetida, y son excluyentes de verdad: `connect_known_mcp` borra a
   * los hermanos del grupo al conectar. Los dos puestos abren las dos
   * conexiones en cada turno, y la que no escucha mata el turno con un error
   * fatal. Una tarjeta con una elección es la forma que el sistema ya usa
   * para «uno de estos», la misma de Apariencia en Contexto principal.
   *
   * Se agrupa conservando el orden de la tabla, no alfabético: `runtime/mcp.rs` pone
   * primero el camino que le sirve a cualquiera.
   */
  const servicios = () => {
    const out: Conocido[][] = [];
    const donde = new Map<string, number>();
    for (const c of visibles()) {
      const i = donde.get(c.grupo);
      if (i === undefined) {
        donde.set(c.grupo, out.length);
        out.push([c]);
      } else {
        out[i].push(c);
      }
    }
    return out;
  };

  /**
   * Qué camino mira la tarjeta cuando todavía no hay ninguno conectado. Vive
   * en el componente y no dentro de la tarjeta: `servicios()` construye
   * arreglos nuevos en cada carga, y un estado creado dentro del `For` se
   * perdería en cuanto alguien conecte algo. Clave por grupo, que es estable.
   */
  const [mirando, setMirando] = createSignal<Record<string, string>>({});

  /** El camino conectado del grupo, si hay alguno. Solo puede haber uno. */
  const conectadaDe = (formas: Conocido[]) => formas.find((f) => f.conectado);

  /**
   * El camino del que habla la tarjeta. Lo elegido a mano manda sobre lo
   * conectado, no al revés: al cambiar de camino hay una ida y vuelta al
   * backend, y mientras dura, lo conectado sigue siendo el viejo — preferirlo
   * dejaría el control saltando al que se acababa de abandonar. `mirando` no
   * se desincroniza: solo lo escribe un clic que además conecta ese mismo
   * camino. Sin nada elegido manda lo conectado, y si no hay nada,
   * el primero — en `runtime/mcp.rs`, el que le sirve a cualquiera.
   */
  const activaDe = (formas: Conocido[]) =>
    formas.find((f) => f.id === mirando()[formas[0].grupo]) ??
    conectadaDe(formas) ??
    formas[0];

  /**
   * Elegir un camino. Con algo conectado, elegir el otro cambia la conexión:
   * es lo que el control promete al dibujarse como una elección entre dos, y
   * lo que el backend hace de todos modos —conectar uno quita al hermano—.
   * Dejarlo solo «mirando» enseñaría un camino y tendría puesto el otro.
   */
  async function elegir(formas: Conocido[], f: Conocido) {
    setMirando((m) => ({ ...m, [f.grupo]: f.id }));
    const puesta = conectadaDe(formas);
    if (puesta && puesta.id !== f.id) await conmutar(f);
  }

  /**
   * Lo declarado a mano, sin corresponder a ningún conocido. Sigue saliendo:
   * es de quien lo puso, y esconderlo dejaría un servidor corriendo sin sitio
   * donde quitarlo.
   */
  const aMano = () => {
    // De `conocidos()`, no de una lista escrita aquí: una lista a mano
    // diverge de `mcp::CONOCIDOS` en cuanto el backend suma un servicio.
    const suyos = new Set(conocidos().map((c) => c.clave));
    return puestos().filter((p) => !suyos.has(p.name));
  };

  /**
   * Los dos nombres van escritos enteros, no en una variable: el guarda de
   * `scripts/comandos` lee el nombre tal cual en el sitio de la llamada.
   * Pasarlo por parámetro lo deja invisible y sin comprobar en las dos capas.
   */
  const bloqueado = () => lockedBy("mcp_servers") !== null;

  async function conmutar(c: Conocido) {
    setOcupado(c.id);
    setFallo(null);
    try {
      if (c.conectado) {
        // Quitar revoca también la sesión del motor: es la de todos los agentes.
        await disconnectKnownMcp({ id: c.id });
      } else {
        await connectKnownMcp({ id: c.id });
      }
      await cargar();
      // Conectar uno con cuenta abre ya su inicio de sesión: sin él no sirve.
      const ahora = conocidos().find((x) => x.id === c.id);
      if (!c.conectado && ahora && autorizaElMotor(ahora) && (ahora.sesiones ?? []).length === 0)
        void iniciarSesion(MOTOR, c.id);
    } catch (e) {
      setFallo(asFailure(e));
    } finally {
      setOcupado(null);
    }
  }

  /**
   * Le habla en MCP a lo conectado. A petición, no al abrir: cada
   * comprobación es una llamada a un servicio de terceros.
   */
  async function probar() {
    setProbando(true);
    try {
      const rs = await checkMcp<[string, string][]>();
      setSalud(Object.fromEntries(rs));
    } catch (e) {
      setFallo(asFailure(e));
    } finally {
      setProbando(false);
    }
  }

  /** Solo lo que está en esta máquina: el resto no le sirve a nadie aquí. */
  const instalados = () => agentes().filter((a) => a.instalado);
  const reciben = () => instalados().filter((a) => a.recibe);
  const noReciben = () => instalados().filter((a) => !a.recibe);
  return {
    instalados, reciben, noReciben, puestos, probando, probar, servicios, activaDe, salud, enCurso,
    claveLogin, iniciarSesion, urlDeLogin, quitarEnCurso, ocupado, bloqueado, conmutar, elegir,
    cerrarSesion, setBloque, setPegando, pegando, bloque, cargar, setFallo, aMano, aviso, fallo,
  };
}
