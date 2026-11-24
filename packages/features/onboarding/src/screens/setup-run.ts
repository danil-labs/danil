import { createEffect, createSignal, type JSX, on, onCleanup, onMount } from "solid-js";
import { connected } from "../../../../session/src/engineConnection.ts";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { anotarFalta, SIN_ESPACIO, textoSinEspacio } from "../../../../../apps/desktop/src/lib/no-space";
import { listen } from "../../../../host/src/serviceEvents.ts";
import { asFailure, prosaDe } from "../../../../ui/src/Failure";
import { esIncluida, fallasIncluidas, funcion } from "../model/bundled";
import type { EstadoDeEtapa, Instalacion } from "../components/Prepare";
import type { EnvReport } from "../../../../ui/src/lib/bundled";
import type { EstadoDelAlta } from "./setup-state";
import type { ControlesDeVentanaDelShell, SellarWorkspaceFree } from "../model/shell-port";

export type SetupProps = {
  children: JSX.Element;
  checkEnvironment: <res = unknown>(args?: { force?: boolean }) => Promise<res>;
  installTool: <res = unknown>(args?: { tool: string }) => Promise<res>;
  prepareRuntime: <res = unknown>(args?: { joinOnly?: boolean }) => Promise<res>;
  restartApp: <res = unknown>() => Promise<res>;
  servicePoll: <res = unknown>(args?: {
    cursor: number | null;
    workspace: null;
    runtime: string | null;
    replay: boolean;
    setup: boolean;
  }) => Promise<res>;
  setupRequired: <res = unknown>() => Promise<res>;
  listWorkspaces: <res = unknown>() => Promise<res>;
  /** Lo enchufa el shell (R3). */
  sealFirstFreeWorkspace: SellarWorkspaceFree;
  ControlesDeVentana: ControlesDeVentanaDelShell;
};

export type Etapa = { name: string; essential: boolean; state: EstadoDeEtapa; failure?: string };
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

const RANGO: Record<EstadoDeEtapa, number> = { waiting: 0, running: 1, succeeded: 2, failed: 2, skipped: 2 };
const RITMO_FOTO = 5000;

/** La corrida de preparación: los eventos del motor, la consulta, el avance y «Reparar». */
export function crearCorridaDelAlta(props: SetupProps, estado: EstadoDelAlta) {
  const {
    reporte, setReporte, mostrar, setMostrar, seguir, setHayEspacio, fallo, setFallo, setFalloDelServicio,
    corriendo, setCorriendo, etapas, setEtapas, activa, setActiva, parcial, setParcial, reparando,
    setReparando, setFalloDeReparar, sinSoporte, setSinSoporte, sinEspacio, setSinEspacio, bloqueado,
    setBloqueado, setWorkspace, conFoto,
  } = estado;
  let tope = { total: -1, valor: 0 };

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
      const page = await props.servicePoll<{ cursor: number | null; runtime: string; reset?: boolean }>({
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
      corrida = await props.prepareRuntime<Preparacion | null>({ joinOnly });
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
      const r = await props.checkEnvironment<EnvReport>({ force: false });
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
    props.listWorkspaces<{ workspaces: { id: string; name: string }[]; active: string | null }>()
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
    const reporteEnCurso = props.checkEnvironment<EnvReport>({ force: false });
    reporteEnCurso.catch(() => {});
    let primera = false;
    try {
      primera = await props.setupRequired<boolean>();
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
      await props.installTool({ tool: "bundled-work-tools" });
    } catch (e) {
      setFalloDeReparar({ ...asFailure(e), what: t("setup.functions.repair_failed") });
    }
    try {
      const r = await props.checkEnvironment<EnvReport>({ force: true });
      setReporte(r);
      setBloqueado(r?.blocked === true);
      if (etapas().some((s) => s.state === "failed")) await preparar();
    } catch (e) {
      setFalloDeReparar((antes) => antes ?? { ...asFailure(e), what: t("setup.error_check") });
    } finally {
      setReparando(false);
    }
  }

  return {
    empezar, terminado, fin, falloEsencial, fallas, conFallas, nombreAReparar, claveDelAviso, setDescartado,
    aviso, instalacion, reparar,
  };
}
