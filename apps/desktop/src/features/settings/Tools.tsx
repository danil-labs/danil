import { For, Show, Suspense, createSignal, lazy, onCleanup, onMount } from "solid-js";
import { SignalDot } from "../../ui/SignalDot";
import { listen } from "../../lib/serviceEvents";
import { invoke } from "../../lib/invoke.ts";
import { Button } from "../../ui/Button";
import { Textarea } from "../../ui/Textarea";
import { FailureNote, asFailure, type Failure } from "../../ui/Failure";
import { cn } from "../../lib/utils";
import { MarcaProveedor, McpMark } from "../../ui/icons";
import { MarcaServicio } from "../../ui/marcas";
import { toolMarkId } from "@terminus/design";
import { t } from "../../lib/i18n";
import { prosa, type Frase } from "../../lib/prose";
import { ITEM_DE_MENU, Popover, PopoverContent, PopoverTrigger } from "../../ui/Popover";
import { Badge } from "../../ui/Badge";
import { lockedBy } from "../../lib/governance";
import { GovernedNotice } from "./Governed";

// Fuera de la carga inicial: este archivo también da el vistazo del riel.
const CredentialsInUse = lazy(() => import("./credentials/AccountCredentials").then((m) => ({ default: m.CredentialsInUse })));
const LocalKeysBanner = lazy(() => import("./credentials/AccountCredentials").then((m) => ({ default: m.LocalKeysBanner })));
import {
  mcpLoginUrl,
  mcpPendingSignIn,
  mcpSignIn,
  mcpSignInFailure,
  mcpSignInState,
} from "../chat/McpSignInNotice";

/**
 * Conectar una herramienta al agente: Figma, Jira, Confluence.
 *
 * Un botón, no un JSON: pedir copiar el bloque `mcpServers` de una página de
 * documentación es pedirle a quien opera el negocio que programe. Lo
 * conectable sale de `mcp::CONOCIDOS`, tabla del backend.
 *
 * Conectar no es autenticar: pulsar declara el servidor, y la sesión la pide
 * el propio agente la primera vez que usa la herramienta. La app no limita lo
 * que la herramienta puede hacer — motivo entero en `runtime/mcp.rs`.
 *
 * Reglas de la pantalla:
 *
 * - Un chip por fila es el estado entero (`estado`); lo que no puede decir va
 *   debajo, no en prosa que repita el chip.
 * - Tarjeta con la forma de `Fuente`: nombre, chip y acción a la derecha,
 *   detalle debajo en gris. Misma fila que Contexto principal.
 * - Conectar va `secondary`, no `primary`: no es una acción del agente.
 * - Un servicio por tarjeta, no un camino por tarjeta: `connect_known_mcp`
 *   borra a los hermanos del grupo. Con dos puestos el agente abre las dos
 *   conexiones en cada turno, y la que no escucha mata el turno entero.
 * - Lo apagado no es lo más llamativo: la advertencia del local que no
 *   responde va en ámbar solo cuando está conectado, cuando el daño ocurre.
 */

type Conocido = {
  id: string;
  /** El servicio al que pertenece. Dos entradas del mismo grupo son dos formas
   *  de llegar a lo mismo, no dos servicios. */
  grupo: string;
  /** Con qué nombre queda declarado en `mcp.json`. Es la misma clave que trae
   *  `Puesto.name`, y es lo que separa «un conocido» de «pegado a mano» sin
   *  mantener esa lista dos veces — ver `aMano`. */
  clave: string;
  /** El servicio. Lo comparten las filas del mismo grupo: es el mismo Figma. */
  name: string;
  /**
   * Por qué camino se llega. `null` cuando el servicio tiene uno solo. Los
   * tres son claves, no frases: las elige `mcp::CONOCIDOS` y las traduce
   * quien pinta (`lib/prose.ts`).
   */
  via: Frase | null;
  requiere: Frase | null;
  despues: Frase;
  /** Si el servidor exige iniciar sesión. Sin ella no se ofrece ningún inicio. */
  pide_sesion: boolean;
  conectado: boolean;
  /** Solo los locales: si hay algo escuchando. Ausente = no aplica. */
  escuchando?: boolean;
  /** Qué agentes ya tienen sesión con este servidor. Ver `mcp::sesiones_con`. */
  sesiones?: string[];
};

/**
 * Un servidor ya declarado. `detalle` es dato de máquina —la URL o el comando
 * de donde sale— y no pasa por el catálogo. Vacío es que el bloque no lo
 * declara; el backend manda el dato, no la prosa.
 */
type Puesto = { name: string; detalle: string; managed?: boolean };

/** Un agente y si de verdad recibe lo que se conecta aquí. */
type AgenteMcp = {
  id: string;
  label: string;
  recibe: boolean;
  /** Si su CLI está en esta computadora. Distinto de `recibe`. */
  instalado: boolean;
  falta?: string;
  /** Si este CLI necesita un inicio de sesión aparte por servidor. */
  login?: boolean;
  /** Cuando no lo tiene, qué clase de «no». Ver `agents::SesionMcp`. */
  sin_login?: Frase;
};

/**
 * Los remotos con cuenta los autoriza el motor, una vez para todos los agentes
 * (`mcp_oauth`): una sola sesión, sin filas por agente. Solo los locales traen
 * `escuchando`.
 */
const autorizaElMotor = (c: Conocido) => c.pide_sesion && c.escuchando === undefined;

/** La clave de `enCurso` del inicio de sesión del motor, que no es de ningún agente. */
const MOTOR = "motor";

/**
 * El estado de un servidor en una palabra y un color, para ver de un vistazo.
 * Las clases son las del sistema —`tag`, `tag puesto`, `tag pendiente`, `tag
 * repo`, `tag falta`—: verde significa lo mismo aquí que en Proveedores.
 *
 * `conectado` y `listo` son dos cosas, y el chip las separa: es la distinción
 * que `runtime/mcp.rs` defiende en su enum `Salud` — declararlo hace el botón, y
 * contestar el saludo de MCP dice «Probar conexión». Pintar de verde lo
 * declarado afirmaría algo que solo sabe la capa de abajo.
 *
 * Cinco estados y cinco aspectos, para no obligar a leer la palabra: sin
 * conectar es gris hueco, conectado es gris relleno (los dos son «no hay nada
 * que hacer», y se separan con el tono `active` de `Badge` — ámbar en
 * conectado le pondría cara de problema al camino feliz); pide sesión es
 * ámbar («te toca algo»); listo es verde (comprobado y funcionando); no
 * responde es rojo, el único que es un fallo real — un servidor local muerto
 * rompe todos los turnos, no solo los suyos.
 */
function estado(
  c: Conocido,
  salud: string | undefined,
): { texto: string; tono: "neutral" | "active" | "success" | "warning" | "danger" } {
  if (!c.conectado)
    return { texto: t("settings.tools.state.disconnected"), tono: "neutral" };
  // Antes que el saludo: un local con la app cerrada no responde por un motivo
  // que la persona puede arreglar, y decirlo así lleva a la acción correcta.
  if (c.escuchando === false)
    return { texto: t("settings.tools.state.silent"), tono: "danger" };
  if (autorizaElMotor(c)) {
    if ((c.sesiones ?? []).length === 0)
      return { texto: t("settings.tools.state.needs_login"), tono: "warning" };
    if (salud && salud !== "listo" && salud !== "pide-sesion")
      return { texto: t("settings.tools.state.silent"), tono: "danger" };
    return { texto: t("settings.tools.state.connected"), tono: "success" };
  }
  if (salud === "listo")
    return { texto: t("settings.tools.state.ready"), tono: "success" };
  // «Pide sesión» lo pregunta la app, que no tiene credencial: un servidor de
  // OAuth contesta 401 siempre. Ese chip no podía ponerse verde ni después de
  // autorizar — decía la verdad del servidor y mentía sobre la persona.
  //
  // Con alguien ya autenticado, el chip dice que el servicio está listo para
  // trabajar, que es la pregunta que se hace quien lo mira. Quién falta por
  // autenticarse lo dice la fila de cada agente.
  if (salud === "pide-sesion")
    return (c.sesiones ?? []).length > 0
      ? { texto: t("settings.tools.state.ready"), tono: "success" }
      : { texto: t("settings.tools.state.needs_login"), tono: "warning" };
  if (salud) return { texto: t("settings.tools.state.silent"), tono: "danger" };
  return { texto: t("settings.tools.state.connected"), tono: "active" };
}

export default function Herramientas(props: { solo?: string | string[] }) {
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
      const m = await invoke<Frase>("mcp_login", { provider, id: servicioId });
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
      await invoke("mcp_logout", { provider: agentId, id: servicioId });
    } catch (e) {
      setFallo(asFailure(e));
    }
    await cargar();
  }

  async function cargar() {
    try {
      const [c, p, a] = await Promise.all([
        invoke<Conocido[]>("list_known_mcp"),
        invoke<Puesto[]>("list_mcp_servers"),
        invoke<AgenteMcp[]>("list_mcp_providers"),
      ]);
      setConocidos(c);
      setPuestos(p);
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
        await invoke("disconnect_known_mcp", { id: c.id });
      } else {
        await invoke("connect_known_mcp", { id: c.id });
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
      const rs = await invoke<[string, string][]>("check_mcp");
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

  return (
    // Cada cuadrícula acota su columna, igual que `SettingsPanel`.
    <div class="grid grid-cols-[minmax(0,1fr)] gap-5">
      <GovernedNotice section="mcp_servers" />
      <section class="grid grid-cols-[minmax(0,1fr)] gap-2">
        {/* Una línea, solo de lo que está en esta máquina: nombrar lo que no
            está no ayuda a nadie, para eso está el riel, que ya lo marca.
            Solo importa a qué llega lo que conectes.

            Un chip por agente: siete nombres unidos por «y» no se leían de
            un vistazo.

            Encabeza la sección sin título encima: el renglón activo del riel
            ya nombra esta pantalla, y repetirlo arriba es el rótulo
            redundante que el sistema visual descarta. */}
        <Show when={instalados().length > 0}>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-xs text-neutral-500">
              <span>{t("settings.tools.reaches")}</span>
              <Show
                when={reciben().length > 0}
                fallback={<span class="font-medium text-neutral-950">{t("settings.tools.nobody")}</span>}
              >
                <For each={reciben()}>{(a) => <Badge tone="active">{a.label}</Badge>}</For>
              </Show>
              {/* Juntos, para que el rótulo no quede huérfano al partir. */}
              <Show when={noReciben().length > 0}>
                <span class="ml-1.5 flex flex-wrap items-center gap-1.5">
                  <span>{t("settings.tools.not_yet")}</span>
                  <For each={noReciben()}>{(a) => <Badge>{a.label}</Badge>}</For>
                </span>
              </Show>
            </div>
            <Show when={puestos().length > 0}>
              <Button
                variant="ghost"
                size="sm"
                class="shrink-0"
                disabled={probando()}
                onClick={() => void probar()}
              >
                {probando()
                  ? t("settings.tools.testing")
                  : t("settings.tools.test")}
              </Button>
            </Show>
          </div>
        </Show>

        <ul class="m-0 grid list-none grid-cols-[minmax(0,1fr)] gap-2 p-0">
          <For each={servicios()}>
            {(formas) => {
              /** El camino del que habla la tarjeta. Ver `activaDe`. */
              const c = () => activaDe(formas);
              const chip = () => estado(c(), salud()[c().id]);
              /** Un local con la app cerrada. `undefined` en los remotos. */
              const muerta = () => c().escuchando === false;
              /** Con la sesión del motor la tarjeta dice «conectado» y nada más. */
              const listaYa = () => autorizaElMotor(c()) && c().conectado && (c().sesiones ?? []).length > 0;
              const requiere = () => (listaYa() ? null : c().requiere);
              const despues = () => c().conectado && !listaYa();

              return (
                <li class="grid grid-cols-[minmax(0,1fr)] gap-1.5 rounded-md border border-border bg-surface-raised px-3 py-2.5">
                  {/* En angosto, chip y botón bajan de renglón. */}
                  <div class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                    {/* El servicio, una vez. Las filas del grupo comparten
                        `name` — el camino lo dice el control de abajo. */}
                    {/* Base propia, no `flex-1`: con base cero el nombre se
                        encogía hasta «F…» en vez de bajar el chip. */}
                    <span class="flex min-w-0 flex-[1_1_10rem] items-center gap-2 text-ui font-semibold">
                      <MarcaProveedor id={formas[0].grupo} size={16} />
                      <span class="truncate">{formas[0].name}</span>
                    </span>
                    {/* `active` rellena con `neutral-200`, el color de la
                        tarjeta en oscuro: «conectado» se quedaba sin chip. */}
                    <Badge
                      tone={chip().tono}
                      class={cn("shrink-0", chip().tono === "active" && "bg-neutral-300")}
                    >
                      {chip().texto}
                    </Badge>
                    {/* Sin sesión del motor, iniciarla es lo que falta. Mientras
                        dura se puede abrir la página si el navegador no se
                        abrió solo, o cancelar. */}
                    <Show when={autorizaElMotor(c()) && c().conectado && (c().sesiones ?? []).length === 0}>
                      <Show
                        when={enCurso().has(claveLogin(MOTOR, c().id))}
                        fallback={
                          <Button
                            variant="secondary"
                            size="sm"
                            class="shrink-0"
                            onClick={() => void iniciarSesion(MOTOR, c().id)}
                          >
                            {t("settings.tools.login")}
                          </Button>
                        }
                      >
                        <span class="flex shrink-0 items-center gap-1">
                          <Show
                            when={urlDeLogin()}
                            fallback={<span class="text-xs text-neutral-500">{t("settings.tools.opening")}</span>}
                          >
                            {(u) => (
                              <Button
                                variant="ghost"
                                size="sm"
                                class="px-2 text-xs"
                                onClick={() => void invoke("open_external", { target: u() })}
                              >
                                {t("settings.tools.open_login")}
                              </Button>
                            )}
                          </Show>
                          <Button
                            variant="ghost"
                            size="sm"
                            class="px-2 text-xs text-neutral-500"
                            onClick={() => quitarEnCurso(claveLogin(MOTOR, c().id))}
                          >
                            {t("settings.tools.cancel_login")}
                          </Button>
                        </span>
                      </Show>
                    </Show>
                    {/* Ni conectar ni quitar son acciones del agente: ninguno
                        va en morado. La forma la da la jerarquía: conectar es
                        la acción de la fila y quitar es lo que se hace una
                        vez. */}
                    <Button
                      variant={c().conectado ? "ghost" : "secondary"}
                      size="sm"
                      class="shrink-0"
                      disabled={ocupado() === c().id || bloqueado()}
                      onClick={() => void conmutar(c())}
                    >
                      {/* El gerundio dice cuál de las dos cosas está
                          ocurriendo, sin mover la fila entera al pulsar. */}
                      {ocupado() === c().id
                        ? c().conectado
                          ? t("settings.tools.removing")
                          : t("settings.tools.connecting")
                        : c().conectado
                          ? t("settings.tools.remove")
                          : t("settings.tools.connect")}
                    </Button>
                  </div>

                  {/* La elección entre caminos, solo si hay más de uno: forma
                      de Apariencia en Contexto principal, son pocos y se
                      comparan de un vistazo. Dice sola lo que dos tarjetas no
                      podían — que es un servicio y elegir uno descarta el
                      otro. */}
                  <Show when={formas.length > 1}>
                    <div
                      role="radiogroup"
                      aria-label={t("settings.tools.how_to_connect", {
                        name: formas[0].name,
                      })}
                      class="inline-flex w-fit gap-0.5 rounded-md border border-border bg-surface-muted p-0.5"
                    >
                      <For each={formas}>
                        {(f) => (
                          <button
                            role="radio"
                            aria-checked={c().id === f.id}
                            disabled={ocupado() !== null || bloqueado()}
                            class={cn("rounded-sm px-2.5 py-1 text-xs text-neutral-500 disabled:pointer-events-none",
                              c().id === f.id
                                ? ["bg-neutral-200", "text-neutral-950", "shadow-sm"]
                                : "hover:bg-surface-raised",
                            )}
                            onClick={() => void elegir(formas, f)}
                          >
                            {f.via ? prosa(f.via) : ""}
                          </button>
                        )}
                      </For>
                    </div>
                  </Show>

                  {/* Qué hace falta antes de pulsar, y qué pasa después solo
                      cuando ya está conectado: antes sería una instrucción de
                      algo que no ha ocurrido.

                      Los dos en un bloque gris a 12 px, no a los 11 px de una
                      ruta: son frases, no metadatos, y la jerarquía la ponen
                      el nombre en negrita y el chip.

                      La advertencia del local muerto va aquí también mientras
                      no esté conectado, en gris: sin conectar no pasa nada, es
                      un requisito más, y en ámbar competiría con la tarjeta
                      que sí funciona. */}
                  <Show when={requiere() || despues() || muerta()}>
                    <div class="grid gap-1 text-xs text-neutral-500">
                      <Show when={requiere()}>
                        {(q) => <p class="m-0">{prosa(q())}</p>}
                      </Show>
                      <Show when={muerta() && !c().conectado}>
                        <p class="m-0">{t("settings.tools.dead_before")}</p>
                      </Show>
                      <Show when={despues()}>
                        <p class="m-0">{prosa(c().despues)}</p>
                      </Show>
                    </div>
                  </Show>

                  {/* Un servidor local que no responde rompe todos los
                      turnos, no solo los que hablan de él: el agente abre sus
                      conexiones al arrancar cada turno, y el transporte
                      muerto sale como error fatal.

                      En ámbar solo cuando está conectado, cuando el daño está
                      ocurriendo. Sin conectar la misma frase vive arriba, en
                      gris. */}
                  <Show when={muerta() && c().conectado}>
                    <p class="m-0 text-xs text-warning-strong">
                      {t("settings.tools.dead_now")}
                    </p>
                  </Show>

                  {/* Lo que contestó al hablarle en MCP ya está en el chip; aquí
                      solo queda lo que el chip no puede decir: qué mirar. */}
                  <Show
                    when={
                      c().conectado &&
                      !muerta() &&
                      salud()[c().id] &&
                      salud()[c().id] !== "listo" &&
                      salud()[c().id] !== "pide-sesion"
                    }
                  >
                    <p class="m-0 text-xs text-warning-strong">
                      {t("settings.tools.no_answer")}
                    </p>
                  </Show>

                  {/* La sesión es de Figma, no de Codex: una fila por agente,
                      qué toca hacer con cada uno — no un botón suelto que se
                      lea como si el servicio solo sirviera con ese agente.

                      Un turno no interactivo no puede abrir un navegador ni
                      esperar una aprobación: sin decirlo en su fila, la
                      herramienta no cargaba nunca y el agente contestaba que
                      el servidor estaba «registrado pero sin autorizar».
                      `claude mcp login` existe y funciona (`agents::McpLogin`).

                      El texto de reserva no es uno solo: sale de la tabla
                      (`sin_login`), con dos «no» distintos. En Grok y
                      Antigravity está medido que su CLI no ofrece ninguna
                      forma de autenticar —sirven los servidores locales y los
                      que llevan su credencial en la config, no los de OAuth—,
                      y eso no es un pendiente nuestro; «sin comprobar» sí lo
                      es.

                      Las dos filas pesan lo mismo: contestan la misma
                      pregunta, cómo se autentica cada agente, y las dos
                      dicen lo que va a pasar cuando el agente lo use. En
                      `ghost` el botón conserva el alto y el sitio de la fila
                      sin gritar. */}
                  <Show when={c().conectado && c().pide_sesion && !autorizaElMotor(c()) && reciben().length > 0}>
                    <div class="mt-0.5 grid gap-1 border-t border-border pt-2">
                      <p class="m-0 text-caption font-medium uppercase tracking-wide text-neutral-500">
                        {t("settings.tools.session")}
                      </p>
                      <For each={reciben()}>
                        {(a) => (
                          <div class="flex min-h-8 items-center gap-2">
                            <span class="min-w-0 flex-1 truncate text-xs">
                              {a.label}
                            </span>
                            <Show
                              when={a.login}
                              fallback={
                                <span class="min-w-0 text-right text-xs text-neutral-500">
                                  {a.sin_login
                                    ? prosa(a.sin_login)
                                    : t("settings.tools.login_unknown")}
                                </span>
                              }
                            >
                              {/* Mientras dura, se puede salir: si el
                                  navegador no se abre solo, la URL que
                                  imprimió el CLI se ofrece aquí, y cancelar
                                  devuelve la fila al momento — sin esto no
                                  hay forma de reintentar ni de saber a dónde
                                  ir. */}
              {/* Con sesión ya iniciada no se ofrece iniciarla otra vez: el
                  login vuelve a registrar el servidor, y registrar de cero
                  se lleva la credencial que había. */}
                              <Show
                                when={enCurso().has(claveLogin(a.id, c().id))}
                                fallback={
                                  <Show
                                    when={!(c().sesiones ?? []).includes(a.id)}
                                    fallback={
                                      <span class="flex shrink-0 items-center gap-1">
                                        <Badge tone="success">
                                          {t("settings.tools.session_on")}
                                        </Badge>
                                        {/* Cerrarla devuelve el botón de
                                            iniciar: es la única salida
                                            cuando la credencial caducó. */}
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          class="px-2 text-xs text-neutral-500"
                                          onClick={() =>
                                            void cerrarSesion(a.id, c().id)
                                          }
                                        >
                                          {t("settings.tools.logout")}
                                        </Button>
                                      </span>
                                    }
                                  >
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      class="shrink-0 px-2 text-xs"
                                      onClick={() => void iniciarSesion(a.id, c().id)}
                                    >
                                      {t("settings.tools.login")}
                                    </Button>
                                  </Show>
                                }
                              >
                                <span class="flex shrink-0 items-center gap-1">
                                  <Show
                                    when={urlDeLogin()}
                                    fallback={
                                      <span class="text-xs text-neutral-500">
                                        {t("settings.tools.opening")}
                                      </span>
                                    }
                                  >
                                    {(u) => (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        class="px-2 text-xs"
                                        onClick={() => {
                                          void invoke("open_external", { target: u() });
                                        }}
                                      >
                                        {t("settings.tools.open_login")}
                                      </Button>
                                    )}
                                  </Show>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    class="px-2 text-xs text-neutral-500"
                                    onClick={() => quitarEnCurso(claveLogin(a.id, c().id))}
                                  >
                                    {t("settings.tools.cancel_login")}
                                  </Button>
                                </span>
                              </Show>
                            </Show>
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>
                </li>
              );
            }}
          </For>
        </ul>
      </section>

      {/* La salida para lo que no está en la tabla. Va al final y cerrada:
          es el camino de quien sabe lo que hace, no el que se ofrece primero.

          Lleva nombre de sección: separa lo que la app sabe conectar de lo
          que puso alguien a mano — sin él el botón quedaba colgando debajo
          de la última tarjeta como si le perteneciera. */}
      <Show when={!props.solo}>
        <section class="grid grid-cols-[minmax(0,1fr)] gap-2">
          <div class="flex items-center justify-between gap-2">
            <h3 class="m-0 text-ui font-semibold">{t("settings.tools.others")}</h3>
            <Button
              variant="ghost"
              size="sm"
              class="shrink-0"
              disabled={bloqueado()}
              onClick={() => setPegando((v) => !v)}
            >
              {pegando()
                ? t("settings.tools.paste_cancel")
                : t("settings.tools.paste_open")}
            </Button>
          </div>

          <Show when={pegando()}>
            <div class="grid gap-2 rounded-md border border-border bg-surface-raised p-3">
              <p class="m-0 text-xs text-neutral-500">
                {t("settings.tools.paste_hint")}
              </p>
              <Textarea
                rows={4}
                class="font-mono text-caption"
                value={bloque()}
                onInput={(e) => setBloque(e.currentTarget.value)}
              />
              <div class="flex justify-end">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!bloque().trim()}
                  onClick={() =>
                    void invoke("add_mcp_servers", { bloque: bloque() })
                      .then(() => {
                        setBloque("");
                        setPegando(false);
                        return cargar();
                      })
                      .catch((e) => setFallo(asFailure(e)))
                  }
                >
                  {t("settings.tools.paste_add")}
                </Button>
              </div>
            </div>
          </Show>

          <Show when={aMano().length > 0}>
            <ul class="m-0 grid list-none grid-cols-[minmax(0,1fr)] gap-2 p-0">
              <For each={aMano()}>
                {(p) => (
                  <li class="flex items-center gap-2 rounded-md border border-border bg-surface-raised px-3 py-2.5">
                    {/* Origen debajo del nombre: en su renglón, la URL
                        `shrink-0` ensanchaba la pantalla y sacaba «Quitar» de
                        la hoja. Lo que no cabe se corta; entera en `title`. */}
                    <span class="grid min-w-0 flex-1 gap-0.5">
                      <span class="truncate text-ui font-semibold">{p.name}</span>
                      {/* De dónde sale, nunca su credencial. */}
                      <span
                        class="truncate font-mono text-caption text-neutral-500"
                        title={p.detalle || undefined}
                      >
                        {p.detalle || t("settings.tools.no_source")}
                      </span>
                    </span>
                    <Show when={p.managed}>
                      <Badge forma="dato" class="shrink-0">
                        {t("settings.tools.harness")}
                      </Badge>
                    </Show>
                    <Button
                      variant="ghost"
                      size="sm"
                      class="shrink-0"
                      disabled={p.managed || bloqueado()}
                      onClick={() =>
                        void invoke("remove_mcp_server", { name: p.name })
                          .then(cargar)
                          .catch((e) => setFallo(asFailure(e)))
                      }
                    >
                      {t("settings.tools.remove")}
                    </Button>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </section>
      </Show>

      <Show when={!props.solo}>
        <Suspense fallback={null}>
          <LocalKeysBanner kinds={["mcp_secret"]} />
          <CredentialsInUse kinds={["mcp_secret"]} title={t("danil.credentials.mcp_title")} />
        </Suspense>
      </Show>

      {/* Lo que contestó el inicio de sesión. Con caja y no como párrafo suelto:
          aparece al final de una lista de tarjetas y sin superficie propia se
          leía como el pie de la última. */}
      <Show when={aviso()}>
        {(m) => (
          <p class="m-0 rounded-md border border-border bg-surface-muted px-3 py-2 text-xs text-neutral-950">
            {m()}
          </p>
        )}
      </Show>
      <Show when={fallo()}>{(f) => <FailureNote f={f()} />}</Show>
    </div>
  );
}

// -------------------------------------------------------------- vistazo

/**
 * Qué MCP tiene conectados este workspace, de un vistazo desde el pie del
 * riel, al lado de `WorkspaceMenu` y no dentro de Configuración: esa pantalla
 * conecta y administra, y para «¿qué tiene puesto este cliente ahora mismo?»
 * era una puerta de más.
 *
 * Reusa `list_known_mcp` / `list_mcp_servers`, mismos datos que la pantalla
 * completa, y no llama a `check_mcp`: la comprobación en vivo es una
 * petición de red por servidor, y esto es un vistazo bajo demanda.
 *
 * No pinta verde nada: ese color es «se le habló en MCP y contestó»
 * (`estado`, arriba), y este vistazo nunca hace esa llamada. Un local sin
 * nada escuchando se marca en ámbar —dato gratis, un `connect_timeout` de
 * TCP—: un local muerto rompe todos los turnos de este workspace.
 *
 * Ícono chico siempre, sin variante con rótulo: va al lado de `WorkspaceMenu`
 * y del ícono de Configuración, a la misma altura; un botón del tamaño de
 * «Nueva tarea» pesaría como una acción, y esto es una consulta de estado.
 */
export function ConexionesMenu(props: {
  /** Abre Configuración en el panel de Conexiones. */
  onManage: () => void;
  /** El tamaño del disparador donde lo monten. */
  triggerClass?: string;
}) {
  const [conocidos, setConocidos] = createSignal<Conocido[]>([]);
  const [puestos, setPuestos] = createSignal<Puesto[]>([]);
  const [abierto, setAbierto] = createSignal(false);

  async function cargar() {
    try {
      const [c, p] = await Promise.all([
        invoke<Conocido[]>("list_known_mcp"),
        invoke<Puesto[]>("list_mcp_servers"),
      ]);
      setConocidos(c);
      setPuestos(p);
    } catch {
      // Un vistazo que no pudo cargar se queda vacío: la razón, si hay
      // alguna que decir, la explica la pantalla completa detrás de
      // «Administrar», que es la que ya sabe pintar un `Failure`.
    }
  }

  // Al montar, para que el punto del disparador no dependa de haber abierto el
  // panel una vez, y otra vez cada apertura: lo declarado pudo cambiar desde
  // Configuración mientras el riel seguía a la vista.
  onMount(() => void cargar());

  const conectados = () => conocidos().filter((c) => c.conectado);
  /** Igual que `aMano` de arriba: de `conocidos()`, no de una lista aparte. */
  const declaradas = () => new Set(conocidos().map((c) => c.clave));
  const manuales = () => puestos().filter((p) => !declaradas().has(p.name));
  const pendientes = () => new Set(mcpPendingSignIn().map((s) => s.name));
  /** Los que piden sesión y no aparecen en ninguna de las dos listas. */
  const sueltos = () => {
    const vistos = new Set([...conectados().map((c) => c.clave), ...manuales().map((p) => p.name)]);
    return mcpPendingSignIn().filter((s) => !vistos.has(s.name));
  };
  const total = () => conectados().length + manuales().length + sueltos().length;

  /**
   * Un renglón del menú. La dirección no se pinta: va en el `title`, a la
   * vista solo con el puntero encima. Si el servidor pide sesión, el renglón
   * entero es el botón que la inicia; el punto rojo solo lo señala.
   */
  const Renglon = (p: { name: string; label: string; marca?: string; detalle?: string; muerto?: boolean }) => {
    // Sin grupo (el CLI de Danil, uno pegado a mano) el nombre del servidor
    // sigue diciendo de qué servicio es; sin esto la fila queda sin marca.
    const marca = () => toolMarkId(p.marca ?? p.name);
    const pide = () => pendientes().has(p.name);
    const estado = () => mcpSignInState(p.name);
    const aviso = () => (estado() === "retry" ? t("mcp.task.sign_in_again") : t("mcp.task.sign_in"));
    const contenido = () => (
      <>
        <Show when={marca()}>{(id) => <MarcaServicio id={id()} size={14} />}</Show>
        <span class="min-w-0 flex-1 truncate">{p.label}</span>
      </>
    );
    return (
      <li>
        <Show
          when={pide()}
          fallback={
            <div class="flex min-h-8 items-center gap-2 px-2 py-1 text-ui" title={p.detalle || undefined}>
              {contenido()}
              {/* Ámbar si está muerto, verde si está puesto y sano. */}
              <SignalDot tone={p.muerto ? "warning" : "success"} title={p.muerto ? t("settings.tools.dead_now") : undefined} />
            </div>
          }
        >
          <button
            role="menuitem"
            class={cn(ITEM_DE_MENU, "flex min-h-8 items-center gap-2 py-1")}
            title={p.detalle ? `${aviso()} · ${p.detalle}` : aviso()}
            aria-label={`${aviso()}: ${p.label}`}
            onClick={() => {
              // Esperando al navegador: el clic vuelve a abrir la página, no
              // lanza otro login.
              if (estado() !== "waiting") return void mcpSignIn(p.name);
              const u = mcpLoginUrl();
              if (u) void invoke("open_external", { target: u });
            }}
          >
            {contenido()}
            <Show
              when={estado() === "waiting"}
              fallback={<SignalDot tone="error" />}
            >
              <span class="shrink-0 text-caption text-neutral-500">
                {mcpLoginUrl() ? t("settings.tools.open_login") : t("settings.tools.opening")}
              </span>
            </Show>
          </button>
        </Show>
      </li>
    );
  };

  return (
    <Popover
      open={abierto()}
      onOpenChange={(v) => {
        setAbierto(v);
        if (v) void cargar();
      }}
      placement="right-end"
      gutter={4}
    >
      <PopoverTrigger
        as={(p: object) => (
          <Button
            {...p}
            variant="ghost"
            size="icon"
            class={cn("relative size-7 shrink-0 text-neutral-500", props.triggerClass)}
            aria-haspopup="menu"
            aria-label={t("shell.sidebar.mcp.trigger")}
            title={t("shell.sidebar.mcp.trigger")}
          >
            <McpMark size={props.triggerClass ? 16 : 14} />
            {/* Sin contador: solo el punto, arriba, cuando alguno pide sesión. */}
            <Show when={pendientes().size > 0}>
              <SignalDot tone="error" class="absolute top-0.5 right-0.5" />
            </Show>
          </Button>
        )}
      />

      <PopoverContent
        role="menu"
        class="grid w-[260px] grid-cols-[minmax(0,1fr)] gap-0.5 p-1"
        // Mismo motivo que en `WorkspaceMenu`: con una lista variable el
        // primer renglón no es fiable como «el que importa»; nada se enfoca
        // solo al abrir.
        onOpenAutoFocus={(e: Event) => e.preventDefault()}
      >
        <Show
          when={total() > 0}
          fallback={
            <p class="m-0 px-2 py-1.5 text-xs text-neutral-500">
              {t("shell.sidebar.mcp.empty")}
            </p>
          }
        >
          <ul class="m-0 grid min-w-0 list-none gap-0.5 p-0">
            <For each={conectados()}>
              {(c) => (
                <Renglon
                  name={c.clave}
                  label={c.name}
                  marca={c.grupo}
                  detalle={puestos().find((p) => p.name === c.clave)?.detalle}
                  muerto={c.escuchando === false}
                />
              )}
            </For>
            <For each={manuales()}>
              {(p) => <Renglon name={p.name} label={p.name} detalle={p.detalle || t("settings.tools.no_source")} />}
            </For>
            <For each={sueltos()}>{(p) => <Renglon name={p.name} label={p.name} />}</For>
          </ul>
        </Show>
        <Show when={mcpSignInFailure()}>{(f) => <FailureNote f={f()} />}</Show>

        <span class="my-1 h-px bg-border" />
        <button
          role="menuitem"
          class={ITEM_DE_MENU}
          onClick={() => {
            setAbierto(false);
            props.onManage();
          }}
        >
          {t("shell.sidebar.mcp.manage")}
        </button>
      </PopoverContent>
    </Popover>
  );
}
