import { createEffect, on, onCleanup, onMount } from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { listProviders, removeAccount, renameAccount, resumeAwaitingQuota, setActiveAccount, submitLoginCode } from "../queries/engine-accounts";
import { openExternal } from "../queries/engine-open";
import { listen } from "../../../../../apps/desktop/src/lib/serviceEvents";
import { detalleDe } from "../../../../ui/src/Failure";
import { type AgentOpt, type LoginEvent } from "../queries/accounts-store";
import type { createCuentas } from "./AccountsState";
import type { createConexionDeCuentas } from "./AccountsConnect";

export function createAccionesDeCuentas(cuentas: ReturnType<typeof createCuentas>, conexion: ReturnType<typeof createConexionDeCuentas>) {
  const { agente, setEstados, setSinComprobar, setPorQuitar, setLista, lista, enCurso, setUrl, setPorConfirmar, setPideCodigo, setEnCurso, setSalida, setConexionFallida, setAgentes, setConectadaVez, setOfrecerTerminal, setCopiaFallida, copiarLaUrl, codigo, machineOf, setCodigo, setFallo, setRepuestas, setReponiendo } = cuentas;
  const { comprobadas, refrescar, comprobar, cancelarEspera, descartarSiVacia, mirarEspera } = conexion;
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
      onCleanup(() => (vivo = false));
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
        openExternal({ target: text }).catch(() => {});
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
        void listProviders<AgentOpt[]>().then(setAgentes).catch(() => {});
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
      void listProviders<AgentOpt[]>().then(setAgentes).catch(() => {});
    });
    onCleanup(() => void cambios.then((f) => f()));
  });

  async function copiarEnlace(u: string) {
    setCopiaFallida(null);
    await copiarLaUrl(u);
  }

  async function enviarCodigo() {
    const id = enCurso();
    if (!id || !codigo().trim()) return;
    try {
      await submitLoginCode({ id, code: codigo() }, machineOf(id));
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
      await setActiveAccount({ provider: agente(), id }, machineOf(id));
      await refrescar();
    } catch (e) {
      setFallo({ what: t("settings.accounts.error.activate"), detail: detalleDe(e) });
    }
  }

  async function reponer() {
    setReponiendo(true);
    try {
      const n = await resumeAwaitingQuota<number>({ provider: agente() });
      setRepuestas(n);
      await mirarEspera();
    } catch (e) {
      setFallo({ what: t("settings.accounts.error.resume"), detail: detalleDe(e) });
    } finally {
      setReponiendo(false);
    }
  }

  async function renombrar(id: string, label: string) {
    try {
      await renameAccount({ provider: agente(), id, label }, machineOf(id));
      await refrescar();
    } catch (e) {
      setFallo({ what: t("settings.accounts.error.rename"), detail: detalleDe(e) });
    }
  }

  async function quitar(id: string) {
    setPorQuitar(null);
    try {
      await removeAccount({ provider: agente(), id }, machineOf(id));
      setConexionFallida((f) => (f?.id === id ? null : f)); // Su panel ofrecería «Reintentar» sobre una cuenta que ya no existe.
      await refrescar();
    } catch (e) {
      setFallo({ what: t("settings.accounts.error.remove"), detail: detalleDe(e) });
    }
  }
  return { reponer, usar, quitar, renombrar, copiarEnlace, enviarCodigo };
}
