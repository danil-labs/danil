import { createEffect, createSignal, on, onCleanup, onMount } from "solid-js";
import { checkEnvironment } from "../queries/engine-environment";
import { cancelBrowserLogin, checkGitHost, connectGitHost, disconnectGitHost, finishBrowserLogin, gitHostAreas, gitHostAvailableAreas, installGh, selectGitHostArea, startBrowserLogin } from "../queries/engine-git";
import { openExternal } from "../queries/engine-open";
import { listWorkspaces, setWorkspaceHostGithub } from "../queries/engine-workspaces";
import { capabilities, isNoMachines, machineAvailability } from "../../../../host/src/platform.ts";
import { asFailure, detalleDe, type Failure } from "../../../../ui/src/Failure";
import type { Startup, Workspace } from "../queries/workspaces-store";
import { t } from "../../../../ui/src/lib/i18n";
import type { GithubAccountState } from "./GithubAccount";
import { type Provider, type Estado, type Borrador, type Wait, type Area, type ProyectoRemoto, SIN_BORRADOR } from "./ProvidersModel";

export function createProveedores(workspace?: () => string | null | undefined) {
  const initialWorkspace = workspace?.() ?? null;
  const startup = initialWorkspace ? null : listWorkspaces<Startup>();
  // En la web sin workspace abierto, la cuenta se resuelve por el primero de la lista.
  const scope = initialWorkspace
    ? Promise.resolve(initialWorkspace)
    : startup!.then((s) => s.active ?? (capabilities().nativeWindow ? null : s.workspaces[0]?.id) ?? "pending");
  const [scopeId, setScopeId] = createSignal<string | null>(initialWorkspace);
  void scope.then((id) => { if (!scopeId()) setScopeId(id === "pending" ? null : id); }, () => {});
  if (workspace) {
    createEffect(() => {
      const next = workspace();
      if (next) setScopeId(next);
    });
  }
  const [githubAccount, setGithubAccount] = createSignal<GithubAccountState>({ mode: "unknown", connected: false, reauthorize: false, session: null });
  /** La tarjeta local se ve sin sesión de Danil, con un motor sin GitHub de la cuenta o mientras la local manda. */
  const githubLocal = (id: string) => !isNoMachines() && (id !== "github" || githubAccount().mode === "local");
  let disposed = false;
  onCleanup(() => {
    disposed = true;
    for (const [id, state] of Object.entries(ocupado())) {
      if (state === "esperando" || state === "instalando") void cancelarNavegador(id);
    }
  });
  const [cli, setCli] = createSignal<{ available: boolean; version: string | null; managed_supported: boolean; installable: boolean; host_signed_in?: boolean } | null>(null);
  const [loadingCli, setLoadingCli] = createSignal(!isNoMachines());
  const [installingCli, setInstallingCli] = createSignal(false);
  const [cliFailure, setCliFailure] = createSignal<Failure | null>(null);
  async function installCli() {
    setInstallingCli(true);
    setCliFailure(null);
    try {
      await installGh();
      await refreshCli();
    } catch (e) { setCliFailure(asFailure(e)); }
    finally { setInstallingCli(false); }
  }
  async function refreshCli() {
    if (isNoMachines()) {
      setCli(null);
      setCliFailure(null);
      setLoadingCli(false);
      return;
    }
    setLoadingCli(true);
    try {
      const report = await checkEnvironment<{ githubCli?: NonNullable<ReturnType<typeof cli>> }>();
      setCli(report.githubCli ?? null);
    } finally { setLoadingCli(false); }
  }
  onMount(() => { void refreshCli().catch((e) => { if (!isNoMachines()) setCliFailure(asFailure(e)); }); });
  let lastAvailability = machineAvailability().kind;
  createEffect(on(() => machineAvailability().kind, (kind) => {
    const prev = lastAvailability;
    lastAvailability = kind;
    if (kind === prev) return;
    if (kind === "no_machines") {
      setCli(null);
      setCliFailure(null);
      setLoadingCli(false);
      return;
    }
    if (prev === "no_machines" && (kind === "ready" || kind === "offline")) {
      void refreshCli().catch((e) => { if (!isNoMachines()) setCliFailure(asFailure(e)); });
    }
  }, { defer: true }));
  // «Usar el GitHub de esta computadora»: es de esta máquina y no viaja con la cuenta.
  const [hostGithub, setHostGithub] = createSignal(false);
  const [savingHost, setSavingHost] = createSignal(false);
  const [hostFailure, setHostFailure] = createSignal<Failure | null>(null);
  onMount(() => {
    if (!startup) return;
    void startup
      .then((s) => setHostGithub(!!s.workspaces.find((w) => w.id === s.active)?.host_github))
      .catch(() => {});
  });
  // Sólo tiene sentido con un gh con sesión en esta máquina; un motor que no
  // lo publica todavía cae en «hay gh». Encendido se enseña igual, para apagarlo.
  const hostUsable = () => { const c = cli(); return !!c && (c.host_signed_in ?? c.available); };
  async function changeHostGithub(enabled: boolean) {
    const id = await scope;
    if (id === "pending") return;
    const before = hostGithub();
    setHostGithub(enabled);
    setSavingHost(true);
    setHostFailure(null);
    try {
      const w = await setWorkspaceHostGithub<Workspace>({ id, enabled });
      setHostGithub(!!w.host_github);
    } catch (e) {
      setHostGithub(before);
      setHostFailure({ what: t("providers.github.host_mode.save_failed"), detail: detalleDe(e) });
    } finally {
      setSavingHost(false);
    }
  }
  const [lista, setLista] = createSignal<Provider[] | null>(null);
  const [cargando, setCargando] = createSignal(true);
  const [fallo, setFallo] = createSignal<Failure | null>(null);

  // Por proveedor: uno puede fallar mientras el otro va bien.
  const [ocupado, setOcupado] = createSignal<Record<string, Estado>>({});
  const [fallas, setFallas] = createSignal<Record<string, Failure | null>>({});
  const [comprobado, setComprobado] = createSignal<Record<string, boolean>>({});
  const [borradores, setBorradores] = createSignal<Record<string, Borrador>>({});
  const [esperas, setEsperas] = createSignal<Record<string, Wait | null>>({});
  /**
   * A dónde manda el proveedor para terminar de darle acceso, mientras dura
   * esa espera. No es un error que se le enseña a alguien para que lo
   * obedezca: la app abre esa página sola y se queda mirando. Esto solo
   * sostiene el cuadro de espera y el enlace para volver a abrirla si el
   * navegador no salió al frente.
   */
  const [montajes, setMontajes] = createSignal<Record<string, string | null>>({});
  const [choosing, setChoosing] = createSignal<Record<string, boolean>>({});
  const [areas, setAreas] = createSignal<Record<string, Area[] | null>>({});
  const [abierta, setAbierta] = createSignal<Record<string, string | null>>({});
  const [repos, setRepos] = createSignal<
    Record<string, ProyectoRemoto[] | null>
  >({});
  // Cuál se está trayendo, y cuáles ya están. Clavado por `clone_url` y no por
  // slug: dos organizaciones pueden tener un repositorio que se llame igual.
  const [trayendo, setTrayendo] = createSignal<string | null>(null);
  const [traidos, setTraidos] = createSignal<Record<string, boolean>>({});

  function reemplazar(p: Provider) {
    if (disposed) return;
    setLista((l) => (l ? l.map((x) => (x.id === p.id ? p : x)) : l));
  }

  /**
   * Comprobar tiene tres resultados, y esta pantalla los enseña distintos: el
   * proveedor dijo de quién es el token (`conectado`), el proveedor dijo que
   * no vale con 401 o 403 (la conexión se cae, con el motivo), o no se pudo
   * preguntar por falta de red, VPN o un 500 (sin comprobar, con el motivo).
   *
   * Los dos últimos se veían igual y no lo son: el de en medio pide
   * reconectar —el backend ya borró el token del llavero, de donde no se
   * recupera— y el último no pide nada.
   */
  async function comprobar(id: string) {
    setOcupado((o) => ({ ...o, [id]: "comprobando" }));
    setFallas((f) => ({ ...f, [id]: null }));
    try {
      const fresco = await checkGitHost<Provider>({ id, scope: await scope });
      if (fresco.unverified) {
        setFallas((f) => ({ ...f, [id]: fresco.unverified! }));
      }
      reemplazar(fresco);
      if (fresco.connected && fresco.select_area) await verAreas(id);
    } catch (e) {
      // Aquí el proveedor afirmó que el token no vale, y el backend ya lo
      // borró del llavero: dejar guardado un secreto que no sirve no
      // protege nada.
      setFallas((f) => ({ ...f, [id]: asFailure(e) }));
      setLista((l) =>
        l ? l.map((x) => (x.id === id ? { ...x, connected: null } : x)) : l,
      );
    } finally {
      setOcupado((o) => ({ ...o, [id]: null }));
    }
  }

  async function conectar(p: Provider) {
    const b = borradorDe(p.id);
    setOcupado((o) => ({ ...o, [p.id]: "conectando" }));
    setFallas((f) => ({ ...f, [p.id]: null }));
    try {
      const fresco = await connectGitHost<Provider>({
        scope: await scope,
        id: p.id,
        data: b.data,
        token: b.token,
      });
      // El token sale de la memoria del navegador en cuanto el llavero lo tiene:
      // no hay para qué conservarlo aquí.
      setBorradores((x) => ({ ...x, [p.id]: { data: b.data, token: "" } }));
      // Conectar ya preguntó de quién es el token: volver a comprobarlo aquí
      // sería una segunda llamada para saber lo que se acaba de saber.
      setComprobado((c) => ({ ...c, [p.id]: true }));
      reemplazar(fresco);
      if (!disposed && fresco.select_area) {
        setChoosing((current) => ({ ...current, [p.id]: true }));
        await verAreas(p.id);
      }
    } catch (e) {
      setFallas((f) => ({ ...f, [p.id]: asFailure(e) }));
    } finally {
      setOcupado((o) => ({ ...o, [p.id]: null }));
    }
  }

  /**
   * Conectar sin pegar nada: la persona aprueba en su navegador, con la sesión
   * que ya tiene ahí. Lo que vuelve se guarda por el mismo camino que un token
   * pegado — al llavero, y de ahí no sale.
   */
  async function conectarEnNavegador(p: Provider) {
    setOcupado((o) => ({ ...o, [p.id]: "esperando" }));
    setFallas((f) => ({ ...f, [p.id]: null }));
    try {
      const e = await startBrowserLogin<Wait>({ id: p.id, scope: await scope });
      if (disposed) { await cancelarNavegador(p.id); return; }
      setEsperas((x) => ({ ...x, [p.id]: e }));
      // El navegador de la persona ya tiene su sesión; el webview no.
      openExternal({ target: e.url }).catch(() => {});
      // Esta espera dura lo que la persona tarde en aprobar. Mientras, la
      // pantalla enseña el código y el botón de cancelar, que corta de verdad.
      const fresco = await finishBrowserLogin<Provider>({ id: p.id, scope: await scope });
      if (disposed) return;
      setComprobado((c) => ({ ...c, [p.id]: true }));
      reemplazar(fresco);
      setEsperas((current) => ({ ...current, [p.id]: null }));
      setChoosing((current) => ({ ...current, [p.id]: true }));
      if (fresco.setup_url) {
        await configurarAcceso(fresco);
        return;
      }
      if (disposed) return;
      // Conectar termina enseñando lo que se aprobó, no un estado: lo que la
      // persona acaba de elegir en el navegador —una organización entera o
      // tres repositorios— es la única prueba de que la conexión quedó bien.
      await verAreas(p.id);
    } catch (e) {
      setFallas((f) => ({ ...f, [p.id]: asFailure(e) }));
    } finally {
      setEsperas((x) => ({ ...x, [p.id]: null }));
      setOcupado((o) => ({ ...o, [p.id]: null }));
    }
  }

  async function configurarAcceso(p: Provider) {
    if (!p.setup_url || disposed) return;
    setOcupado((o) => ({ ...o, [p.id]: "instalando" }));
    setMontajes((x) => ({ ...x, [p.id]: p.setup_url }));
    setChoosing((x) => ({ ...x, [p.id]: true }));
    setFallas((x) => ({ ...x, [p.id]: null }));
    try {
      await openExternal({ target: p.setup_url });
    } catch (e) {
      setMontajes((x) => ({ ...x, [p.id]: null }));
      setFallas((x) => ({ ...x, [p.id]: asFailure(e) }));
    } finally {
      setOcupado((o) => ({ ...o, [p.id]: null }));
    }
  }

  async function actualizarAcceso(id: string) {
    if (ocupado()[id] || disposed) return;
    setRepos({});
    setAbierta({});
    setChoosing((x) => ({ ...x, [id]: true }));
    const actualizado = await verAreas(id);
    if (actualizado) setMontajes((x) => ({ ...x, [id]: null }));
  }

  async function cancelarNavegador(id: string) {
    const setup = montajes()[id];
    setMontajes((x) => ({ ...x, [id]: null }));
    setChoosing((x) => ({ ...x, [id]: false }));
    cancelBrowserLogin({ id, scope: await scope }).catch(() => {});
    if (setup && !disposed) await verAreas(id);
  }

  async function desconectar(id: string) {
    try {
      await disconnectGitHost({ id, scope: await scope });
      setChoosing((current) => ({ ...current, [id]: false }));
      setAreas((a) => ({ ...a, [id]: null }));
      setAbierta((a) => ({ ...a, [id]: null }));
      setFallas((f) => ({ ...f, [id]: null }));
      setComprobado((c) => ({ ...c, [id]: false }));
      setLista((l) =>
        l ? l.map((x) => (x.id === id ? { ...x, connected: null } : x)) : l,
      );
    } catch (e) {
      setFallas((f) => ({ ...f, [id]: asFailure(e) }));
    }
  }

  async function verAreas(id: string) {
    setOcupado((o) => ({ ...o, [id]: "listando" }));
    setFallas((f) => ({ ...f, [id]: null }));
    setAreas((a) => ({ ...a, [id]: null }));
    try {
      const r = choosing()[id]
        ? await gitHostAvailableAreas<Area[]>({ id, scope: await scope })
        : await gitHostAreas<Area[]>({ id, scope: await scope });
      if (disposed) return false;
      setAreas((a) => ({ ...a, [id]: r }));
      return true;
    } catch (e) {
      setFallas((f) => ({ ...f, [id]: asFailure(e) }));
      return false;
    } finally {
      setOcupado((o) => ({ ...o, [id]: null }));
    }
  }

  async function seleccionar(id: string, area: string, enabled: boolean) {
    setOcupado((o) => ({ ...o, [id]: "listando" }));
    setFallas((f) => ({ ...f, [id]: null }));
    try {
      const result = await selectGitHostArea<Provider>({ id, area, enabled, scope: await scope });
      if (disposed) return;
      reemplazar(result);
      setAbierta({});
      setRepos({});
      await verAreas(id);
    } catch (e) {
      setFallas((f) => ({ ...f, [id]: asFailure(e) }));
    } finally {
      setOcupado((o) => ({ ...o, [id]: null }));
    }
  }

  const borradorDe = (id: string) => borradores()[id] ?? SIN_BORRADOR;
  return {
    setCargando, setLista, scope, setFallo, lista, montajes, actualizarAcceso, ocupado, setRepos, verAreas,
    comprobado, setComprobado, comprobar, abierta, setAbierta, repos, setOcupado, setFallas, setTrayendo,
    setTraidos, cargando, fallo, fallas, borradorDe, areas, choosing, esperas, githubAccount,
    conectarEnNavegador, hostUsable, hostGithub, savingHost, changeHostGithub, hostFailure, scopeId,
    setGithubAccount, githubLocal, desconectar, setChoosing, configurarAcceso, cancelarNavegador, conectar,
    setBorradores, seleccionar, trayendo, traidos, cliFailure, cli, loadingCli, installingCli, installCli,
  };
}
