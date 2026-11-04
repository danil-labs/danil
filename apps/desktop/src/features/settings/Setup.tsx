import {
  createEffect,
  createSignal,
  For,
  getOwner,
  type JSX,
  lazy,
  Match,
  on,
  onCleanup,
  onMount,
  runWithOwner,
  Show,
  Suspense,
  Switch,
} from "solid-js";
import { connected } from "../../lib/engineConnection";
import { t } from "../../lib/i18n";
import { invoke } from "../../lib/invoke.ts";
import { anotarFalta, SIN_ESPACIO, textoSinEspacio } from "../../lib/no-space";
import { capabilities } from "../../lib/platform";
import { listen } from "../../lib/serviceEvents";
import { hasShellCache } from "../../lib/shellCache";
import { cn } from "../../lib/utils";
import { Button } from "../../ui/Button";
import { asFailure, type Failure, FailureNote, prosaDe } from "../../ui/Failure";
import { Toast, ToastPortal } from "../../ui/Toast";
import { esIncluida, fallasIncluidas, funcion } from "../onboarding/bundled";
import type { Conexiones } from "../onboarding/connect-store";
import { accountWelcomeAnswered, offerAccountWelcome } from "../onboarding/account-welcome";
import { crearWorkspace } from "../onboarding/onboarding-store";
import { CabeceraDelAlta } from "../onboarding/Phases";
import type { EstadoDeEtapa, Instalacion } from "../onboarding/Prepare";
import { Escenario, QUIETO, TituloCambiante } from "../onboarding/Stage";
import type { EnvReport } from "./environment-store";

/**
 * La preparación del runtime, por etapas y a la vista, y en la primera vez el
 * alta entera: preparar, conectar la IA en la misma pantalla y personalizar.
 * Lo que falte con la app abierta se repara detrás con un aviso.
 */

type Etapa = { name: string; essential: boolean; state: EstadoDeEtapa; failure?: string };
/** Lo que contesta `prepare_runtime`: el estado de la corrida, la suya o la que ya estaba en curso. */
type Preparacion = { stages: Etapa[]; running: boolean };
type Nota = { type: "note"; stage: string; kind: string; value?: string; extra?: string };
type Evento =
  | { type: "manifest"; stages: { name: string; essential: boolean }[] }
  | { type: "stage"; name: string; state: Exclude<EstadoDeEtapa, "waiting">; durationMs?: number }
  | Nota
  | { type: "output"; stage: string; line: string; stream: "stdout" | "stderr" }
  | { type: "download"; stage: string; done: number; total?: number };
type Avance = { id: string; done: number; bytes: number };
/** El evento `install` del motor: el avance de todo lo que se descarga y se puede cancelar. */
type AvanceDeInstalacion = { operation: string; kind: string; done: number; bytes: number; failure?: unknown };
type Paso = "preparar" | "ia" | "personalizar";

const RANGO: Record<EstadoDeEtapa, number> = { waiting: 0, running: 1, succeeded: 2, failed: 2, skipped: 2 };
const RITMO_CONSEJOS = 5000;
const RITMO_FOTO = 5000;

// Conectar la IA y personalizar solo se cargan en el primer arranque: la carga inicial está en su techo.
const MapaDeConexiones = lazy(() => import("../onboarding/ConnectAI").then((m) => ({ default: m.MapaDeConexiones })));
const PanelDeIA = lazy(() => import("../onboarding/ConnectAI").then((m) => ({ default: m.PanelDeIA })));
const Comprobacion = lazy(() => import("../onboarding/ConnectAI").then((m) => ({ default: m.Comprobacion })));
const Personalizar = lazy(() => import("../onboarding/Personalize"));
const PreparationProgress = lazy(() => import("../onboarding/Prepare").then((m) => ({ default: m.PreparationProgress })));
const FuncionesAfectadas = lazy(() => import("../onboarding/Repair").then((m) => ({ default: m.FuncionesAfectadas })));
const ConectarCuenta = lazy(() => import("../onboarding/ConnectAccount"));

/** El hueco de una tarjeta mientras llega su trozo: mismo borde, sin contenido. */
function TarjetaVacia() {
  return <div class="min-h-0 flex-1 rounded-lg border border-border bg-surface-raised" aria-hidden="true" />;
}

/**
 * El primer frame, antes de saber si hace falta preparar. Con la foto del sidebar
 * de la vez anterior es neutro: a quien ya usa Terminus no le parpadea el alta.
 */
function Esqueleto(props: { preparando: boolean }) {
  return (
    <Show
      when={props.preparando}
      fallback={
        <div class="flex h-full items-center justify-center bg-bg" aria-busy="true" data-setup-skeleton="neutral">
          <Show when={!connected()}>
            <p role="status" class="m-0 text-sm text-neutral-500">{t("shell.engine.connecting")}</p>
          </Show>
        </div>
      }
    >
      <main class="flex h-full flex-col overflow-hidden bg-bg" aria-busy="true" data-setup-skeleton="preparing">
        <CabeceraDelAlta />
        <Escenario
          izquierda={<TituloCambiante titulo={t("setup.title")} />}
          derecha={<TarjetaVacia />}
        />
      </main>
    </Show>
  );
}

export default function Setup(props: { children: JSX.Element }) {
  // En el navegador no hay instalador: cada máquina de la cuenta llega preparada y la app abre sin esperarla.
  if (!capabilities().localSetup) return props.children;
  const conFoto = hasShellCache();
  const [reporte, setReporte] = createSignal<EnvReport | null>(null);
  const [mostrar, setMostrar] = createSignal<boolean | null>(null);
  const [seguir, setSeguir] = createSignal(false);
  const [hayEspacio, setHayEspacio] = createSignal<boolean | null>(null);
  const [fallo, setFallo] = createSignal<string | null>(null);
  // Aparte de `fallo`: el servicio que no contestó deja de ser verdad en cuanto vuelve.
  const [falloDelServicio, setFalloDelServicio] = createSignal<string | null>(null);
  const [corriendo, setCorriendo] = createSignal(false);
  const [etapas, setEtapas] = createSignal<Etapa[]>([]);
  const [activa, setActiva] = createSignal<string | null>(null);
  const [parcial, setParcial] = createSignal(0);
  const [reparando, setReparando] = createSignal(false);
  const [falloDeReparar, setFalloDeReparar] = createSignal<Failure | null>(null);
  const [consejo, setConsejo] = createSignal(0);
  const [sinSoporte, setSinSoporte] = createSignal(false);
  // Lo esencial no cabe en disco: la corrida se para antes de empezar y se reintenta entera.
  const [sinEspacio, setSinEspacio] = createSignal<string | null>(null);
  const [bloqueado, setBloqueado] = createSignal(false);
  const [paso, setPaso] = createSignal<Paso>("preparar");
  const [entrando, setEntrando] = createSignal(false);
  const [workspace, setWorkspace] = createSignal<{ id: string; nombre: string } | null>(null);
  const [cuentaRespondida, setCuentaRespondida] = createSignal(accountWelcomeAnswered());
  let tope = { total: -1, valor: 0 };

  const [conexiones, setConexiones] = createSignal<Conexiones | null>(null);
  const dueño = getOwner();

  const consejos = () => [
    [t("setup.tips.agents.title"), t("setup.tips.agents.body")],
    [t("setup.tips.context.title"), t("setup.tips.context.body")],
    [t("setup.tips.workspaces.title"), t("setup.tips.workspaces.body")],
    [t("setup.tips.memory.title"), t("setup.tips.memory.body")],
  ];
  function nombre(stage: string) {
    if (stage === "platform") return t("setup.stage.platform");
    if (stage === "work-tools") return t("setup.stage.work_tools");
    // Un motor anterior aún manda una etapa por herramienta: se nombra por su función.
    if (esIncluida(stage)) return funcion(stage);
    return reporte()?.items.find((r) => r.id === stage)?.label ?? stage;
  }

  function recibirNota(e: Nota) {
    const valor = e.value ?? "";
    if (e.kind === "no_space" && e.stage === "platform") {
      setSinEspacio(textoSinEspacio({ needed: valor, free: e.extra }));
    } else if (e.kind === "unsupported") {
      setSinSoporte(true);
      setFallo(t("setup.unsupported_detail", { version: valor, minimum: e.extra ?? "" }));
    } else if (e.kind === "failed" && valor !== SIN_ESPACIO && !sinSoporte()) {
      setFallo(valor || t("setup.status.failed"));
    }
  }

  // Una etapa puede llegar por evento antes que la respuesta que trae el manifiesto.
  const vistas = new Map<string, EstadoDeEtapa>();
  const masAvanzado = (a: EstadoDeEtapa, b?: EstadoDeEtapa) => (b && RANGO[b] > RANGO[a] ? b : a);

  // La foto manda; un evento que ya llegó más lejos no retrocede.
  function adoptar(p: Preparacion) {
    setEtapas(p.stages.map((s) => ({ ...s, state: masAvanzado(s.state, vistas.get(s.name)) })));
  }

  function recibir(e: Evento) {
    switch (e.type) {
      case "manifest":
        // Un manifiesto abre una corrida: la de un servicio anterior ya no cuenta.
        vistas.clear();
        setFallo(null);
        setSinSoporte(false);
        setSinEspacio(null);
        setEtapas(e.stages.map((s) => ({ ...s, state: "waiting" })));
        return;
      case "stage": {
        vistas.set(e.name, masAvanzado(e.state, vistas.get(e.name)));
        setEtapas((antes) => antes.map((s) => (s.name === e.name ? { ...s, state: e.state } : s)));
        if (e.state === "running") {
          setActiva(e.name);
          setParcial(0);
        }
        return;
      }
      case "note":
        recibirNota(e);
        return;
      case "output":
        return;
      case "download":
        if (e.total) {
          setParcial(e.done / e.total);
        }
        return;
    }
  }

  const escuchaEtapas = listen<Evento>("bootstrap-run", (e) => recibir(e.payload));
  // Este oyente vive mientras viva la app: anota para todas las pantallas lo que no cupo en disco.
  const escuchaInstalaciones = listen<AvanceDeInstalacion>("install", (e) => anotarFalta(e.payload));
  // Las herramientas administradas bajan por `toolchain::install_tool`, que ya reporta su avance por aquí.
  const escuchaHerramientas = listen<Avance>("toolchain", (e) => {
    if (e.payload.id !== activa() || e.payload.bytes <= 0) return;
    setParcial(e.payload.done / e.payload.bytes);
  });
  let streamCursor: number | null = null;
  let streamRuntime: string | null = null;
  let streamClosed = false;
  let streamTimer: ReturnType<typeof setTimeout> | undefined;
  async function readSetupEvents() {
    if (streamClosed || seguir() || mostrar() === false) return;
    try {
      const page = await invoke<{ cursor: number | null; runtime: string; reset?: boolean }>("service_poll", {
        cursor: streamCursor, workspace: null, runtime: streamRuntime, replay: false, setup: true,
      });
      streamCursor = page.cursor;
      streamRuntime = page.runtime;
      setFalloDelServicio(null);
      // Un servicio nuevo no sabe de la corrida del anterior: se le pide que la arranque o se una.
      // Su manifiesto queda antes de la lectura desde el final: sin limpiar aquí, se repite la corrida muerta.
      if (page.reset && corriendo()) {
        vistas.clear();
        void consultar();
      }
    } catch {
      if (!streamClosed) setFalloDelServicio(t("setup.error_check"));
    }
    if (!streamClosed) streamTimer = setTimeout(() => void readSetupEvents(), 250);
  }
  const streamReady = Promise.all([escuchaEtapas, escuchaHerramientas, escuchaInstalaciones]).then(readSetupEvents);
  onCleanup(() => {
    streamClosed = true;
    if (streamTimer) clearTimeout(streamTimer);
    void escuchaEtapas.then((f) => f());
    void escuchaHerramientas.then((f) => f());
    void escuchaInstalaciones.then((f) => f());
  });

  async function preparar() {
    await streamReady;
    setCorriendo(true);
    await consultar(false);
  }

  // `joinOnly` no arranca otra corrida en el servicio que ya tuvo una.
  async function consultar(joinOnly = true) {
    let corrida: Preparacion | null = null;
    try {
      corrida = await invoke<Preparacion | null>("prepare_runtime", { joinOnly });
    } catch (e) {
      // Sin parar de preguntar: un servicio que vuelve retoma la corrida y borra el aviso.
      setFalloDelServicio(prosaDe(e));
      return;
    }
    setFalloDelServicio(null);
    if (corrida?.stages?.length) adoptar(corrida);
    // Un servicio anterior contesta sin estado cuando otra corrida lo tiene.
    else if (!etapas().length && !fallo()) setFallo(t("setup.error_in_flight"));
    const sigue = corrida?.running === true && !cerrada();
    setCorriendo(sigue);
    if (sigue) return;
    try {
      // Instalar ya tiró el reporte (`env::olvidar`), y lo instalado estrena
      // archivo: la huella no acierta y se vuelve a sondear solo eso.
      const r = await invoke<EnvReport>("check_environment", { force: false });
      setReporte(r);
      setBloqueado(r?.blocked === true);
    } catch {
      // El reporte anterior sigue sirviendo para nombrar las etapas.
    }
  }

  createEffect(
    on(corriendo, (sigue) => {
      if (!sigue) return;
      const id = setInterval(() => void consultar(), RITMO_FOTO);
      onCleanup(() => clearInterval(id));
    }),
  );

  function contarEspacios() {
    invoke<{ workspaces: { id: string; name: string }[]; active: string | null }>("list_workspaces")
      .then((s) => {
        setHayEspacio(s.workspaces.length > 0);
        const activo = s.workspaces.find((w) => w.id === s.active);
        if (activo) setWorkspace({ id: activo.id, nombre: activo.name });
      })
      .catch(() => setHayEspacio(null));
  }

  /**
   * Decide el primer pintado con un `stat`, y deja el reporte para después.
   *
   * Este componente es la compuerta de la app entera: mientras `mostrar()` es
   * `null` la ventana pinta un div vacío. Todo lo que se espere aquí es tiempo
   * en blanco.
   */
  async function empezar() {
    setFallo(null);
    // Con la foto del sidebar de la vez anterior la preparación ya se hizo: la app
    // monta sin esperar al motor y esta pantalla vuelve solo si el motor dice que falta.
    const optimista = mostrar() === null && !connected() && conFoto;
    if (optimista) setMostrar(false);
    // A la vez: el reporte no depende de si hace falta la preparación.
    const reporteEnCurso = invoke<EnvReport>("check_environment", { force: false });
    reporteEnCurso.catch(() => {});
    let primera = false;
    try {
      primera = await invoke<boolean>("setup_required");
    } catch (e) {
      setFallo(prosaDe(e));
      if (!optimista) setMostrar(true);
      return;
    }
    if (mostrar() === null || (optimista && primera)) setMostrar(primera);
    if (mostrar()) contarEspacios();

    let r: EnvReport;
    try {
      r = await reporteEnCurso;
      if (!r) throw new Error(t("setup.error_check"));
    } catch (e) {
      // Con la app pintada no se cambia de pantalla: Estado del entorno enseña su propio error.
      setFallo(prosaDe(e));
      return;
    }
    setReporte(r);
    setBloqueado(r.blocked === true);
    if (primera || (r.bootstrap ?? []).length > 0) await preparar();
  }

  onMount(() => void empezar());

  const temporizador = setInterval(() => {
    if (!QUIETO() && !seguir() && paso() === "preparar") setConsejo((c) => (c + 1) % consejos().length);
  }, RITMO_CONSEJOS);
  onCleanup(() => clearInterval(temporizador));

  const corridaHecha = () =>
    etapas().length > 0 && etapas().every((s) => s.state === "succeeded" || s.state === "failed" || s.state === "skipped");
  const falloEsencial = () => sinEspacio() !== null || etapas().some((s) => s.essential && s.state === "failed");
  const cerrada = () => corridaHecha() || falloEsencial();
  createEffect(() => {
    if (cerrada()) setCorriendo(false);
  });
  const terminado = () => corridaHecha();
  const fin = terminado;
  const elegidas = () => etapas().filter((s) => s.state !== "skipped");
  const hechas = () => elegidas().filter((s) => ["succeeded", "failed"].includes(s.state)).length;
  /** Lo incluido que no pasó la comprobación, con la función que afecta. */
  const fallas = () =>
    fallasIncluidas(
      reporte(),
      etapas().filter((s) => s.state === "failed").map((s) => s.name),
    );
  const conFallas = () => fallas().length > 0;
  // Un solo avance para toda la preparación, que nunca retrocede.
  const porcentaje = () => {
    if (!etapas().length) return 0;
    if (fin()) return 100;
    const total = Math.max(1, elegidas().length);
    const enCurso = corriendo() ? Math.min(parcial(), 0.99) : 0;
    const valor = Math.round(((hechas() + enCurso) / total) * 100);
    if (tope.total !== total) tope = { total, valor };
    tope.valor = Math.max(tope.valor, valor);
    return tope.valor;
  };

  const nombreAReparar = () => {
    const fallida = etapas().find((s) => s.essential && s.state === "failed");
    if (fallida) return nombre(fallida.name);
    const esencial = (reporte()?.bootstrap ?? []).find((id) => reporte()?.essential?.includes(id));
    return esencial ? nombre(esencial) : "";
  };
  // Cerrar el aviso solo descarta lo que dice ahora: si la instalación pasa a
  // fallar, el aviso de error vuelve a salir.
  const claveDelAviso = () => `${falloEsencial() ? "failed" : "running"}:${nombreAReparar()}`;
  const [descartado, setDescartado] = createSignal<string | null>(null);
  const aviso = () =>
    mostrar() === false && bloqueado() && (corriendo() || falloEsencial()) && descartado() !== claveDelAviso();

  function abrirEntorno() {
    window.dispatchEvent(new CustomEvent("harness:open-settings", { detail: "entorno" }));
  }

  const instalacion = (): Instalacion => ({
    titulo: sinSoporte()
      ? t("setup.status.unsupported")
      : falloEsencial()
        ? t("setup.status.failed")
        : fin()
          ? conFallas() ? t("setup.simple.essentials_ready") : t("setup.simple.done")
          : t("setup.status.checking"),
    porcentaje: porcentaje(),
    terminado: fin() && !falloEsencial(),
    fallido: !corriendo() && (falloEsencial() || sinSoporte()),
  });

  /** «Reparar»: el motor verifica todo lo incluido, limpia su estado y vuelve a comprobar. */
  async function reparar() {
    if (reparando()) return;
    setReparando(true);
    setFalloDeReparar(null);
    try {
      await invoke("install_tool", { tool: "bundled-work-tools" });
    } catch (e) {
      setFalloDeReparar({ ...asFailure(e), what: t("setup.functions.repair_failed") });
    }
    try {
      const r = await invoke<EnvReport>("check_environment", { force: true });
      setReporte(r);
      setBloqueado(r?.blocked === true);
      if (etapas().some((s) => s.state === "failed")) await preparar();
    } catch (e) {
      setFalloDeReparar((antes) => antes ?? { ...asFailure(e), what: t("setup.error_check") });
    } finally {
      setReparando(false);
    }
  }

  /** El workspace «Personal» nace aquí, que es de quien cuelgan las cuentas de la IA, y los proveedores se cargan. */
  let preparadas: Promise<void> | null = null;
  function prepararConexiones() {
    preparadas ??= (async () => {
      if (!workspace()) {
        const w = await crearWorkspace(t("onboarding.workspace.default"));
        setWorkspace({ id: w.id, nombre: t("onboarding.workspace.default") });
      }
      if (!conexiones()) {
        const [{ crearConexiones }] = await Promise.all([import("../onboarding/connect-store"), import("../onboarding/ConnectAI")]);
        runWithOwner(dueño, () => setConexiones(crearConexiones()));
      }
      await conexiones()?.cargar();
    })().catch((e) => {
      preparadas = null;
      throw e;
    });
    return preparadas;
  }

  /** «Siguiente». */
  async function aConectar() {
    if (entrando()) return;
    setEntrando(true);
    setFallo(null);
    try {
      await prepararConexiones();
      setPaso("ia");
    } catch (e) {
      setFallo(prosaDe(e));
    } finally {
      setEntrando(false);
    }
  }

  const alta = () => hayEspacio() === false;
  /** «Conecta tu cuenta de Danil» va antes que todo el alta, y solo una vez por computadora. */
  const pideCuenta = () => offerAccountWelcome(alta(), cuentaRespondida());

  createEffect(() => {
    if (paso() === "preparar" && fin() && alta() && !pideCuenta() && !falloEsencial() && !sinSoporte() && !conFallas() && !fallo() && !falloDelServicio()) {
      void aConectar();
    }
  });
  const ia = () => paso() === "ia";
  const conectadas = () => conexiones()?.conectadas() ?? [];
  const nombres = () => conectadas().map((f) => conexiones()?.nombre(f) ?? f.label);

  const titulo = () => {
    if (ia()) return t("onboarding.ai.title");
    if (terminado() && !falloEsencial() && !conFallas()) return t("setup.done_title");
    return t("setup.title");
  };
  const izquierda = () => (
    <>
      <TituloCambiante titulo={titulo()} />
      <Show when={fallo() ?? falloDelServicio()}>
        {(f) => (
          <div class="mt-6 w-full">
            <FailureNote f={asFailure(f())} />
          </div>
        )}
      </Show>
      <Show when={!ia() && !corriendo() && conFallas()}>
        <div class="mt-6 w-full">
          <Suspense>
          <FuncionesAfectadas
            fallas={fallas()}
            reparando={reparando()}
            error={falloDeReparar()}
            onReparar={() => void reparar()}
            onReiniciar={() => void invoke("restart_app")}
          />
          </Suspense>
        </div>
      </Show>
      <Show when={!ia() && !corriendo() && sinEspacio()}>
        {(texto) => (
          <div class="mt-6 w-full">
            <FailureNote f={{ what: texto(), detail: "" }} />
          </div>
        )}
      </Show>
      {/* En «Conecta tu IA» el mapa va al centro del alto libre y la comprobación queda abajo. */}
      <div class={cn("w-full", ia() ? "flex min-h-0 flex-1 flex-col" : "mt-auto")}>
        <Show
          when={ia()}
          fallback={
            <div class="border-t border-border pt-5">
              <p class="m-0 text-xs text-neutral-500">{t("setup.tips.eyebrow")}</p>
              <h2 class="m-0 mt-2 mb-1.5 text-base font-display font-bold tracking-[-0.01em] text-neutral-950">
                {consejos()[consejo()][0]}
              </h2>
              <p class="m-0 min-h-[58px] max-w-[42ch] text-ui text-neutral-500">{consejos()[consejo()][1]}</p>
              <div class="mt-2.5 flex gap-1.5">
                <For each={consejos()}>
                  {(_, i) => (
                    <button
                      type="button"
                      class={cn(
                        "size-[9px] cursor-pointer rounded-full outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                        i() === consejo() ? "bg-primary" : "bg-border-strong",
                      )}
                      aria-label={t("setup.tips.go", { number: i() + 1 })}
                      aria-pressed={i() === consejo()}
                      onClick={() => setConsejo(i())}
                    />
                  )}
                </For>
              </div>
            </div>
          }
        >
          <Suspense>
          <div class="flex flex-1 flex-col justify-center">
            <Show when={conexiones()}>{(c) => <MapaDeConexiones c={c()} />}</Show>
          </div>
          <div class="mt-4 border-t border-border pt-4">
            <Comprobacion
              filas={[
                { hecho: true, texto: t("onboarding.check.environment") },
                {
                  hecho: conectadas().length > 0,
                  texto: conectadas().length
                    ? t("onboarding.check.ai_connected", {
                        count: conectadas().length,
                        names: nombres().join(", "),
                      })
                    : t("onboarding.check.ai_pending"),
                },
                { hecho: false, texto: t("onboarding.check.personalize") },
              ]}
            />
          </div>
          </Suspense>
        </Show>
      </div>
    </>
  );

  const CAPA =
    "absolute inset-0 flex flex-col gap-2.5 transition-[translate,opacity] duration-[420ms] ease-[cubic-bezier(.2,.7,.2,1)] motion-reduce:transition-none";

  const derecha = () => (
    <div class="relative min-h-0 flex-1">
      <div class={cn(CAPA, ia() && "pointer-events-none -translate-x-[90px] opacity-0")} inert={ia() || undefined}>
        <Suspense fallback={<TarjetaVacia />}>
        <PreparationProgress i={instalacion()} />
        </Suspense>
      </div>
      <Show when={alta()}>
        <div class={cn(CAPA, !ia() && "pointer-events-none translate-x-[70px] opacity-0")} inert={!ia() || undefined}>
          <Suspense>
            <Show when={conexiones()}>{(c) => <PanelDeIA c={c()} />}</Show>
          </Suspense>
        </div>
      </Show>
    </div>
  );

  const pie = () => (
    <footer class="flex flex-wrap items-center gap-2.5 border-t border-border px-5 py-3.5">
      <Show
        when={ia()}
        fallback={
          <>
            <p class="m-0 text-xs text-neutral-500">{t("setup.footer")}</p>
            <span class="flex-1" />
            {/* Lo incluido se repara con «Reparar»; esto reintenta cuando no hay nada que reparar. */}
            <Show when={!sinSoporte() && (falloDelServicio() || (!corriendo() && !conFallas() && (fallo() || falloEsencial())))}>
              <Button size="sm" variant="secondary" onClick={() => void empezar()}>
                {t("setup.retry")}
              </Button>
            </Show>
            <Show when={!falloEsencial() && !sinSoporte()}>
              <Show when={terminado() && alta() && workspace() && conectadas().length > 0}>
                <Button size="sm" variant="ghost" onClick={() => setPaso("ia")}>
                  {t("setup.back_to_ai")}
                </Button>
              </Show>
              <Button
                size="sm"
                disabled={!terminado() || entrando()}
                onClick={() => (alta() ? void aConectar() : setSeguir(true))}
              >
                {alta() ? t("setup.next.ai") : t("setup.next.app")}
              </Button>
            </Show>
          </>
        }
      >
        <span class="flex-1" />
        <Button size="sm" disabled={conectadas().length === 0} onClick={() => setPaso("personalizar")}>
          {t("onboarding.continue")}
        </Button>
      </Show>
    </footer>
  );

  return (
    <Switch
      fallback={
        <>
          {props.children}
          <Show when={aviso()}>
            <ToastPortal>
              <Toast
                tone={falloEsencial() ? "error" : "status"}
                data-setup-repair=""
                onDismiss={() => setDescartado(claveDelAviso())}
              >
                <p class="m-0 break-words text-xs text-neutral-950">
                  {falloEsencial()
                    ? t("setup.repair.failed", { name: nombreAReparar() })
                    : t("setup.repair.running", { name: nombreAReparar() })}
                </p>
                <Show when={falloEsencial()}>
                  <div>
                    <Button variant="outline" size="compact" onClick={abrirEntorno}>
                      {t("setup.repair.open")}
                    </Button>
                  </div>
                </Show>
              </Toast>
            </ToastPortal>
          </Show>
        </>
      }
    >
      <Match when={mostrar() === null}>
        <Esqueleto preparando={!conFoto} />
      </Match>
      <Match when={mostrar() && !seguir()}>
        <main class="flex h-full flex-col overflow-hidden bg-bg">
          <CabeceraDelAlta fase={alta() ? (paso() === "personalizar" ? 1 : 0) : undefined} />
          <Show
            when={!pideCuenta()}
            fallback={
              <Suspense fallback={<TarjetaVacia />}>
                <ConectarCuenta
                  onListo={(r) => {
                    if (r.workspace) setWorkspace(r.workspace);
                    setCuentaRespondida(true);
                  }}
                />
              </Suspense>
            }
          >
          <Show
            when={paso() === "personalizar"}
            fallback={
              <>
                <Escenario izquierda={izquierda()} derecha={derecha()} />
                {pie()}
              </>
            }
          >
            <Suspense fallback={<TarjetaVacia />}>
              <Personalizar
                workspace={workspace()}
                ia={nombres()}
                onAtras={() => setPaso("ia")}
                onListo={() => setSeguir(true)}
              />
            </Suspense>
          </Show>
          </Show>
        </main>
      </Match>
    </Switch>
  );
}
