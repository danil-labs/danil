import { createSignal, onCleanup, onMount } from "solid-js";
import { t } from "../../../../ui/src/lib/i18n";
import { accountStatus, addAccount, discardAccount, installProvider, listAccounts, listProviders, loginAccount, setApiKey, tasksAwaitingQuota } from "../queries/engine-accounts";
import { checkEnvironment } from "../queries/engine-environment";
import { openExternal } from "../queries/engine-open";
import { textoDeFalta } from "../../../../ui/src/lib/no-space";
import { capabilities } from "../../../../host/src/platform";
import { detalleDe } from "../../../../ui/src/Failure";
import { accountKeyUrl, addBlockedByExternal } from "../../../../ui/src/lib/account-auth.ts";
import { type Account, type AccountList, type AccountStatus, type AgentOpt, type EnEspera } from "../queries/accounts-store";
import type { BloqueoAlta } from "../model/ai-providers-groups";
import { ESPERA_ANTES_DE_LA_TERMINAL_MS, normalizarListaDeCuentas, segundaCuentaBloqueada } from "./AccountsModel";
import type { createCuentas } from "./AccountsState";

export function createConexionDeCuentas(cuentas: ReturnType<typeof createCuentas>) {
  const { agentes, agente, machineOf, setAgentes, setFallo, setInstalando, lista, cargando, setCargando, setLista, enCurso, setComprobando, setEstados, setSinComprobar, fallo, setEnCurso, setUrl, olvidarEnlaceCopiado, setCopiaFallida, setPorConfirmar, setPideCodigo, setCodigo, setEnviandoCodigo, setCodigoEnviado, setErrorCodigo, setAviso, setSalida, setConexionFallida, setOfrecerTerminal, setEsperando } = cuentas;
  /**
   * `espera` y `recienCreada` son variables: nadie pinta sus valores, y una
   * señal añadiría dependencias reactivas sin consumidores. `espera` conserva
   * el temporizador que ofrece la Terminal; `recienCreada` relaciona el
   * siguiente evento de login con la cuenta que lo inició. `comprobadas`
   * sigue el mismo criterio.
   */
  let espera: number | null = null;
  let recienCreada: string | null = null;
  let lecturaId = 0;
  onCleanup(() => {
    lecturaId++;
  });
  // A cuáles ya se les preguntó. Cambiarla no tiene que repintar nada, y en una
  // señal provocaría justo el render que vuelve a disparar la consulta.
  const comprobadas = new Set<string>();

  function cancelarEspera() {
    if (espera !== null) clearTimeout(espera);
    espera = null;
  }

  const proveedor = () => agentes().find((a) => a.id === agente());
  const terminalLocal = (id: string) => capabilities().nativeWindow && !machineOf(id);
  const externalInstallUrl = () => proveedor()?.external_install_url;
  const faltaExterno = () => !proveedor() || Boolean(externalInstallUrl()) && !proveedor()?.available;
  const [revisandoCli, setRevisandoCli] = createSignal(false);
  const [agregando, setAgregando] = createSignal(false);
  // Se abrió la descarga oficial: «Ya lo instalé» queda pendiente y el grupo no se oculta.
  const [pidioExterno, setPidioExterno] = createSignal(false);

  async function comprobarCli() {
    setRevisandoCli(true);
    try {
      await checkEnvironment({ force: true });
      setAgentes(await listProviders<AgentOpt[]>());
      setFallo(null);
      if (lista() === null && !cargando()) void refrescar();
    } catch (e) {
      setFallo({ what: t("settings.accounts.error.check_provider"), detail: detalleDe(e) });
    } finally {
      setRevisandoCli(false);
    }
  }

  const etiqueta = () => proveedor()?.label ?? t("settings.accounts.agent_fallback");

  /**
   * Dónde corre este agente, que es lo que decide qué se monta aquí dentro.
   *
   * Mientras la tabla no ha llegado no se monta nada: enseñar la superficie de
   * un agente que resulta ser de otra clase es peor que esperar un instante.
   */
  const inferencia = () => agentes().find((a) => a.id === agente())?.inferencia;

  const acto = () =>
    !proveedor()
      ? { boton: t("settings.accounts.check_provider"), curso: t("settings.accounts.preparing") }
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
  const sinCuenta = () => proveedor()?.sin_cuenta ?? false;

  /**
   * Dónde se consigue la API key de este agente, o `null` si se conecta
   * lanzando su CLI. La política compartida contempla OpenCode 2.
   */
  const claveDe = () => agentes().find((a) => a.id === agente())?.api_key;

  /** La cuenta cuya clave se está pidiendo, y lo escrito hasta ahora. */
  const [pidiendoClave, setPidiendoClave] = createSignal<string | null>(null);
  const [clave, setClave] = createSignal("");
  const [guardandoClave, setGuardandoClave] = createSignal(false);
  async function guardarClave() {
    const id = pidiendoClave();
    if (!id || !clave().trim()) return;
    setGuardandoClave(true);
    try {
      await setApiKey({ provider: agente(), id, key: clave() }, machineOf(id));
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
    listProviders<AgentOpt[]>().then(setAgentes)
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
        await openExternal({ target: external });
        setPidioExterno(true);
        setFallo(null);
        return;
      }
      await installProvider({ provider: agente() });
      setAgentes(await listProviders<AgentOpt[]>());
      setFallo(null);
      if (lista() === null && !cargando()) void refrescar();
    } catch (e) {
      const sinEspacio = await textoDeFalta(e, `provider:${agente()}`);
      setFallo(sinEspacio ? { what: sinEspacio, detail: "" } : { what: t("settings.accounts.error.install"), detail: detalleDe(e) });
    } finally {
      setInstalando(null);
    }
  }

  async function refrescar() {
    const id = ++lecturaId;
    // El esqueleto es de la primera lectura. Después, la lista que ya se ve se
    // queda mientras llega la nueva: autenticar o quitar una cuenta no vuelve
    // a vaciar la sección, y cada tarjeta dice su propia carga.
    if (lista() === null) setCargando(true);
    try {
      const res = await listAccounts<AccountList>({ provider: agente() });
      if (id !== lecturaId) return;
      setLista(normalizarListaDeCuentas(res, agente()));
      setFallo(null);
      setCargando(false);
      // `tasks_awaiting_quota` es secundario: las cuentas ya llegaron y el
      // esqueleto no debe quedarse esperando este aviso (puede tardar hasta 60 s por relay).
      void mirarEspera(id);
    } catch (e) {
      if (id !== lecturaId) return;
      // Cargando, vacío y error son tres pantallas distintas: dejar la lista
      // vacía haría que "todavía no agregaste cuentas" apareciera mintiendo.
      setLista(null);
      setFallo({ what: t("settings.accounts.error.list"), detail: detalleDe(e) });
      setCargando(false);
    }
  }

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
      const st = await accountStatus<AccountStatus>({
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
      if (await discardAccount<boolean>({ provider: agente(), id }, machineOf(id))) {
        await refrescar();
      }
    } catch {
      // Que no se pueda tirar no es un error que reportarle a nadie: la cuenta
      // se queda en la lista diciendo que no está conectada, y se borra a mano.
    }
  }

  async function agregar(options?: { headers: Record<string, string> }) {
    if (bloqueoAlta(options?.headers?.["x-terminus-machine"])) return;
    setAgregando(true);
    try {
      // Apagada, esto la enciende (intent del relay) antes de conectar.
      const a = await addAccount<Account>({
        provider: agente(),
        label: "",
      }, options);
      if (!proveedor()) {
        await listProviders<AgentOpt[]>().then(setAgentes).catch(() => {});
      }
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
    } finally {
      setAgregando(false);
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
    setEnviandoCodigo(false);
    setCodigoEnviado(false);
    setErrorCodigo(null);
    setAviso(null);
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
      await loginAccount({ provider: agente(), id, mode: modo }, machineOf(id));
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

  async function mirarEspera(esperadoId?: number) {
    try {
      const enEspera = await tasksAwaitingQuota<EnEspera[]>({ provider: agente() });
      if (esperadoId !== undefined && esperadoId !== lecturaId) return;
      setEsperando(Array.isArray(enEspera) ? enEspera : []);
    } catch {
      if (esperadoId !== undefined && esperadoId !== lecturaId) return;
      setEsperando([]);
    }
  }

  /** El único dueño de «se puede agregar»: el botón, el selector y `agregar()` preguntan aquí. */
  const bloqueoAlta = (targetMachine?: string): BloqueoAlta => {
    const porque = segunda(targetMachine);
    if (enCurso() !== null || agregando()) return { k: "ocupado" };
    return porque ? { k: "segunda", porque } : addBlockedByExternal(proveedor()) ? { k: "externo" } : null;
  };

  /** Por qué no se puede agregar otra cuenta (en la máquina elegida, o en la lista), o `null` si sí. */
  const segunda = (targetMachine?: string) => segundaCuentaBloqueada(lista(), targetMachine);
  return {
    comprobadas, refrescar, comprobar, cancelarEspera, descartarSiVacia, mirarEspera, agregando,
    pidioExterno, faltaExterno, bloqueoAlta, agregar, setPidioExterno, segunda, inferencia, revisandoCli,
    instalarCli, acto, etiqueta, proveedor, externalInstallUrl, comprobarCli, sinCuenta, claveDe, conectar,
    terminalLocal, pidiendoClave, setPidiendoClave, setClave, clave, guardarClave, guardandoClave,
  };
}
