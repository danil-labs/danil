import { groupAccounts } from "@terminus/computers";
import Check from "lucide-solid/icons/check";
import ChevronRight from "lucide-solid/icons/chevron-right";
import Copy from "lucide-solid/icons/copy";
import Ellipsis from "lucide-solid/icons/ellipsis";
import ExternalLink from "lucide-solid/icons/external-link";
import RefreshCw from "lucide-solid/icons/refresh-cw";
import Trash2 from "lucide-solid/icons/trash-2";
import { createEffect, createMemo, createSignal, createUniqueId, For, type JSX, lazy, on, onCleanup, onMount, Show, Suspense, untrack } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { createCopied } from "../../lib/clipboard";
import { enfocar } from "../../lib/focus";
import { t } from "../../lib/i18n";
import { invoke } from "../../lib/invoke.ts";
import { revocada } from "../../lib/limits";
import { textoDeFalta } from "../../lib/no-space";
import { capabilities } from "../../lib/platform";
import { type Frase, prosa } from "../../lib/prose";
import { listen } from "../../lib/serviceEvents";
import { cn } from "../../lib/utils";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Dialog, DialogContent, DialogTitle } from "../../ui/Dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../ui/DropdownMenu";
import { detalleDe, type Failure, FailureNote, prosaDe } from "../../ui/Failure";
import { Input } from "../../ui/Input";
import { MarcaAgente } from "../../ui/icons";
import { Select } from "../../ui/Select";
import { Skeleton } from "../../ui/Skeleton";
import { Terminal, TerminalBody } from "../../ui/Terminal";
import { machineOf } from "../machines/store";
import AccountCard, { accountPresentation } from "./AccountCard";
import { accountKeyUrl } from "./account-auth";
import {
  type Account,
  type AccountList,
  type AccountStatus,
  type AgentOpt,
  createAccountLimit,
  type EnEspera,
  type LoginEvent,
} from "./accounts-store";
import ListaDeModelosLocales from "./LocalModels";
import { LoginCodeForm } from "./LoginCodeForm";
import { SettingsBlock, SettingsRow, SettingsSection } from "./layout";
import { crearModelosLocales } from "./local-models-store";
import { Spinner } from "../../ui/Spinner";
import { ExternalLink as EnlaceExterno } from "../../ui/ExternalLink";
import "../../locales/settingsPhrases";

// Las claves en la cuenta de Danil: un trozo aparte, solo para agentes con API key.
const CredentialsInUse = lazy(() => import("./credentials/AccountCredentials").then((m) => ({ default: m.CredentialsInUse })));
const LocalKeysBanner = lazy(() => import("./credentials/AccountCredentials").then((m) => ({ default: m.LocalKeysBanner })));

/**
 * "Conectar", no "iniciar sesión": la app no inicia ninguna sesión —lo hace
 * el CLI, en su carpeta— y decir lo contrario prometería que la credencial
 * pasa por aquí.
 *
 * La Terminal es recuperación, no una pregunta: un CLI sin TTY puede no
 * imprimir la URL, o sacar un menú y quedarse esperando una tecla, y la
 * conexión se cuelga sin decir nada. Se ofrece cuando el fallo está
 * ocurriendo, no antes. Los dos caminos escriben en la misma carpeta:
 * `spawn_terminal` abre la Terminal con la variable de entorno ya puesta.
 */
/** Cuánto se espera a que el CLI diga algo antes de ofrecer la Terminal. */
const ESPERA_ANTES_DE_LA_TERMINAL_MS = 15_000;

/**
 * Vive dentro de la configuración: pregunta por los agentes y se queda con
 * el suyo.
 *
 * `agente` fija cuál y quita el selector interno; lo usa la navegación de
 * `Settings.tsx`, donde cada agente es un destino propio. Sin la prop elige
 * el primero disponible.
 *
 * `enAlta` es el primer arranque: la cuenta se acaba de crear y los
 * controles de gobierno viven en Configuración.
 *
 * `soloGratuitos` monta únicamente la activación, sin la lista de cuentas:
 * con qué clave trabajas y que tu material salga de la máquina son dos
 * decisiones distintas.
 */
export default function Accounts(props: {
  agente?: string;
  enAlta?: boolean;
  soloGratuitos?: boolean;
  /** Con título, las filas van en su propia sección y «Agregar cuenta» a su derecha. */
  titulo?: string;
  /** La línea debajo del título. */
  subtitulo?: string;
  /** El nombre de la fila cuando no hay cuentas, o el de la activación. */
  nombre?: string;
  /** Lo que le falta a la superficie, junto al título o al nombre. */
  marca?: JSX.Element;
  /** Las filas de las otras superficies del mismo proveedor, al final de la sección. */
  children?: JSX.Element;
  /** Con título, si la sección llega desplegada. Se lee al montar. */
  desplegado?: boolean;
}) {
  const [agentes, setAgentes] = createSignal<AgentOpt[]>([]);
  const [agente, setAgente] = createSignal(props.agente ?? "claude");
  const [lista, setLista] = createSignal<AccountList | null>(null);
  const [cargando, setCargando] = createSignal(true);
  const [estados, setEstados] = createSignal<Record<string, AccountStatus>>({});
  const agrupadas = createMemo<Account[]>(() => {
    const accounts = lista()?.accounts ?? [];
    if (!accounts.some((a) => a.machines?.length)) return accounts;
    const groups = groupAccounts(agente(), accounts.flatMap((a) => (a.machines ?? []).map((m) => ({
      machine: m.machine,
      on: m.on,
      accounts: [{ ...a, id: m.id, plan: accountPresentation(a, estados()[m.id]).plan }],
    }))));
    return groups.map((g) => ({ ...g.row, machines: g.members }));
  });
  // Cada tarjeta conserva su objeto por id: `For` las sigue por referencia, y
  // un objeto nuevo desmonta la tarjeta y vuelve a pedir su consumo. Sin esto,
  // cada `account_status` que contestaba (cambia `estados`, y con él el plan)
  // y cada refresco de la lista montaban todas las tarjetas desde cero.
  const [tarjetas, setTarjetas] = createStore<Account[]>([]);
  // Copia: `reconcile` escribe en los objetos que recibe, y son los de `lista()`.
  createEffect(() => setTarjetas(reconcile(structuredClone(agrupadas()), { key: "id" })));
  const [comprobando, setComprobando] = createSignal<Record<string, boolean>>({});
  // Las que la última consulta de estado no pudo responder. No es «sin
  // conectar» —nadie lo dijo— ni «conectada»: una cuenta cuyo `account_status`
  // se corta por plazo cada vez se veía conectada con un error encima.
  const [sinComprobar, setSinComprobar] = createSignal<Record<string, boolean>>({});
  const [fallo, setFallo] = createSignal<Failure | null>(null);
  // Quitar borra la credencial y no se puede deshacer: el primer clic pregunta.
  const [porQuitar, setPorQuitar] = createSignal<string | null>(null);
  const [esperando, setEsperando] = createSignal<EnEspera[]>([]);
  const [reponiendo, setReponiendo] = createSignal(false);
  const [repuestas, setRepuestas] = createSignal<number | null>(null);
  // Cuántas veces cambió el estado de cada cuenta desde fuera. Lo consume el
  // bloque de consumo: sin esto se queda diciendo «no está conectada» al lado
  // de la etiqueta `conectada`.
  const [conectadaVez, setConectadaVez] = createSignal<Record<string, number>>({});

  // Conexión en curso: qué cuenta, qué pasó, y si el agente espera un código.
  const [enCurso, setEnCurso] = createSignal<string | null>(null);
  /** Qué agente se está bajando ahora mismo. Su progreso va a la vista: bajar un
   *  CLI tarda, y sin decirlo la conexión parece colgada. */
  const [instalando, setInstalando] = createSignal<string | null>(null);
  const [url, setUrl] = createSignal<string | null>(null);
  // El fallo de copiar va dentro del diálogo: `FailureNote` queda detrás.
  const [copiaFallida, setCopiaFallida] = createSignal<string | null>(null);
  const { copied: enlaceCopiado, copy: copiarLaUrl, reset: olvidarEnlaceCopiado } = createCopied(1400, (e) => setCopiaFallida(prosaDe(e)));
  // El código que la página va a pedir. Se enseña ANTES de abrir el navegador:
  // llegar a «enter the code shown in your terminal» sin tenerlo delante es
  // donde la conexión se atasca.
  const [porConfirmar, setPorConfirmar] = createSignal<string | null>(null);
  const [pideCodigo, setPideCodigo] = createSignal(false);
  const [codigo, setCodigo] = createSignal("");
  const [salida, setSalida] = createSignal<string[]>([]);

  // Una conexión que terminó mal. No se cierra el panel al fallar: ahí está
  // el motivo que dijo el agente, y cerrarlo obliga a reintentar a ciegas.
  const [conexionFallida, setConexionFallida] = createSignal<{
    id: string;
    texto: string;
  } | null>(null);
  // Si el CLI no ha dicho nada en un rato, se ofrece la Terminal — ver arriba.
  const [ofrecerTerminal, setOfrecerTerminal] = createSignal(false);

  /**
   * `espera` y `recienCreada` son variables: nadie pinta sus valores, y una
   * señal añadiría dependencias reactivas sin consumidores. `espera` conserva
   * el temporizador que ofrece la Terminal; `recienCreada` relaciona el
   * siguiente evento de login con la cuenta que lo inició. `comprobadas`
   * sigue el mismo criterio.
   */
  let espera: number | null = null;
  let recienCreada: string | null = null;
  // A cuáles ya se les preguntó. Cambiarla no tiene que repintar nada, y en una
  // señal provocaría justo el render que vuelve a disparar la consulta.
  const comprobadas = new Set<string>();

  function cancelarEspera() {
    if (espera !== null) {
      clearTimeout(espera);
      espera = null;
    }
  }

  const proveedor = () => agentes().find((a) => a.id === agente());
  const terminalLocal = (id: string) => capabilities().nativeWindow && !machineOf(id);
  const externalInstallUrl = () => proveedor()?.external_install_url;
  const faltaExterno = () => !proveedor() || Boolean(externalInstallUrl()) && !proveedor()?.available;
  const [revisandoCli, setRevisandoCli] = createSignal(false);

  async function comprobarCli() {
    setRevisandoCli(true);
    try {
      await invoke("check_environment", { force: true });
      setAgentes(await invoke<AgentOpt[]>("list_providers"));
      setFallo(null);
    } catch (e) {
      setFallo({ what: t("settings.accounts.error.check_provider"), detail: detalleDe(e) });
    } finally {
      setRevisandoCli(false);
    }
  }

  const etiqueta = () =>
    agentes().find((a) => a.id === agente())?.label ?? t("settings.accounts.agent_fallback");

  /**
   * Dónde corre este agente, que es lo que decide qué se monta aquí dentro.
   *
   * Mientras la tabla no ha llegado no se monta nada: enseñar la superficie de
   * un agente que resulta ser de otra clase es peor que esperar un instante.
   */
  const inferencia = () => agentes().find((a) => a.id === agente())?.inferencia;

  // Nombrar un proveedor durante la preparación local atribuiría una salida de datos.
  const acto = () =>
    !proveedor()
      ? { boton: t("settings.accounts.check_provider"), curso: t("settings.accounts.preparing") }
      : inferencia() === "en_la_maquina"
      ? {
          boton: t("settings.accounts.local_models.prepare"),
          curso: t("settings.accounts.preparing"),
        }
      : {
          boton: externalInstallUrl() ? t("settings.accounts.official_download", { agent: etiqueta() }) : t("settings.accounts.install_agent", { agent: etiqueta() }),
          curso: t("settings.accounts.installing_agent", { agent: etiqueta() }),
        };

  /**
   * Por qué este agente no tiene cuentas, cuando no las tiene. Lo contesta
   * la tabla (`runtime/agents/`): un modelo que corre en la máquina no lleva
   * suscripción, sin alta que ofrecer ni credencial que aislar. Montar la
   * lista vacía diría lo contrario: que todavía no has conectado ninguna.
   */
  const sinCuenta = () =>
    agentes().find((a) => a.id === agente())?.sin_cuenta ?? false;

  /**
   * Dónde se consigue la API key de este agente, o `null` si se conecta
   * lanzando su CLI. La política compartida contempla OpenCode 2.
   */
  const claveDe = () => agentes().find((a) => a.id === agente())?.api_key;

  /** La cuenta cuya clave se está pidiendo, y lo escrito hasta ahora. */
  const [pidiendoClave, setPidiendoClave] = createSignal<string | null>(null);
  const [clave, setClave] = createSignal("");
  const [guardandoClave, setGuardandoClave] = createSignal(false);
  const [pidiendoClaveGo, setPidiendoClaveGo] = createSignal<string | null>(null);
  const [claveGo, setClaveGo] = createSignal("");
  const [guardandoClaveGo, setGuardandoClaveGo] = createSignal(false);

  async function guardarClaveGo() {
    const id = pidiendoClaveGo();
    if (!id) return;
    setGuardandoClaveGo(true);
    try {
      await invoke("set_go_usage_key", { provider: agente(), id, key: claveGo() }, machineOf(id));
      setPidiendoClaveGo(null);
      setClaveGo("");
      setConectadaVez((c) => ({ ...c, [id]: (c[id] ?? 0) + 1 }));
    } catch (e) {
      setFallo({ what: t("settings.accounts.go_key_error"), detail: detalleDe(e) });
    } finally {
      setGuardandoClaveGo(false);
    }
  }

  async function guardarClave() {
    const id = pidiendoClave();
    if (!id || !clave().trim()) return;
    setGuardandoClave(true);
    try {
      await invoke("set_api_key", { provider: agente(), id, key: clave() }, machineOf(id));
      setPidiendoClave(null);
      // No se conserva ni un instante más de lo necesario: ya está en el
      // llavero, y dejarla en una señal la mantendría en memoria sin uso.
      setClave("");
      await refrescar();
      // Y se vuelve a sondear: `refrescar` trae la lista, pero el estado de
      // cada fila lo pone `account_status`, y el efecto que lo pide salta las
      // ya comprobadas. Sin esto, la cuenta que acaba de recibir su clave
      // dice «sin conectar» hasta cerrar y reabrir Configuración.
      comprobadas.delete(id);
      await comprobar(id);
    } catch (e) {
      setFallo({ what: t("settings.accounts.error.save_key"), detail: detalleDe(e) });
    } finally {
      setGuardandoClave(false);
    }
  }

  onMount(() => {
    invoke<AgentOpt[]>("list_providers")
      .then((a) => {
        setAgentes(a);
        if (props.agente) return;
        const primero = a.find((x) => x.available);
        if (primero) setAgente(primero.id);
      })
      .catch((e) => setFallo({ what: t("settings.accounts.error.check_provider"), detail: detalleDe(e) }));
  });

  /**
   * Instala el CLI de este agente y deja la pantalla al día.
   *
   * Vale para los dos sitios donde hace falta: el que se conecta lo llama
   * desde `conectar` antes del login, y el que no tiene cuenta lo llama desde
   * su botón. Es el mismo `install_provider`, y las dos filas de OpenCode
   * comparten paquete y carpeta (`agents::Install::carpeta`): instalar desde
   * cualquiera deja a las dos utilizables.
   */
  async function instalarCli() {
    if (!proveedor()) { await comprobarCli(); return; }
    setInstalando(agente());
    try {
      const external = externalInstallUrl();
      if (external) {
        await invoke("open_external", { target: external });
        setFallo(null);
        return;
      }
      await invoke("install_provider", { provider: agente() });
      setAgentes(await invoke<AgentOpt[]>("list_providers"));
      setFallo(null);
    } catch (e) {
      const sinEspacio = await textoDeFalta(e, `provider:${agente()}`);
      setFallo(sinEspacio ? { what: sinEspacio, detail: "" } : { what: t("settings.accounts.error.install"), detail: detalleDe(e) });
    } finally {
      setInstalando(null);
    }
  }

  async function refrescar() {
    // El esqueleto es de la primera lectura. Después, la lista que ya se ve se
    // queda mientras llega la nueva: autenticar o quitar una cuenta no vuelve
    // a vaciar la sección, y cada tarjeta dice su propia carga.
    if (lista() === null) setCargando(true);
    try {
      setLista(await invoke<AccountList>("list_accounts", { provider: agente() }));
      setFallo(null);
      await mirarEspera();
    } catch (e) {
      // Cargando, vacío y error son tres pantallas distintas: dejar la lista
      // vacía haría que "todavía no agregaste cuentas" apareciera mintiendo.
      setLista(null);
      setFallo({ what: t("settings.accounts.error.list"), detail: detalleDe(e) });
    } finally {
      setCargando(false);
    }
  }

  // Cambiar de agente reinicia lo que era de la lista anterior. Con `on(...)`:
  // el cuerpo lee más señales de las que deben dispararlo.
  createEffect(
    on(agente, () => {
      setEstados({});
      setSinComprobar({});
      comprobadas.clear();
      setPorQuitar(null);
      // Las tarjetas del agente anterior no se quedan a la vista del nuevo.
      setLista(null);
      void refrescar();
    }),
  );

  /**
   * Preguntarle al CLI se hace solo: un estado que la app puede averiguar
   * sola no se le pide a quien la usa. Con un botón «comprobar», una cuenta
   * recién conectada se queda en «sin comprobar todavía» hasta que alguien
   * lo pulse.
   *
   * Van a la vez, y no bloquean: `account_status` corre en el hilo de la
   * ventana como comando síncrono de Tauri, y lanzarlas en paralelo
   * congelaría la interfaz el tiempo de todas juntas. Con el comando fuera
   * de ese hilo y con plazo propio (`secrets/accounts.rs`), la espera de cinco
   * cuentas es la de la más lenta, no la suma.
   *
   * No vale para `account_limits`, que sigue escalonado: eso pregunta al
   * proveedor por la red y cinco a la vez se ganan un 429 (`accounts.ts`).
   * Aquí se le pregunta al CLI de la máquina, que no limita nada.
   */
  createEffect(
    on(lista, (l) => {
      const pendientes = (l?.accounts ?? []).filter(
        // La que se está conectando, no: su CLI está vivo usando su carpeta
        // —y en Antigravity su llavero—, y preguntarle encima pelea con él
        // por lo mismo — el login salió con código 1 después de que la
        // persona ya había pegado su código. No se marca como comprobada:
        // en cuanto la conexión termine, esta misma lista la sondea.
        (a) => !comprobadas.has(a.id) && a.id !== enCurso(),
      );
      if (pendientes.length === 0) return;
      let vivo = true;
      onCleanup(() => {
        vivo = false;
      });
      // Se marcan antes de esperar: si no, la siguiente vuelta las encuentra
      // pendientes y se lanzan dos procesos por la misma cuenta.
      pendientes.forEach((a) => comprobadas.add(a.id));
      void Promise.all(
        pendientes.map(async (a) => {
          if (!vivo) return;
          await comprobar(a.id);
        }),
      );
    }),
  );

  /**
   * El oyente del login.
   *
   * El nombre va como cadena literal, no en una constante: `scripts/guards/bridge.mjs`
   * comprueba que alguien emita lo que la interfaz escucha, y solo sabe leer
   * literales.
   *
   * Se suscribe una vez. `agente()` y `enCurso()` se leen al recibir el
   * evento; conservar sus valores al montar mezclaría el login con el
   * agente anterior. La suscripción no se reinicia cuando cambia cualquiera
   * de los dos.
   */
  onMount(() => {
    const un = listen<LoginEvent>("account", (e) => {
      const { account, kind, text } = e.payload;

      // Solo la instancia que lanzó esta conexión.
      //
      // El evento es de la ventana entera, y esta pantalla no se monta una
      // vez: Configuración → Proveedores IA monta un `Accounts` por
      // superficie —hoy siete—, incluidas las de `<details>` cerrados, que
      // Solid dibuja igual. Un guarda como
      // `if (enCurso() && account !== enCurso())` solo separa cuentas dentro
      // de la instancia que ya está conectando: las otras seis, con su
      // `enCurso()` vacío, atenderían el evento ajeno — siete `open_external`
      // con la misma URL en `url`, y en `done`, seis `account_status` y seis
      // `discard_account` disparados sobre el id de otro.
      //
      // Sin conexión en curso no hay nada que atender, y no hay carrera:
      // `conectar` pone `enCurso` antes de invocar `login_account`, y ningún
      // evento propio puede llegar antes que él.
      if (account !== enCurso()) return;

      // Que el CLI diga algo —una URL, un código— es la señal de que sí
      // habla sin terminal: la espera que ofrece la Terminal deja de correr.
      if (kind === "url") {
        cancelarEspera();
        setUrl(text);
        // El navegador de la persona ya tiene su sesión; el webview no.
        invoke("open_external", { target: text }).catch(() => {});
        return;
      }
      if (kind === "confirm") {
        cancelarEspera();
        setPorConfirmar(text);
        return;
      }
      if (kind === "code") {
        cancelarEspera();
        setPideCodigo(true);
        return;
      }
      if (kind === "done") {
        cancelarEspera();
        setEnCurso(null);
        setPideCodigo(false);
        setPorConfirmar(null);
        if (text) {
          setSalida((s) => [...s, text]);
          setConexionFallida({ id: account, texto: text });
        }
        // El agente acaba de escribir (o no) la credencial: hay que volver a
        // preguntarle a él, que es el único que sabe. Lo mismo el consumo.
        //
        // Y releer la lista: `account_status` guarda el correo en disco, pero
        // quien lo pinta es la fila, dibujada con lo que trajo `list_accounts`.
        // Sin esto la cuenta recién conectada se queda llamándose «Cuenta 1»
        // hasta que alguien pulse «comprobar». `text` en el evento `done` es
        // el motivo cuando el login no salió limpio, y vacío cuando sí.
        void comprobar(account)
          .then(() => descartarSiVacia(account, Boolean(text)))
          .then(() => refrescar());
        // Y volver a pedir `list_providers`: conectar una cuenta instala el CLI
        // si faltaba, y sin esto el botón «Instalar» se quedaba pegado tras
        // conectar. El listener de `"providers"` cubre cuando la conexión
        // instaló algo; esta línea cierra el caso de un agente ya instalado.
        void invoke<AgentOpt[]>("list_providers").then(setAgentes).catch(() => {});
        setConectadaVez((c) => ({ ...c, [account]: (c[account] ?? 0) + 1 }));
        return;
      }
      // Codex abre el navegador él solo y su enlace llega como aviso, no
      // como `url`. Ofrecerle la Terminal lanzaba un segundo `codex login`
      // que cancela al primero por su puerto fijo: la pestaña ya abierta
      // volvía a `127.0.0.1:1455` y fallaba.
      if (/https:\/\//.test(text)) {
        cancelarEspera();
        setOfrecerTerminal(false);
      }
      setSalida((s) => [...s, text].slice(-12));
    });

    // Un turno de esta cuenta murió por su credencial: la ficha vuelve a
    // preguntar, y deja de decir «conectada» a una cuenta que no sirve.
    const rechazada = listen<string>("account-rejected", (e) => {
      if (lista()?.accounts.some((a) => a.id === e.payload)) void comprobar(e.payload);
    });

    onCleanup(() => {
      void un.then((f) => f());
      void rechazada.then((f) => f());
      cancelarEspera();
    });
  });

  /**
   * El oyente de los cambios de instalación.
   *
   * Instalar o quitar el CLI de un agente termina en un evento `"providers"`
   * (`runtime/agents/` · `aviso_de_cambio`), que además ya invalidó la caché de sondas.
   * Sin escucharlo, esta pantalla se quedaba con el «instalando…» hasta que
   * alguien la cerraba y la reabría: el estado no pasaba solo a instalado. Al
   * recibirlo se vuelve a pedir `list_providers`, que ya lee fresco, y así deja de
   * depender de remontar el componente.
   *
   * El nombre va como cadena literal por lo mismo que el del login:
   * `scripts/guards/bridge.mjs` comprueba que alguien lo emita y solo lee literales.
   */
  onMount(() => {
    const cambios = listen("providers", () => {
      void invoke<AgentOpt[]>("list_providers").then(setAgentes).catch(() => {});
    });
    onCleanup(() => void cambios.then((f) => f()));
  });

  /**
   * Devuelve lo que el CLI dijo, o `null` si no se pudo preguntar. Esa
   * diferencia decide si se borra una cuenta: «no está autenticada» y «no se
   * pudo averiguar» se ven igual en pantalla y son lo contrario a la hora de
   * tirar una carpeta.
   */
  async function comprobar(id: string): Promise<AccountStatus | null> {
    // Que se está preguntando se dice. Al dejar de ser un botón, la consulta
    // ocurre sola y puede tardar —en macOS pasa por el llavero, medido entre
    // 5 y 11 segundos (`runtime/limits.rs`)—: sin esto la fila se queda quieta y muda
    // justo después de conectarse, cuando más se mira.
    //
    // A la que se está conectando no se le pregunta, y el guarda va aquí: lo
    // tenía el efecto que sondea la lista, y ahí solo cubría a ese llamador.
    // `guardarClave` y el `done` del login entran por otro sitio. El backend
    // lo niega igual (`accounts::account_status`), pero su negativa llega
    // como una cadena cruda que esta pantalla pinta bajo «Revisa que esté
    // instalado»: un diagnóstico falso sobre un binario que sí está.
    //
    // En `done` el `enCurso` ya se limpió antes de llamar aquí: la
    // comprobación de después de conectar —la que trae el correo— sigue
    // corriendo.
    if (id === enCurso()) return null;
    setComprobando((c) => ({ ...c, [id]: true }));
    try {
      const st = await invoke<AccountStatus>("account_status", {
        provider: agente(),
        id,
      }, machineOf(id));
      setEstados((e) => ({ ...e, [id]: st }));
      setSinComprobar((c) => ({ ...c, [id]: false }));
      return st;
    } catch (e) {
      setSinComprobar((c) => ({ ...c, [id]: true }));
      setFallo({
        what: t("settings.accounts.error.status", { agent: etiqueta() }),
        detail: detalleDe(e),
      });
      return null;
    } finally {
      setComprobando((c) => ({ ...c, [id]: false }));
    }
  }

  /**
   * Tira el alta que no llegó a nada.
   *
   * Solo cuando el login terminó mal: que el CLI diga «no está autenticada»
   * no es de fiar. Preguntándole a Grok con el subcomando de Codex, que en
   * Grok no existe, una cuenta recién conectada se reporta vacía y el alta
   * la borra con el login dentro.
   *
   * El coste de los dos errores no es el mismo: conservar un alta vacía deja
   * una fila que se quita con un clic, y borrar una buena pierde una
   * autenticación que hay que rehacer, sin avisar. La señal que no depende
   * de acertar la sonda de cada CLI: si el proceso de login salió con error,
   * no hubo login.
   *
   * Solo la recién creada. El backend además se niega si esa cuenta se
   * autenticó alguna vez.
   */
  async function descartarSiVacia(id: string, hubaFallo: boolean) {
    if (recienCreada !== id || !hubaFallo) return;
    recienCreada = null;
    try {
      if (await invoke<boolean>("discard_account", { provider: agente(), id }, machineOf(id))) {
        await refrescar();
      }
    } catch {
      // Que no se pueda tirar no es un error que reportarle a nadie: la cuenta
      // se queda en la lista diciendo que no está conectada, y se borra a mano.
    }
  }

  async function agregar(options?: { headers: Record<string, string> }) {
    if (faltaExterno()) return;
    try {
      const a = await invoke<Account>("add_account", {
        provider: agente(),
        label: "",
      }, options);
      // Agregar crea la carpeta antes del login: ahí escribe el CLI la
      // credencial. Si el login no llega a nada, esto permite deshacerlo en
      // vez de dejar un objeto vacío en la lista.
      recienCreada = a.id;
      // Conectar va antes de refrescar, y ese orden es el arreglo.
      //
      // El efecto que sondea corre al llegar la lista y se salta la cuenta de
      // `enCurso()`. Con `refrescar()` delante ese guarda no puede acertar:
      // cuando la lista llega, `conectar` todavía no se ha llamado y
      // `enCurso()` está vacío, y la cuenta recién creada se sondea mientras
      // su CLI se está autenticando. `conectar` pone `enCurso` de forma
      // síncrona —el `if (claveDe())` de su cabecera no espera a nadie— y
      // deja el guarda puesto antes de que nadie mire la lista.
      //
      // En Antigravity el sondeo pelea con el login por la misma carpeta y
      // el mismo llavero: el login sale con código 1 después de que la
      // persona ya pegó su código, y el panel de conexión desaparece con un
      // «Revisa que esté instalado» en rojo sobre un binario que sí está.
      void conectar(a.id);
      await refrescar();
    } catch (e) {
      setFallo({ what: t("settings.accounts.error.create"), detail: detalleDe(e) });
    }
  }

  async function conectar(id: string, modo: "tuberia" | "terminal" = "tuberia") {
    if (faltaExterno()) { await instalarCli(); return; }
    // El que se conecta con una clave no lanza nada: su CLI la pide en una
    // interfaz de texto que necesita un terminal, y conducirla sería enseñar
    // ese menú crudo a quien no programa. OpenCode ya no entra por aquí: su
    // CLI 2 imprime una URL y se conduce como los demás.
    //
    // Se bifurca aquí y no en `agregar`: el alta, el botón de reconectar y
    // el reintento entran por el mismo sitio, y tres caminos a la misma
    // pantalla es donde se olvida uno.
    if (accountKeyUrl(agentes().find((a) => a.id === agente()))) {
      // Este camino también instala: sin esto, pegar la clave decía
      // «conectada» y dejaba la máquina sin su CLI, con el turno sin poder
      // arrancar.
      // Misma regla de `AGENTS.md` que ya cumplía el otro camino.
      //
      // Antes de pedir la clave y no después: si no se puede traer el
      // binario, no hay para qué pedirla.
      if (!agentes().find((a) => a.id === agente())?.available) {
        await instalarCli();
        if (fallo()) return;
      }
      setPidiendoClave(id);
      setClave("");
      return;
    }
    cancelarEspera();
    setEnCurso(id);
    setUrl(null);
    olvidarEnlaceCopiado();
    setCopiaFallida(null);
    setPorConfirmar(null);
    setPideCodigo(false);
    setCodigo("");
    setSalida([]);
    setConexionFallida(null);
    setOfrecerTerminal(false);
    try {
      // Si su CLI no está, se instala aquí y no se pregunta: instalar no es
      // una pregunta (`AGENTS.md`). Sin esto, en una máquina limpia conectar
      // Codex o Grok falla con «revisa que esté instalado», devolviéndole a
      // la persona justo lo que la app existe para resolver.
      if (!agentes().find((a) => a.id === agente())?.available) {
        await instalarCli();
      }
      await invoke("login_account", { provider: agente(), id, mode: modo }, machineOf(id));
      if (modo === "terminal") {
        // El login ocurre fuera de la app: no llega ningún evento aquí, y no
        // hay nada que esperar ni panel que sostener.
        setEnCurso(null);
        return;
      }
      espera = window.setTimeout(
        () => setOfrecerTerminal(true),
        ESPERA_ANTES_DE_LA_TERMINAL_MS,
      );
    } catch (e) {
      setEnCurso(null);
      const instalado = agentes().find((a) => a.id === agente())?.available;
      setFallo({
        what: instalado
          ? t("settings.accounts.error.start", { agent: etiqueta() })
          : t("settings.accounts.error.connect", { agent: etiqueta() }),
        detail: detalleDe(e),
      });
    }
  }

  async function copiarEnlace(u: string) {
    setCopiaFallida(null);
    await copiarLaUrl(u);
  }

  async function enviarCodigo() {
    const id = enCurso();
    if (!id || !codigo().trim()) return;
    try {
      await invoke("submit_login_code", { id, code: codigo() }, machineOf(id));
      setPideCodigo(false);
      setCodigo("");
    } catch (e) {
      setFallo({
        what: t("settings.accounts.error.code"),
        detail: detalleDe(e),
      });
    }
  }

  async function usar(id: string) {
    try {
      setRepuestas(null);
      await invoke("set_active_account", { provider: agente(), id }, machineOf(id));
      await refrescar();
    } catch (e) {
      setFallo({ what: t("settings.accounts.error.activate"), detail: detalleDe(e) });
    }
  }

  async function mirarEspera() {
    try {
      setEsperando(await invoke<EnEspera[]>("tasks_awaiting_quota", { provider: agente() }));
    } catch {
      setEsperando([]);
    }
  }

  async function reponer() {
    setReponiendo(true);
    try {
      const n = await invoke<number>("resume_awaiting_quota", { provider: agente() });
      setRepuestas(n);
      await mirarEspera();
    } catch (e) {
      setFallo({ what: t("settings.accounts.error.resume"), detail: detalleDe(e) });
    } finally {
      setReponiendo(false);
    }
  }

  async function quitar(id: string) {
    setPorQuitar(null);
    try {
      await invoke("remove_account", { provider: agente(), id }, machineOf(id));
      await refrescar();
    } catch (e) {
      setFallo({ what: t("settings.accounts.error.remove"), detail: detalleDe(e) });
    }
  }

  /**
   * Por qué no se puede agregar otra cuenta, o `null` si sí se puede.
   *
   * Solo aparece a partir de la segunda: la primera de un agente que comparte
   * credencial es perfectamente utilizable, y bloquearla dejaría al agente sin
   * poder conectarse.
   */
  const segunda = () => {
    const l = lista();
    if (!l?.shared_credential || l.accounts.length === 0) return null;
    return l.shared_credential;
  };

  function cancelarConexion() {
    const id = enCurso();
    if (id) invoke("cancel_login", { id }, machineOf(id)).catch(() => {});
    cancelarEspera();
    setEnCurso(null);
    setPideCodigo(false);
    setPorConfirmar(null);
    setOfrecerTerminal(false);
  }

  const [abierto, setAbierto] = createSignal(untrack(() => props.desplegado ?? true));
  const idCuerpo = createUniqueId();
  const cuentaActiva = () => {
    const l = lista();
    return l?.accounts.find((a) => a.id === l.active);
  };

  const envolver = (cuerpo: JSX.Element, accion?: JSX.Element) =>
    props.titulo === undefined ? (
      <div class="grid min-w-0">
        {cuerpo}
        {props.children}
      </div>
    ) : (
      <SettingsSection
        title={
          <button
            type="button"
            class="flex w-full min-w-0 items-center gap-2 rounded-sm bg-transparent p-0 text-left font-[inherit] text-neutral-950 outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            aria-expanded={abierto()}
            aria-controls={idCuerpo}
            onClick={() => setAbierto(!abierto())}
          >
            <span class="flex size-4 shrink-0 items-center justify-center">
              <MarcaAgente id={agente()} size={16} />
            </span>
            <span class="grid min-w-0 flex-1">
              <span class="truncate">{props.titulo}</span>
              <Show when={props.subtitulo}>
                <span class="truncate text-xs font-normal text-neutral-500">{props.subtitulo}</span>
              </Show>
            </span>
            <span class="flex shrink-0 items-center font-normal">{props.marca}</span>
            {/* Plegada, la cabecera dice con qué cuenta trabaja el proveedor. */}
            <Show when={!abierto() && !props.soloGratuitos ? cuentaActiva() : undefined}>
              {(activa) => (
                <span class="flex min-w-0 items-center gap-1.5 text-xs font-normal text-neutral-500">
                  <span class="truncate font-medium text-neutral-700">
                    {accountPresentation(activa(), estados()[activa().id]).name}
                  </span>
                  <Badge tone="success" class="shrink-0">
                    {t("settings.account_card.active")}
                  </Badge>
                  <span class="shrink-0">
                    {t("settings.accounts.count", { count: tarjetas.length })}
                  </span>
                </span>
              )}
            </Show>
            <ChevronRight
              size={16}
              aria-hidden
              class={cn(
                "shrink-0 text-neutral-500 transition-transform duration-150 ease-out motion-reduce:transition-none",
                abierto() && "rotate-90",
              )}
            />
          </button>
        }
      >
        {/* Plegada se oculta y no se desmonta: una conexión en curso vive aquí. */}
        <div id={idCuerpo} class={cn("min-w-0 pl-6", abierto() ? "grid" : "hidden")}>
          {cuerpo}
          {props.children}
          {accion}
        </div>
      </SettingsSection>
    );

  const botonAgregar = (forma: "aside" | "fila" | "bloque") => (
    <Button
      variant={forma === "aside" ? "ghost" : forma === "fila" ? "secondary" : "primary"}
      size={forma === "aside" ? "compact" : "sm"}
      onClick={() => void agregar()}
      disabled={enCurso() !== null || segunda() !== null || faltaExterno()}
      /* **La segunda cuenta de un agente que no aísla su credencial no se
         ofrece.** No es una advertencia encima del botón: el botón no se
         puede usar y dice por qué. Conectarla reemplazaría la sesión de la
         primera dejándola con cara de conectada, y el gasto de un cliente
         saldría de la suscripción del otro sin nada que avisara. */
      title={segunda() ?? undefined}
    >
      {t("settings.accounts.add")}
    </Button>
  );
  const hayCuentas = () => (lista()?.accounts.length ?? 0) > 0;

  // La activación sola, sin la lista de cuentas: es un destino propio del
  // riel, con su decisión aparte. Ver `soloGratuitos`.
  //
  // Sí trae la instalación: esta pantalla prueba la app sin traer una
  // suscripción propia, y sin instalación el interruptor quedaría en verde
  // con el chat diciendo «no instalado» sin nada que pulsar. Instalar no es
  // una pregunta (`AGENTS.md`): no hay botón aparte, cuelga del acto que la
  // persona ya eligió —activar— y solo se ve su progreso.
  //
  // Cuelga del estado, no solo del acto: colgarlo solo de activar dejaría
  // fuera a quien ya activó antes, con «activados» encima de algo que no
  // puede correr. `preparar` va sin definir cuando el binario ya está, y eso
  // deja al bloque de abajo decir la verdad en los dos casos.
  if (props.soloGratuitos) {
    return envolver(
      <>
        {/* El mismo bloque que las otras dos superficies, en el mismo sitio:
            regla de `AGENTS.md` para cuando algo no está en la máquina, y las
            tres filas de OpenCode contestan igual.

            Instalar y consentir siguen siendo dos actos, dos botones. Activar
            sigue trayendo el binario si falta —bajar cien megas antes de
            aceptar sería gastar disco por una pregunta que puede contestarse
            que no—; esto es para quien quiere el binario y no ha decidido lo
            otro.

            Las tres comparten paquete y carpeta (`agents::Install::carpeta`):
            instalar desde cualquiera las quita de las tres, con el evento
            `providers` haciéndolas releer `list_providers`. */}
        <Show when={!agentes().find((a) => a.id === agente())?.available}>
          <SettingsBlock class="justify-items-start">
            <Button
              size="sm"
              disabled={Boolean(instalando()) || revisandoCli()}
              onClick={() => void instalarCli()}
            >
              {instalando() ? acto().curso : acto().boton}
            </Button>
          </SettingsBlock>
        </Show>

        <Show when={inferencia() === "sin_pedir_nada"}>
          <ModelosGratuitos
            nombre={props.nombre ?? etiqueta()}
            marca={props.titulo === undefined ? props.marca : undefined}
            agente={agente()}
            proveedor={etiqueta()}
            falta={!agentes().find((a) => a.id === agente())?.available}
            preparar={
              agentes().find((a) => a.id === agente())?.available
                ? undefined
                : instalarCli
            }
            preparando={Boolean(instalando())}
          />
        </Show>
        <Show when={fallo()}>
          {(f) => (
            <SettingsBlock>
              <FailureNote f={f()} />
            </SettingsBlock>
          )}
        </Show>
      </>,
    );
  }

  return envolver(
    <>
      {/* Sin cuentas no se enseña la lista, ni vacía: una lista vacía con su
          botón de agregar diría «todavía no conectaste ninguna», falso y una
          promesa que no va a pasar. Lo que va aquí es de qué depende. */}
      {/* Lo que falta se nombra y se ofrece, también donde no hay cuenta que
          conectar: conectar ya instalaba el CLI si faltaba, pero un agente
          `sin_cuenta` no tiene ese botón, y su pantalla dejaba a la persona
          sin ninguna salida para el modelo local. */}
      <Show when={!agentes().find((a) => a.id === agente())?.available}>
        <SettingsBlock class="justify-items-start">
          <Button
            size="sm"
            disabled={Boolean(instalando()) || revisandoCli()}
            onClick={() => void instalarCli()}
          >
            {instalando() ? acto().curso : acto().boton}
          </Button>
          <Show when={externalInstallUrl()}>
            <p class="text-xs text-neutral-500">{t("settings.accounts.external_required", { agent: etiqueta() })}</p>
            <Button variant="secondary" size="sm" disabled={revisandoCli()} onClick={() => void comprobarCli()}>
              {t("settings.accounts.check_installed")}
            </Button>
          </Show>
        </SettingsBlock>
      </Show>

      {/* Nombrar el CLI aquí atribuiría una salida de datos a los modelos locales. */}
      <Show when={inferencia() === "en_la_maquina"}>
        <MotoresLocales />
      </Show>

      {/* El consentimiento va antes que la lista de cuentas, no después: lo
          que se acepta aquí no es un ajuste, es que el material de un
          cliente salga de esta computadora. Conectar cuenta, que da el
          catálogo completo, es el bloque de abajo y es otra decisión. */}
      <Show when={!sinCuenta()}>
      <Show when={!props.agente}>
        <SettingsBlock>
          <Select
            class="min-h-8 text-xs"
            value={agente()}
            onChange={(e) => setAgente(e.currentTarget.value)}
          >
            {/* No se deshabilita el que falta: conectarlo lo instala.
                Deshabilitarlo dejaría a quien llega con la máquina limpia sin
                forma de elegir el agente que quiere. Lo que se dice es que
                va a instalarse: consecuencia, no glosa. */}
            <For each={agentes()}>
              {(a) => (
                <option value={a.id}>
                  {a.label}
                  {a.available ? "" : (a.external_install_url ? t("settings.accounts.external_missing") : t("settings.accounts.installs_on_connect"))}
                </option>
              )}
            </For>
          </Select>
        </SettingsBlock>
      </Show>

      <Show when={fallo()}>
        {(f) => (
          <SettingsBlock>
            <FailureNote f={f()} />
          </SettingsBlock>
        )}
      </Show>

      <Show when={cargando()}>
        <SettingsBlock>
          <Skeleton filas={2} />
        </SettingsBlock>
      </Show>

      <Show when={esperando().length}>
        {(n) => (
          <SettingsRow label={t("settings.accounts.awaiting", { count: n() })}>
            <Button
              variant="outline"
              size="compact"
              onClick={() => void reponer()}
              disabled={reponiendo()}
            >
              {t("settings.accounts.awaiting_resume", { count: n() })}
            </Button>
          </SettingsRow>
        )}
      </Show>

      <Show when={repuestas() !== null}>
        <SettingsBlock>
          <p class="m-0 text-ui leading-[19px] text-neutral-500">
            {t("settings.accounts.awaiting_resumed", { count: repuestas() ?? 0 })}
          </p>
        </SettingsBlock>
      </Show>

      <Show when={!cargando() && !hayCuentas()}>
        <SettingsRow
          label={props.nombre ?? t("settings.accounts.connect_agent", { agent: etiqueta() })}
        >
          {botonAgregar("fila")}
        </SettingsRow>
      </Show>

      <Show when={claveDe() && !props.enAlta}>
        <Suspense fallback={null}>
          <LocalKeysBanner kinds={["api_key"]} />
        </Suspense>
      </Show>

      <Show when={hayCuentas()}>
      <ul class="m-0 grid list-none gap-2 p-0">
        <For each={tarjetas}>
          {(a, i) => {
            const activa = () => a.id === lista()?.active || !!a.machines?.some((m) => m.id === lista()?.active);
            const estado = () => estados()[a.id];

            return (
              <>
              <CuentaConfigurada
                account={a}
                agent={agente()}
                agentLabel={etiqueta()}
                active={activa()}
                status={estado()}
                checkingStatus={comprobando()[a.id]}
                statusUnknown={sinComprobar()[a.id] && a.authenticated_at !== null}
                onRecheckStatus={() => comprobar(a.id)}
                supportsLimits={
                  agentes().find((x) => x.id === agente())?.limits ?? false
                }
                order={i()}
                afterStatusChange={conectadaVez()[a.id] ?? 0}
                actions={(info) => {
                  const caida = () => info.revocada || estado()?.authenticated === false;
                  // Autenticada alguna vez y sin respuesta ahora: se ofrece
                  // preguntar de nuevo, y reconectar por si no era el plazo.
                  const dudosa = () => !caida() && info.sinComprobar;
                  return (
                    <>
                      <Show when={agente() === "opencode-zen"}>
                        <Button variant="outline" size="compact" onClick={() => setPidiendoClaveGo(a.id)}>
                          {t("settings.accounts.go_key")}
                        </Button>
                      </Show>
                      <Show when={dudosa()}>
                        <Button
                          variant="outline"
                          size="compact"
                          disabled={comprobando()[a.id]}
                          onClick={() => void comprobar(a.id)}
                        >
                          {t("settings.accounts.retry")}
                        </Button>
                      </Show>
                      {/* Un solo botón visible: reconectar si se cayó o no se pudo comprobar, usarla si no es la activa. */}
                      <Show
                        when={caida() || dudosa()}
                        fallback={
                          <Show when={!activa()}>
                            <Button
                              variant="outline"
                              size="compact"
                              title={t("settings.accounts.use_title")}
                              onClick={() => void usar(a.id)}
                            >
                              {t("settings.accounts.use")}
                            </Button>
                          </Show>
                        }
                      >
                        <Button
                          variant="outline"
                          size="compact"
                          onClick={() => void conectar(a.id)}
                          disabled={enCurso() !== null}
                          title={
                            enCurso() !== null
                              ? t("settings.accounts.busy")
                              : t("settings.accounts.connect_title", { agent: etiqueta() })
                          }
                        >
                          {a.authenticated_at
                            ? t("settings.accounts.reconnect")
                            : t("settings.accounts.connect")}
                        </Button>
                      </Show>
                      <Show when={!(caida() || dudosa()) || !props.enAlta}>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            aria-label={t("settings.accounts.more_actions", {
                              name: accountPresentation(a, estado()).name,
                            })}
                            title={t("settings.accounts.more_actions", {
                              name: accountPresentation(a, estado()).name,
                            })}
                            class="grid size-6 shrink-0 place-items-center rounded-sm text-neutral-500 outline-none hover:bg-surface-muted hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary data-[expanded]:bg-surface-muted data-[expanded]:text-neutral-950"
                          >
                            <Ellipsis size={16} />
                          </DropdownMenuTrigger>
                          {/* Configuración es un Dialog en z-[80] que cierra con Esc salvo dentro de data-owns-escape. */}
                          <DropdownMenuContent class="z-[90]" data-owns-escape>
                            {/* Reconectar reescribe la credencial en su carpeta; quitar la borra. */}
                            <Show when={!caida() && !dudosa()}>
                              <DropdownMenuItem
                                class="flex items-center gap-2"
                                disabled={enCurso() !== null}
                                onSelect={() => void conectar(a.id)}
                              >
                                <RefreshCw size={14} aria-hidden />
                                {t("settings.accounts.reconnect")}
                              </DropdownMenuItem>
                            </Show>
                            <Show when={!caida() && !dudosa() && !props.enAlta}>
                              <DropdownMenuSeparator />
                            </Show>
                            <Show when={!props.enAlta && !a.machines}>
                              <DropdownMenuItem
                                class="flex items-center gap-2 text-error-strong"
                                onSelect={() => setPorQuitar(a.id)}
                              >
                                <Trash2 size={14} aria-hidden />
                                {t("settings.accounts.remove")}
                              </DropdownMenuItem>
                            </Show>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </Show>
                    </>
                  );
                }}
                destructiveAction={
                  porQuitar() === a.id ? (
                    <>
                      <button
                        class="min-h-6 whitespace-nowrap rounded-md border border-error-strong bg-transparent px-2 text-xs font-medium text-error-strong"
                        onClick={() => void quitar(a.id)}
                      >
                        {t("settings.accounts.remove_yes")}
                      </button>
                      <Button
                        variant="outline"
                        size="compact"
                        onClick={() => setPorQuitar(null)}
                      >
                        {t("settings.accounts.remove_no")}
                      </Button>
                    </>
                  ) : undefined
                }
              />
              {capabilities().accountMachines?.({ account: a, provider: agente(), add: agregar, refresh: () => void refrescar() })}
              <Show when={claveDe() && !props.enAlta}>
                <Suspense fallback={null}>
                  <CredentialsInUse match={(c) => c.kind === "api_key" && c.config.agent === agente() && c.config.account === a.id} />
                </Suspense>
              </Show>
              </>
            );
          }}
        </For>
      </ul>
      </Show>

      {/* Dónde acaba el secreto de este agente, cuando no es el llavero. No
          deshabilita nada y no va encima de un control: la cuenta funciona y
          es independiente. Hace legible el renglón en inglés que el CLI de
          Antigravity escribe a mitad del login —«keychain not found»—, que
          sin esto se lee como que la conexión falló. */}
      <Show when={lista()?.secret_note}>
        {(nota) => (
          <SettingsBlock>
            <p class="m-0 max-w-[62ch] text-ui leading-[19px] text-neutral-500">
              {prosa(nota())}
            </p>
          </SettingsBlock>
        )}
      </Show>

      {/* `Button` deshabilitado no recibe el puntero: su `title` nunca se ve. */}
      <Show when={segunda()}>
        {(porque) => (
          <SettingsBlock>
            <p class="m-0 max-w-[62ch] text-ui leading-[19px] text-neutral-500" data-shared-credential="">
              {porque()} {t("settings.accounts.shared_remove_first")}
            </p>
          </SettingsBlock>
        )}
      </Show>

      <Show when={props.titulo === undefined && hayCuentas()}>
        <SettingsBlock class="justify-items-start">{botonAgregar("bloque")}</SettingsBlock>
      </Show>

      {/* La conexión es un modal, no una caja dentro de la tarjeta.

          `add_account` emite el evento `account`; `Settings.tsx` lo escucha y
          vuelve a pedir `list_surfaces`. Su `<For>` reconcilia por
          referencia, y un array nuevo recrea todas las filas: el `<details>`
          volvería a montarse cerrado —su `open` solo vive en el DOM— y con
          él se destruiría este componente, que guarda `enCurso`, `url` y
          `pideCodigo`. No se «cerraría una ventana»: se tiraría el estado de
          la conexión mientras su proceso sigue vivo, con el login del CLI
          todavía esperando el código y su carpeta ya borrada debajo.

          El diálogo se pinta fuera del árbol de la tarjeta: aunque la fila
          se recree, la conexión no depende de que su tarjeta siga abierta.
          Mismo recurso que `Consentir`: lo que no se puede interrumpir no se
          dibuja dentro de algo que se puede plegar.

          Sigue faltando que recrear la fila no destruya el componente. Eso
          se arregla en quien pinta la lista. */}
      <Show when={enCurso()}>
        {(id) => (
          <Dialog open onOpenChange={(abierto) => !abierto && cancelarConexion()}>
            {/* Sin `onClick` de cierre en el velo, a diferencia de `Consentir`:
                un clic fuera no puede tirar una autenticación a medias que
                además tiene un proceso vivo detrás. Se sale por «cancelar»,
                que sí mata el proceso (`cancel_login`). */}
              <DialogContent
                class="flex w-[min(520px,100%)] max-w-[520px] flex-col gap-4 p-5"
                aria-label={t("settings.accounts.connect_agent", { agent: etiqueta() })}
                onPointerDownOutside={(e) => e.preventDefault()}
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="flex min-w-0 flex-col gap-0.5">
                    <DialogTitle class="text-sm font-semibold">
                      {t("settings.accounts.connect_agent", { agent: etiqueta() })}
                    </DialogTitle>
                    {/* Bajar el CLI tarda, y se dice: sin esto la conexión parece
                        colgada durante la descarga, el momento en que nadie sabe si
                        pasa algo. */}
                    <Show when={instalando() || (!url() && !pideCodigo() && !porConfirmar())}>
                      <span class="flex items-center gap-1.5 text-xs text-neutral-500">
                        <Spinner size={12} />
                        {instalando() ? acto().curso : t("settings.accounts.connecting")}
                      </span>
                    </Show>
                  </div>
                  <Button variant="outline" size="compact" onClick={cancelarConexion}>
                    {t("settings.accounts.cancel")}
                  </Button>
                </div>

                {/* El código que la página va a pedir, delante de todo. No es un
                    detalle del registro: la página dice «enter the code shown in
                    your terminal» y aquí no hay terminal — sin esto se llega a
                    una pantalla que pide algo que la app se guardó. */}
                <Show when={porConfirmar()}>
                  {(c) => (
                    <div class="flex flex-col gap-1.5 text-xs text-neutral-500">
                      <span>{t("settings.accounts.confirm_code")}</span>
                      <strong class="self-start select-all rounded-sm bg-surface-muted px-3 py-2 font-mono text-xl font-semibold tracking-[0.08em] text-neutral-950">{c()}</strong>
                    </div>
                  )}
                </Show>

                {/* Copiar el enlace: dentro del registro sale partido en renglones. */}
                <Show when={url()}>
                  {(u) => (
                    <Paso numero={1} titulo={t("settings.accounts.step_browser")}>
                      <p class="m-0 text-xs text-neutral-500">
                        {t("settings.accounts.step_browser_hint", { agent: etiqueta() })}
                      </p>
                      <div class="flex flex-wrap items-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => invoke("open_external", { target: u() }).catch(() => {})}
                        >
                          <ExternalLink size={14} />
                          {t("settings.accounts.open_browser")}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => void copiarEnlace(u())}>
                          <Show when={enlaceCopiado()} fallback={<Copy size={14} />}>
                            <Check size={14} />
                          </Show>
                          {enlaceCopiado()
                            ? t("settings.accounts.link_copied")
                            : t("settings.accounts.copy_link")}
                        </Button>
                      </div>
                      <Show when={copiaFallida()}>
                        {(m) => <p class="m-0 text-xs text-error-strong">{m()}</p>}
                      </Show>
                    </Paso>
                  )}
                </Show>

                <Show when={pideCodigo()}>
                  <Paso numero={url() ? 2 : 1} titulo={t("settings.accounts.step_code")}>
                    <LoginCodeForm value={codigo()} onInput={setCodigo} onSubmit={() => void enviarCodigo()} />
                  </Paso>
                </Show>

                {/* Lo que el agente va diciendo, tal cual: cuando una conexión
                    falla, el motivo está ahí y esconderlo obliga a adivinar.
                    Plegado: el fallo final ya lo pinta `conexionFallida`. */}
                <Show when={salida().length > 0}>
                  <details class="group">
                    <summary class="flex cursor-pointer list-none items-center gap-1 text-xs text-neutral-500 marker:content-none hover:text-neutral-950">
                      <ChevronRight size={12} class="transition-transform group-open:rotate-90" />
                      {t("settings.accounts.log", { agent: etiqueta() })}
                    </summary>
                    <Terminal class="mt-2">
                      <TerminalBody class="max-h-[140px] break-all">{salida().join("\n")}</TerminalBody>
                    </Terminal>
                  </details>
                </Show>

                {/* El agente lleva un rato sin decir nada. Puede ser que esté
                    esperando algo que solo sabe pedir con una terminal de verdad, y
                    esto es lo único que lo destraba. */}
                <Show when={ofrecerTerminal() && terminalLocal(id())}>
                  <div class="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                    <span>
                      {t("settings.accounts.no_response", { agent: etiqueta() })}
                    </span>
                    <Button
                      variant="outline"
                      size="compact"
                      onClick={() => {
                        invoke("cancel_login", { id: id() }, machineOf(id())).catch(() => {});
                        void conectar(id(), "terminal");
                      }}
                    >
                      {t("settings.accounts.open_terminal")}
                    </Button>
                  </div>
                </Show>
              </DialogContent>
          </Dialog>
        )}
      </Show>

      {/* Conectar con una clave: un campo y el enlace donde se consigue.
          Pedirle a quien opera el negocio que navegue un menú de terminal es
          pedirle que programe. OpenCode ya no entra por aquí.

          El enlace va primero, en el orden en que ocurre: sin clave no hay
          nada que pegar. La URL viene de la tabla, genérica: sirve antes de
          estar autenticado, que es cuando hace falta. */}
      {/* Al modal por el mismo motivo que la conexión de arriba: se llega aquí
          pulsando «Agregar cuenta», que es justo el gesto que recrea la fila y
          plegaba la tarjeta con el campo dentro. */}
      <Show when={pidiendoClaveGo()}>
        <Dialog open onOpenChange={(open) => { if (!open) { setPidiendoClaveGo(null); setClaveGo(""); } }}>
          <DialogContent class="w-[min(480px,100%)] max-w-[480px] p-4" aria-label={t("settings.accounts.go_key")}>
            <div class="flex flex-col gap-3">
              <DialogTitle>{t("settings.accounts.go_key")}</DialogTitle>
              <p class="m-0 text-xs text-neutral-500">{t("settings.accounts.go_key_hint")}</p>
              <Button variant="outline" size="compact" onClick={() => void invoke("open_external", { target: "https://opencode.ai/console" })}>
                {t("settings.accounts.create_key")}
              </Button>
              <Input type="password" class="font-mono text-xs" value={claveGo()} placeholder={t("settings.accounts.key_placeholder")} onInput={(e) => setClaveGo(e.currentTarget.value)} onKeyDown={(e) => e.key === "Enter" && void guardarClaveGo()} />
              <div class="flex gap-2">
                <Button disabled={guardandoClaveGo() || !claveGo().trim()} onClick={() => void guardarClaveGo()}>{t("settings.accounts.save")}</Button>
                <Button variant="outline" onClick={() => { setClaveGo(""); void guardarClaveGo(); }}>{t("settings.accounts.go_key_remove")}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </Show>
      <Show when={pidiendoClave()}>
        <Dialog open>
        <DialogContent
          class="w-[min(560px,100%)] max-w-[560px] p-0"
          aria-label={t("settings.accounts.connect_agent", { agent: etiqueta() })}
        >
        <div class="flex flex-col gap-2 rounded-md border border-primary px-3 py-2.5">
          <div class="flex items-center justify-between text-xs font-semibold">
            <DialogTitle>{t("settings.accounts.connect_agent", { agent: etiqueta() })}</DialogTitle>
            <Button
              variant="outline"
              size="compact"
              onClick={() => {
                const id = pidiendoClave();
                setPidiendoClave(null);
                setClave("");
                // El alta creó la cuenta antes de tener la clave, igual que con
                // el login del CLI. Sin esto queda un objeto vacío en la lista.
                if (id) void invoke("discard_account", { provider: agente(), id }, machineOf(id)).then(refrescar);
              }}
            >
              {t("settings.accounts.cancel")}
            </Button>
          </div>
          <EnlaceExterno url={claveDe()}>
            {t("settings.accounts.create_key")}
          </EnlaceExterno>
          <div class="composer">
            <Input
              class="font-mono text-xs"
              type="password"
              ref={enfocar}
              value={clave()}
              placeholder={t("settings.accounts.key_placeholder")}
              onInput={(e) => setClave(e.currentTarget.value)}
              onKeyDown={(e) => e.key === "Enter" && void guardarClave()}
            />
            <Button
              disabled={guardandoClave() || !clave().trim()}
              onClick={() => void guardarClave()}
            >
              {guardandoClave()
                ? t("settings.accounts.saving")
                : t("settings.accounts.save")}
            </Button>
          </div>
        </div>
        </DialogContent>
        </Dialog>
      </Show>

      {/* La conexión terminó mal. El panel de arriba ya se cerró —el proceso
          murió—, y el motivo y la salida viven aquí hasta que se reintente:
          cerrarlo dejaría reintentando a ciegas. */}
      <Show when={!enCurso() && conexionFallida()}>
        {(f) => (
          <SettingsBlock>
          <div class="flex flex-col gap-2 rounded-md border border-primary px-3 py-2.5">
            <div class="flex items-center justify-between text-xs font-semibold">
              <span>{t("settings.accounts.failed_title")}</span>
              <Button
                variant="outline"
                size="compact"
                onClick={() => setConexionFallida(null)}
              >
                {t("settings.accounts.close")}
              </Button>
            </div>
            <span class="break-all font-mono text-xs">{f().texto}</span>
            <div class="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
              <Button size="sm" onClick={() => void conectar(f().id)}>
                {t("settings.accounts.retry")}
              </Button>
              <Show when={terminalLocal(f().id)}>
                <Button
                  variant="outline"
                  size="compact"
                  onClick={() => void conectar(f().id, "terminal")}
                >
                  {t("settings.accounts.open_terminal")}
                </Button>
              </Show>
            </div>
          </div>
          </SettingsBlock>
        )}
      </Show>
      </Show>
    </>,
    <Show when={!sinCuenta() && hayCuentas()}>
      <div class="flex pt-2">{botonAgregar("aside")}</div>
    </Show>,
  );
}

/**
 * Activar los modelos que OpenCode regala.
 *
 * Apagado por omisión, y el de omisión es el local: la diferencia no es de
 * calidad sino de a dónde va el material, el local no sale de la máquina y
 * estos sí. Se acepta una vez, explícitamente, y se puede retirar — un
 * consentimiento que no se puede revocar no es un consentimiento.
 *
 * El aviso dice las dos mitades: que sale, y qué hacen con ello. La segunda
 * no es igual para todos: los que entrenan con lo que les mandes se marcan
 * en la propia lista (`runtime/models.rs`).
 *
 * Es del workspace, no de la máquina: lo guarda `workspaces::set_provider_consent`,
 * y lo consultan el catálogo y el camino del chat. Lo que sale es material
 * de un cliente, y una decisión tomada para uno no aplica al trabajo de otro.
 */
/**
 * Qué se puede mandar a estos modelos, en un solo sitio y para todos: la
 * restricción más estricta del conjunto, aplicada a la sección entera. Los
 * términos de datos son distintos modelo a modelo —hay quien entrena con lo
 * que le mandas, y dos que dicen «trial use only — do not submit personal or
 * confidential data»—, y aquí se afirma el peor caso de todos: nunca se
 * queda corta —el noveno modelo que OpenCode añada mañana ya está cubierto—
 * y no hay nada que mantener. Por qué no vuelve una marca por modelo, en
 * `models::Gobierno`.
 *
 * La app no puede hacerlo cumplir y no finge que sí: no sabe qué es
 * confidencial, informa y decide la persona, igual que con las fuentes que
 * adjunta a un proyecto. Un candado que no puede cerrar es peor que un
 * aviso que se lee.
 *
 * La consecuencia, para que nadie intente «arreglarlo»: esta sección es para
 * probar el producto, no para trabajar con clientes. Los siete modelos que
 * ofrece tienen excepción de datos, y la frase lo dice con esas palabras.
 * Quien trabaje con material de un cliente usa su cuenta de Claude, Codex,
 * Grok o Antigravity, o paga por modelos de OpenCode.
 */
const AVISO_DE_USO = () => t("settings.accounts.free.warning");

/** Un paso de la conexión: el número, qué hacer, y con qué. */
function Paso(props: { numero: number; titulo: string; children: JSX.Element }) {
  return (
    <section class="flex gap-3">
      <span class="grid size-5 shrink-0 place-items-center rounded-full bg-surface-muted text-caption font-semibold text-neutral-700">
        {props.numero}
      </span>
      <div class="flex min-w-0 flex-1 flex-col gap-2">
        <h3 class="m-0 text-xs font-semibold text-neutral-950">{props.titulo}</h3>
        {props.children}
      </div>
    </section>
  );
}

/**
 * Cuál es ese agente no se escribe aquí: llega por `props.agente`, y quién lo
 * monta lo decide la tabla (`inferencia === "sin_pedir_nada"`, la misma
 * columna que dice por qué hace falta consentimiento). Con el id escrito
 * dentro, este bloque solo serviría a una fila.
 */
/** El runtime que Terminus instala, el catálogo de modelos y cuál usan las tareas. */
function MotoresLocales() {
  const m = crearModelosLocales();
  return (
    <SettingsBlock>
      <ListaDeModelosLocales m={m} memoria />
    </SettingsBlock>
  );
}

/**
 * Lo que hay que aceptar antes de activar, y a qué versión de texto. Los dos
 * llegan juntos del backend (`workspaces::consent_text`): quien cambie la
 * frase tiene el número al lado, y un guarda en Rust falla si el texto se
 * mueve sin que la versión suba.
 */
export type Consentimiento = { lineas: Frase[]; version: number };

/**
 * El sí explícito, antes de activar.
 *
 * No choca con «una interfaz que necesita explicarse está mal diseñada»
 * (AGENTS.md): la regla prohíbe la glosa, el párrafo que describe lo que la
 * sección es; un consentimiento es retroalimentación sobre lo que el sistema
 * va a hacer, que la misma regla permite.
 *
 * Cancelar es una salida de verdad, no un paso más: si la única forma de
 * cerrar fuera aceptar, la decisión ya estaría tomada. Se sale por tres
 * vías —el botón, Escape y pulsar fuera— y las tres dejan el mismo estado:
 * no se activa nada.
 *
 * Cancelar no es un fallo: ni mensaje de error ni nota roja. Es una
 * respuesta legítima a una pregunta legítima; tratarla como error empujaría
 * a aceptar, lo que un consentimiento no puede hacer.
 */
export function Consentir(props: {
  texto: Consentimiento;
  guardando: boolean;
  onAceptar: () => void;
  onCancelar: () => void;
}) {
  return (
    <Dialog open onOpenChange={(abierto) => !abierto && props.onCancelar()}>
        <DialogContent
          class="w-[min(520px,100%)] max-w-[520px] p-0"
          aria-label={t("settings.accounts.consent.title")}
        >
          <div class="flex flex-col gap-3 p-5">
            <For each={props.texto.lineas}>
              {(linea, i) => (
                <p class={cn("m-0 text-xs leading-6 text-neutral-500", i() === 0 && "font-medium text-neutral-950")}>{prosa(linea)}</p>
              )}
            </For>
            <div class="mt-2 flex justify-end gap-2">
              {/* Cancelar primero en el orden de lectura y sin peso visual: la
                  acción que gasta algo es la otra, y esta tiene que poder
                  pulsarse sin buscarla. */}
              <Button
                variant="outline"
                size="sm"
                onClick={props.onCancelar}
                disabled={props.guardando}
              >
                {t("settings.accounts.consent.cancel")}
              </Button>
              <Button
                size="sm"
                onClick={props.onAceptar}
                disabled={props.guardando}
              >
                {t("settings.accounts.consent.accept")}
              </Button>
            </div>
          </div>
        </DialogContent>
    </Dialog>
  );
}

function ModelosGratuitos(props: {
  nombre: string;
  marca?: JSX.Element;
  agente: string;
  proveedor: string;
  /**
   * Trae el CLI que sirve estos modelos, o `undefined` si ya está.
   *
   * Corre después de guardar el sí, no antes: se decide aquí que el material
   * salga de esta computadora, y bajar cien megas antes de aceptar gastaría
   * el disco por una pregunta que puede contestarse que no.
   *
   * Que esté definido es también cómo esta pantalla sabe que falta el
   * binario, y de eso depende que no diga «activados» sobre algo que no
   * puede correr.
   */
  preparar?: () => Promise<void>;
  preparando?: boolean;
  /**
   * Si el binario no está en la máquina. Es un dato, no se deduce de que
   * `preparar` esté definido: traerlo es del panel de arriba, que monta el
   * botón junto al de las otras dos superficies; aquí solo decide qué
   * afirma la etiqueta.
   */
  falta: boolean;
}) {
  const [aceptado, setAceptado] = createSignal(false);
  const [guardando, setGuardando] = createSignal(false);
  const [fallo, setFallo] = createSignal<string | null>(null);
  const [texto, setTexto] = createSignal<Consentimiento | null>(null);
  // El modal abierto. Se cierra sin activar nada por cualquiera de las tres
  // vías; ver `Consentir`.
  const [preguntando, setPreguntando] = createSignal(false);

  // En orden y no en paralelo: saber si el sí guardado sigue valiendo
  // necesita la versión del texto de hoy, que se pide primero. Lanzadas a
  // la vez, la comparación se haría contra `undefined` la mitad de las
  // veces y una cuenta ya aceptada aparecería sin aceptar, o al revés.
  onMount(() => {
    void (async () => {
      try {
        const [lineas, version] = await invoke<[Frase[], number]>("consent_text");
        setTexto({ lineas, version });
        const s = await invoke<{
          active: string | null;
          workspaces: {
            id: string;
            consents?: { provider: string; version: number }[];
          }[];
        }>("workspaces_startup");
        const activo = s.workspaces.find((w) => w.id === s.active);
        // Vale el sí de la versión de hoy, no cualquier sí: quien aceptó un
        // texto anterior vuelve a verlo una vez, lo que aceptó decía otra
        // cosa. Lo mismo lo comprueba el backend antes de dar catálogo o de
        // lanzar un turno (`workspaces::consintio`); aquí solo se pinta.
        setAceptado(
          activo?.consents?.some(
            (c) => c.provider === props.agente && c.version === version,
          ) ?? false,
        );
      } catch {
        /* Sin texto no se ofrece activar: el botón queda deshabilitado. */
      }
    })();
  });

  async function cambiar(valor: boolean) {
    setGuardando(true);
    try {
      const w = await invoke<{ consents?: { provider: string; version: number }[] }>(
        "set_provider_consent",
        { provider: props.agente, accepted: valor },
      );
      // Lo que quedó guardado, no lo que se pidió: si el backend rechaza algo,
      // la pantalla tiene que enseñar su estado y no el nuestro.
      setAceptado(w.consents?.some((c) => c.provider === props.agente) ?? false);
      setPreguntando(false);
      setFallo(null);
      // Sin binario, activar deja el interruptor en verde y el chat sin poder
      // usarlo. Su fallo lo pinta el panel de arriba, que es de quien es la
      // instalación.
      if (valor && props.preparar) await props.preparar();
      // La caja de chat no ofrece modelos de un agente sin autorizar: tiene
      // que enterarse ahora, no al cambiar de agente y volver.
      window.dispatchEvent(new CustomEvent("harness:consentimiento"));
    } catch (e) {
      setFallo(prosaDe(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <>
    {/* Cancelar cierra y no activa nada, por las tres vías. No deja el
        interruptor a medias ni escribe un estado intermedio: el sí solo
        existe si se pulsa Activar. */}
    <Show when={preguntando() && texto()}>
      {(pregunta) => (
        <Consentir
          texto={pregunta()}
          guardando={guardando()}
          onAceptar={() => void cambiar(true)}
          onCancelar={() => setPreguntando(false)}
        />
      )}
    </Show>
    <SettingsRow
      label={
        props.nombre || props.marca ? (
          <span class="flex flex-wrap items-center gap-2">
            {props.nombre}
            {props.marca}
          </span>
        ) : ""
      }
      description={
      <>
      {/* Omitir el proveedor o alejar el aviso oculta el destino de los datos al activar. */}
      <Show
        when={!aceptado() || props.falta}
        fallback={<p class="m-0">{t("settings.accounts.free.warning_short")}</p>}
      >
        <p class="m-0">
          {t("settings.accounts.free.provider", { provider: props.proveedor })}
        </p>
        <p class="m-0">
          <strong>{AVISO_DE_USO()}</strong>
        </p>
      </Show>
      <Show when={fallo()}>
        {(f) => (
          <div class="mt-2">
            <FailureNote f={{ what: t("settings.accounts.free.error_save"), detail: f() }} />
          </div>
        )}
      </Show>
      </>
      }
    >
      <Show
        when={aceptado()}
        fallback={
          <Button
            size="sm"
            // Sin el texto no se puede pedir el sí, y tampoco se ofrece
            // activar: aceptar sin ver qué se acepta no es un consentimiento.
            disabled={guardando() || props.preparando || !texto()}
            onClick={() => setPreguntando(true)}
          >
            {props.preparando
              ? t("settings.accounts.preparing")
              : t("settings.accounts.free.activate")}
          </Button>
        }
      >
        <div class="flex items-center gap-2">
          {/* «Activados» solo cuando de verdad se pueden usar. Con el sí
              guardado y sin binario, esta etiqueta afirmaría algo que el
              chat contradice tres clics más allá, donde la superficie sale
              «no instalado» y no deja empezar una tarea. Consentimiento y
              binario son dos cosas distintas —no se mezclan al guardarlas,
              retiraría un sí ya dado— pero lo que la pantalla afirma tiene
              que ser las dos.

              Lo que falta se nombra y se ofrece: regla de `AGENTS.md` para
              cuando algo desaparece de la máquina. Nombrarlo se quedó aquí;
              ofrecerlo está en el bloque de arriba, donde las otras dos
              superficies lo tienen. */}
          <Show
            when={props.falta}
            fallback={<Badge tone="success">{t("settings.accounts.free.active")}</Badge>}
          >
            <Badge tone="danger">{t("settings.accounts.free.missing")}</Badge>
          </Show>
          <Button
            variant="outline"
            size="compact"
            disabled={guardando() || props.preparando}
            onClick={() => cambiar(false)}
            title={t("settings.accounts.free.deactivate_title")}
          >
            {t("settings.accounts.free.deactivate")}
          </Button>
        </div>
      </Show>
    </SettingsRow>
    </>
  );
}

function CuentaConfigurada(props: {
  account: Account;
  agent: string;
  agentLabel: string;
  active: boolean;
  status?: AccountStatus;
  checkingStatus?: boolean;
  /** Autenticada, pero la última consulta de estado falló. */
  statusUnknown?: boolean;
  onRecheckStatus?: () => void | Promise<unknown>;
  supportsLimits: boolean;
  order: number;
  afterStatusChange: number;
  /**
   * Función y no nodo: quien pregunta al proveedor es esta fila, y el padre
   * no puede saber que la credencial fue rechazada hasta que ella se lo
   * diga. Sin esto, el botón de reconectar dependería solo de
   * `account_status` —que solo mira si el archivo está en disco— y no
   * aparecería en el caso que más lo necesita: cuenta presente, token
   * muerto.
   *
   * En Solid tiene que ser una función: un nodo del DOM creado arriba se
   * colocaría una sola vez y no se recalcularía cuando la fila descubra
   * el 401.
   */
  actions: (info: { revocada: boolean; sinComprobar: boolean }) => JSX.Element;
  destructiveAction: JSX.Element;
}) {
  const lectura = createAccountLimit({
    get agent() {
      return props.agent;
    },
    get id() {
      return props.account.id;
    },
    get agentLabel() {
      return props.agentLabel;
    },
    get active() {
      return props.active;
    },
    get orden() {
      return props.order;
    },
    get tras() {
      return props.afterStatusChange;
    },
    get enabled() {
      return props.supportsLimits;
    },
  });

  // Si el proveedor sí contestó con límites, la cuenta funciona aunque el CLI
  // local no haya respondido a tiempo.
  const sinComprobar = () => !!props.statusUnknown && lectura.limits?.mode !== "read";

  return (
    <AccountCard
      account={props.account}
      active={props.active}
      status={props.status}
      checkingStatus={props.checkingStatus}
      statusUnknown={sinComprobar()}
      onRecheckStatus={props.onRecheckStatus}
      noLimitsLabel={props.agent === "opencode-zen" ? t("settings.accounts.go_key_required") : undefined}
      limits={lectura.limits}
      lastGood={lectura.lastGood}
      loadingLimits={lectura.loading}
      refreshingLimits={lectura.refreshing}
      onRefreshLimits={props.supportsLimits ? lectura.refresh : undefined}
      actions={props.actions({ revocada: revocada(lectura.limits), sinComprobar: sinComprobar() })}
      destructiveAction={props.destructiveAction}
      variant="row"
    />
  );
}
