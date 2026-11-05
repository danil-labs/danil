import { For, Match, Show, Suspense, Switch, createEffect, createSignal, lazy, on, onCleanup, onMount } from "solid-js";
import { invoke } from "../../lib/invoke.ts";
import { FailureNote, asFailure, detalleDe, type Failure } from "../../ui/Failure";
import { Skeleton } from "../../ui/Skeleton";
import { MarcaGitHost } from "../../ui/icons";
import { listGitHosts, type GitHost } from "../../lib/gitHosts.ts";
import type { Startup, Workspace } from "./workspaces-store";
import { manifiesto, t } from "../../lib/i18n";
import { prosa, type Frase } from "../../lib/prose";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Input";
import { Toggle } from "../../ui/Toggle";
import Ellipsis from "lucide-solid/icons/ellipsis";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "../../ui/DropdownMenu";
import { SettingsBlock, SettingsPanel, SettingsRow, SettingsSection } from "./layout";
import type { GithubAccountState } from "./github-account/GithubAccount";
import { ExternalLink } from "../../ui/ExternalLink";
import "../../locales/settingsPhrases";

// La tarjeta de Drive es la del alta; su chunk solo lo carga quien abre Fuentes.
const Integraciones = lazy(() => import("../onboarding/ToolCards").then((m) => ({ default: m.Integraciones })));
// GitHub de la cuenta de Danil: con sesión, su tarjeta reemplaza la local.
const GithubAccount = lazy(() => import("./github-account/GithubAccount"));
const CredentialsInUse = lazy(() => import("./credentials/AccountCredentials").then((m) => ({ default: m.CredentialsInUse })));
const LocalKeysBanner = lazy(() => import("./credentials/AccountCredentials").then((m) => ({ default: m.LocalKeysBanner })));

/**
 * Proveedores de código: de dónde salen los proyectos de la organización.
 *
 * No es la sección de cuentas: una cuenta de agente sirve para correr Claude
 * o Codex con la suscripción de la persona, y su credencial la guarda el CLI.
 * Un proveedor sirve para leer el código de la organización, y esa
 * credencial la guarda la app, en el llavero.
 *
 * Aquí no se clona nada: esta superficie contesta qué alcanza esta conexión.
 */

/**
 * Un dato no secreto del formulario. Los tres textos son claves que declara
 * el módulo del proveedor; `falta` es lo que se dice cuando el campo va
 * vacío, escrito entero y no compuesto con los otros dos: el orden de las
 * palabras cambia con la lengua (`git_hosts::Field`).
 */
type Campo = { id: string; label: Frase; help: Frase; falta: Frase; required: boolean };

type Identidad = { user: string; name: string };

type Connection = {
  /** `repository_ids` es de conexiones anteriores: el motor ya no lo usa. */
  selected_area: { key: string; installation_id: number | null; repository_ids?: number[] | null } | null;
  selected_areas: { key: string; installation_id: number | null; repository_ids?: number[] | null }[];
  data: Record<string, string>;
  workspace: string;
  identity: Identidad;
  connected_at: number;
};

type Provider = GitHost & {
  select_area: boolean;
  setup_url: string | null;
  fields: Campo[];
  /**
   * Los rótulos del formulario son claves, no frases: las declara el módulo
   * del proveedor (`providers/bitbucket.rs`, `providers/github.rs`) y las
   * traduce quien pinta. Ver `lib/prose.ts`.
   */
  token_label: Frase;
  token_help: Frase;
  /** La página donde se crea el token. Es un dato: una dirección no se traduce. */
  token_url: string;
  area_label: Frase;
  areas_label: Frase;
  area_help: Frase;
  /** Uno de los dos deja aprobar desde el navegador y el otro no puede: pegar
   *  un token no es el camino viejo, es el único que sirve en los dos, y no
   *  se puede quitar de la pantalla. */
  browser_login: boolean;
  login_help: Frase;
  connected: Connection | null;
  /** GitHub: `account` (cuenta de Danil), `device` (App Danil en esta máquina) o
   *  `legacy` (la de antes). Un motor anterior no lo manda: sin él, como antes. */
  source?: "account" | "device" | "legacy";
  /** Por qué no se pudo comprobar la conexión: sin red, fuera de la VPN, el
   *  proveedor caído. Con esto puesto la conexión sigue en pie y el token
   *  sigue en el llavero: lo que falló fue preguntar, no el token. */
  unverified: Failure | null;
};

/** Lo que hay que aprobar en el navegador. El código es de un solo uso y no
 *  es la credencial: este sí se muestra, y grande. */
type Wait = { code: string; url: string; expires_at: number };

/** Lo que devuelve `listar_proyectos`: un conjunto de código en un proveedor,
 *  una organización entera en otro. Cada uno dice cómo llamarlo. */
type Area = { key: string; name: string };

/** Lo que devuelve `repos_de`. Cada uno es un proyecto en potencia — todavía no
 *  se trae ninguno. */
type ProyectoRemoto = {
  slug: string;
  name: string;
  clone_url: string;
  branch: string;
};

type Estado =
  | "conectado"
  | "comprobando"
  | "conectando"
  | "esperando"
  | "instalando"
  | "listando"
  | null;

type Borrador = { data: Record<string, string>; token: string };

const SIN_BORRADOR: Borrador = { data: {}, token: "" };

/**
 * `solo` limita el catálogo a uno o varios proveedores. Configuración los
 * compone por sección sin volver a hacer de cada uno un destino del riel.
 */
export default function Providers(props: { solo?: string | string[] }) {
  const [generation, setGeneration] = createSignal(1);
  onMount(() => {
    const changed = () => setGeneration((n) => n + 1);
    window.addEventListener("harness:workspace", changed);
    onCleanup(() => window.removeEventListener("harness:workspace", changed));
  });
  return (
    <Show when={generation()} keyed>
      {(_generation) => <WorkspaceProviders solo={props.solo} />}
    </Show>
  );
}

function WorkspaceProviders(props: { solo?: string | string[] }) {
  const startup = invoke<Startup>("list_workspaces");
  const scope = startup.then((s) => s.active ?? "pending");
  const [scopeId, setScopeId] = createSignal<string | null>(null);
  void scope.then((id) => setScopeId(id === "pending" ? null : id), () => {});
  const [githubAccount, setGithubAccount] = createSignal<GithubAccountState>({ mode: "unknown", connected: false, reauthorize: false });
  /** La tarjeta local se ve sin sesión de Danil, con un motor sin GitHub de la cuenta o mientras la local manda. */
  const githubLocal = (id: string) => id !== "github" || githubAccount().mode === "local";
  let disposed = false;
  onCleanup(() => {
    disposed = true;
    for (const [id, state] of Object.entries(ocupado())) {
      if (state === "esperando" || state === "instalando") void cancelarNavegador(id);
    }
  });
  const [cli, setCli] = createSignal<{ available: boolean; version: string | null; managed_supported: boolean; installable: boolean; host_signed_in?: boolean } | null>(null);
  const [loadingCli, setLoadingCli] = createSignal(true);
  const [installingCli, setInstallingCli] = createSignal(false);
  const [cliFailure, setCliFailure] = createSignal<Failure | null>(null);
  async function installCli() {
    setInstallingCli(true);
    setCliFailure(null);
    try {
      await invoke("install_gh");
      await refreshCli();
    } catch (e) { setCliFailure(asFailure(e)); }
    finally { setInstallingCli(false); }
  }
  async function refreshCli() {
    setLoadingCli(true);
    try {
      const report = await invoke<{ githubCli?: NonNullable<ReturnType<typeof cli>> }>("check_environment");
      setCli(report.githubCli ?? null);
    } finally { setLoadingCli(false); }
  }
  onMount(() => { void refreshCli().catch((e) => setCliFailure(asFailure(e))); });
  // «Usar el GitHub de esta computadora»: es de esta máquina y no viaja con la cuenta.
  const [hostGithub, setHostGithub] = createSignal(false);
  const [savingHost, setSavingHost] = createSignal(false);
  const [hostFailure, setHostFailure] = createSignal<Failure | null>(null);
  onMount(() => {
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
      const w = await invoke<Workspace>("set_workspace_host_github", { id, enabled });
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

  async function cargar() {
    setCargando(true);
    try {
      setLista(await listGitHosts<Provider>(await scope));
      setFallo(null);
    } catch (e) {
      // Cargando, vacío y error son tres pantallas distintas: dejar la lista
      // vacía haría que el catálogo apareciera como si no hubiera proveedores.
      setLista(null);
      setFallo(asFailure(e));
    } finally {
      setCargando(false);
    }
  }

  onMount(() => {
    void cargar();
  });

  onMount(() => {
    const refresh = () => {
      for (const p of lista() ?? []) {
        if (montajes()[p.id]) void actualizarAcceso(p.id);
        else if (p.connected && p.select_area && !ocupado()[p.id]) {
          setRepos({});
          void verAreas(p.id);
        }
      }
    };
    window.addEventListener("focus", refresh);
    onCleanup(() => window.removeEventListener("focus", refresh));
  });

  // Revalidar al abrir: "conectado" tiene que ser algo comprobado hoy y no algo
  // que se dijo una vez. Un token revocado se descubre aquí, no cuando alguien
  // intente usarlo.
  //
  // Con `on(lista, …)`: el cuerpo lee `comprobado` y `ocupado`, y rastreándolos
  // se relanzaría a sí mismo — `setComprobado` es lo primero que hace.
  createEffect(
    on(lista, (l) => {
      if (!l) return;
      for (const p of l) {
        if (p.connected && !comprobado()[p.id] && !ocupado()[p.id]) {
          setComprobado((c) => ({ ...c, [p.id]: true }));
          void comprobar(p.id);
        }
      }
    }),
  );

  function reemplazar(p: Provider) {
    if (disposed) return;
    setLista((l) => (l ? l.map((x) => (x.id === p.id ? p : x)) : l));
  }

  const borradorDe = (id: string) => borradores()[id] ?? SIN_BORRADOR;

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
      const fresco = await invoke<Provider>("check_git_host", { id, scope: await scope });
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
      const fresco = await invoke<Provider>("connect_git_host", {
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
      const e = await invoke<Wait>("start_browser_login", { id: p.id, scope: await scope });
      if (disposed) { await cancelarNavegador(p.id); return; }
      setEsperas((x) => ({ ...x, [p.id]: e }));
      // El navegador de la persona ya tiene su sesión; el webview no.
      invoke("open_external", { target: e.url }).catch(() => {});
      // Esta espera dura lo que la persona tarde en aprobar. Mientras, la
      // pantalla enseña el código y el botón de cancelar, que corta de verdad.
      const fresco = await invoke<Provider>("finish_browser_login", { id: p.id, scope: await scope });
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
      await invoke("open_external", { target: p.setup_url });
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
    invoke("cancel_browser_login", { id, scope: await scope }).catch(() => {});
    if (setup && !disposed) await verAreas(id);
  }

  async function desconectar(id: string) {
    try {
      await invoke("disconnect_git_host", { id, scope: await scope });
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
        ? await invoke<Area[]>("git_host_available_areas", { id, scope: await scope })
        : await invoke<Area[]>("git_host_areas", { id, scope: await scope });
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
      const result = await invoke<Provider>("select_git_host_area", { id, area, enabled, scope: await scope });
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

  async function verProyectos(id: string, area: string) {
    const clave = `${id}/${area}`;
    if (abierta()[id] === area) {
      setAbierta((a) => ({ ...a, [id]: null }));
      return;
    }
    setAbierta((a) => ({ ...a, [id]: area }));
    if (repos()[clave]) return;
    setOcupado((o) => ({ ...o, [id]: "listando" }));
    setFallas((f) => ({ ...f, [id]: null }));
    try {
      const r = await invoke<ProyectoRemoto[]>("git_host_projects", { id, area, scope: await scope });
      setRepos((x) => ({ ...x, [clave]: r }));
    } catch (e) {
      setFallas((f) => ({ ...f, [id]: asFailure(e) }));
      setAbierta((a) => ({ ...a, [id]: null }));
    } finally {
      setOcupado((o) => ({ ...o, [id]: null }));
    }
  }

  /**
   * Trae una copia del repositorio al workspace activo.
   *
   * Sin proyecto: aquí se está mirando lo que hay en la organización, no
   * trabajando en algo concreto. La fuente queda dada de alta en el
   * workspace, y se adjunta a un proyecto desde la pantalla que sabe a cuál.
   */
  async function traer(id: string, r: ProyectoRemoto) {
    setTrayendo(r.clone_url);
    setFallas((f) => ({ ...f, [id]: null }));
    try {
      await invoke("attach_repo", {
        project: "",
        gitHost: id,
        cloneUrl: r.clone_url,
        branch: r.branch || undefined,
        name: r.name,
      });
      setTraidos((x) => ({ ...x, [r.clone_url]: true }));
    } catch (e) {
      setFallas((f) => ({ ...f, [id]: asFailure(e) }));
    } finally {
      setTrayendo(null);
    }
  }

  const visibles = () => {
    const l = lista();
    if (!l) return [];
    const solo = props.solo
      ? Array.isArray(props.solo)
        ? props.solo
        : [props.solo]
      : null;
    return solo ? l.filter((p) => solo.includes(p.id)) : l;
  };

  return (
    <Show when={!cargando()} fallback={<Skeleton filas={3} />}>
      <Show when={!fallo()} fallback={<FailureNote f={fallo()!} />}>
        <SettingsPanel>
          <For each={visibles()}>
            {(p) => {
              const estado = () => ocupado()[p.id] ?? null;
              const falla = () => fallas()[p.id];
              const b = () => borradorDe(p.id);
              const misAreas = () => areas()[p.id];
              // Se compone aquí y no en el `when`: el compilador reescribe el
              // lado izquierdo de un `&&` como `!!a` para memoizarlo, y cuando
              // es falsy lo que viaja es `false`, no el valor. Un accesor
              // derivado conserva el tipo. Ver `SYSTEM.md` § Las reglas de
              // Solid, regla 7 bis.
              const mostrarAreas = () => !p.select_area || choosing()[p.id];
              const areasVisibles = () =>
                estado() === "listando" || !mostrarAreas() ? null : misAreas();
              const abiertaAqui = () => abierta()[p.id];
              const esperaAqui = () => esperas()[p.id];
              // Un control deshabilitado dice por qué lo está. Mientras hay una
              // consulta en curso todos estos botones se bloquean, y sin esto
              // quedan muertos y mudos, que se lee como que la app se rompió.
              const espera = () =>
                estado() === "comprobando"
                  ? t("settings.providers.busy_checking", { name: p.name })
                  : estado() === "listando"
                    ? t("settings.providers.busy_listing", { name: p.name })
                    : undefined;
              const elegidas = () => {
                const c = p.connected;
                if (!c) return [];
                if (c.selected_areas?.length) return c.selected_areas;
                return c.selected_area ? [c.selected_area] : [];
              };

              return (
                <SettingsSection
                  title={
                    <span class="inline-flex items-center gap-2">
                      <MarcaGitHost id={p.id} size={16} />
                      {p.name}
                    </span>
                  }
                  aside={
                    <Switch
                      fallback={
                        <Badge>{t("settings.providers.state.off")}</Badge>
                      }
                    >
                      <Match when={p.id === "github" && githubAccount().mode === "account"}>
                        <Show when={githubAccount().connected} fallback={<Badge>{t("settings.providers.state.off")}</Badge>}>
                          <Show when={githubAccount().reauthorize} fallback={<Badge tone="success">{t("settings.providers.state.on")}</Badge>}>
                            <Badge tone="warning">{t("providers.github.account.reauthorize_badge")}</Badge>
                          </Show>
                        </Show>
                      </Match>
                      <Match when={estado() === "comprobando"}>
                        <Badge>{t("settings.providers.state.checking")}</Badge>
                      </Match>
                      {/* Antes que `conectado`: la conexión está guardada, pero
                          nadie ha podido confirmar hoy que siga valiendo. */}
                      <Match when={p.connected && p.unverified}>
                        <Badge tone="warning">
                          {t("settings.providers.state.unverified")}
                        </Badge>
                      </Match>
                      <Match when={p.connected}>
                        <Badge tone="success">{t("settings.providers.state.on")}</Badge>
                      </Match>
                    </Switch>
                  }
                >
                  <Show when={p.id === "github" && (hostUsable() || hostGithub())}>
                    <SettingsRow
                      label={t("providers.github.host_mode.title")}
                      description={hostGithub() && !hostUsable() ? t("providers.github.host_mode.ignored") : undefined}
                    >
                      <Toggle
                        checked={hostGithub()}
                        label={t("providers.github.host_mode.title")}
                        disabled={savingHost()}
                        onChange={(on) => void changeHostGithub(on)}
                      />
                    </SettingsRow>
                    <Show when={hostFailure()}>{(f) => <FailureNote f={f()} />}</Show>
                  </Show>
                  <Show when={p.id === "github" ? scopeId() : null}>
                    {(id) => (
                      <Suspense fallback={null}>
                        <GithubAccount scope={id()} local={!!p.connected} onState={setGithubAccount} />
                      </Suspense>
                    )}
                  </Show>
                  <Show when={githubLocal(p.id) && p.id === "github" && p.source === "legacy" && p.browser_login && !esperaAqui()}>
                    <SettingsRow label={t("providers.github.legacy.title")} description={t("providers.github.legacy.help")}>
                      <Button size="sm" type="button" disabled={estado() !== null} onClick={() => void conectarEnNavegador(p)}>
                        {t("providers.github.connect")}
                      </Button>
                    </SettingsRow>
                  </Show>
                  <Show when={githubLocal(p.id)}>
                  <Switch>
                    <Match when={p.connected && !esperaAqui() && !montajes()[p.id] ? p.connected : null}>
                      {(c) => (
                        <>
                          <Show when={p.id === "github"} fallback={<>
                            <SettingsRow
                              label={t("settings.providers.account")}
                              description={
                                <Show
                                  when={c().data.correo}
                                  fallback={
                                    <span>
                                      {t("settings.providers.as")}{" "}
                                      <strong>{c().identity.name}</strong>
                                      <Show
                                        when={c().identity.user !== c().identity.name}
                                      >
                                        {" "}
                                        <span class="font-mono text-caption">{c().identity.user}</span>
                                      </Show>
                                      <Show
                                        when={
                                          c().workspace &&
                                          c().workspace !== c().identity.user
                                        }
                                      >
                                        {" · "}
                                        <span class="font-mono text-caption">{c().workspace}</span>
                                      </Show>
                                    </span>
                                  }
                                >
                                  <span class="flex flex-col gap-0.5">
                                    <span class="font-mono text-caption">{c().data.correo}</span>
                                    <strong class="text-neutral-950">
                                      {c().identity.name}
                                    </strong>
                                    <span class="font-mono text-caption">{c().workspace}</span>
                                  </span>
                                </Show>
                              }
                            >
                              <Button
                                variant="ghost"
                                size="compact"
                                disabled={estado() !== null}
                                title={espera()}
                                onClick={() => void comprobar(p.id)}
                              >
                                {t("settings.providers.check")}
                              </Button>
                              <Button
                                variant="ghost"
                                size="compact"
                                disabled={estado() !== null}
                                title={espera()}
                                onClick={() => {
                                  void verAreas(p.id);
                                }}
                              >
                                {t("settings.providers.scope")}
                              </Button>
                              <Button
                                variant="ghost"
                                size="compact"
                                class="hover:text-error-strong"
                                disabled={estado() !== null}
                                title={
                                  espera() ??
                                  t("settings.providers.disconnect_title", { name: p.name })
                                }
                                onClick={() => void desconectar(p.id)}
                              >
                                {t("settings.providers.disconnect")}
                              </Button>
                            </SettingsRow>
                            <Show when={p.select_area}>
                              <SettingsRow
                                label={t("settings.providers.choose_area")}
                                description={
                                  elegidas().length === 0
                                    ? t("settings.providers.no_selected_areas")
                                    : new Intl.ListFormat(manifiesto().formato).format(elegidas().map((area) => area.key))
                                }
                              >
                                <div class="flex flex-wrap items-center justify-end gap-1.5">
                                  <Button variant="outline" size="compact" disabled={estado() !== null} onClick={() => {
                                    setChoosing((x) => ({ ...x, [p.id]: true }));
                                    void verAreas(p.id);
                                  }} aria-expanded={!!choosing()[p.id]}>
                                    {t("settings.providers.choose_access")}
                                  </Button>
                                  <Show when={p.setup_url}>
                                    {(url) => (
                                      <Button
                                        variant="ghost"
                                        size="compact"
                                        disabled={estado() !== null}
                                        onClick={() => void configurarAcceso({ ...p, setup_url: url() })}
                                      >
                                        {t("settings.providers.configure_access")}
                                      </Button>
                                    )}
                                  </Show>
                                </div>
                              </SettingsRow>
                            </Show>
                          </>}>
                            <SettingsRow label={
                              <span>
                                <strong>{c().identity.name}</strong>
                                <Show when={c().identity.user !== c().identity.name}>
                                  {" · "}
                                  <span class="font-mono text-xs">@{c().identity.user}</span>
                                </Show>
                              </span>
                            } />
                            <SettingsRow
                              class="flex-wrap gap-x-8 gap-y-3"
                              label={t("settings.providers.choose_area")}
                              description={elegidas().length === 0
                                ? t("settings.providers.no_selected_areas")
                                : new Intl.ListFormat(manifiesto().formato).format(elegidas().map((area) => area.key))}
                            >
                              <div class="flex flex-wrap items-center gap-1.5">
                                <Button variant="outline" size="compact" disabled={estado() !== null}
                                  aria-expanded={!!choosing()[p.id]} onClick={() => {
                                    setChoosing((x) => ({ ...x, [p.id]: true }));
                                    void verAreas(p.id);
                                  }}>
                                  {t("providers.github.change_access")}
                                </Button>
                                <DropdownMenu>
                                  <DropdownMenuTrigger as={Button} variant="ghost" size="iconCompact"
                                    aria-label={t("providers.github.more_actions")}
                                    title={espera() ?? t("providers.github.more_actions")}
                                    disabled={estado() !== null}>
                                    <Ellipsis size={16} aria-hidden />
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent class="z-[90]" data-owns-escape>
                                    <Show when={p.setup_url}>
                                      {(url) => <DropdownMenuItem disabled={estado() !== null} onSelect={() => void configurarAcceso({ ...p, setup_url: url() })}>
                                        {t("settings.providers.configure_access")}
                                      </DropdownMenuItem>}
                                    </Show>
                                    <DropdownMenuItem disabled={estado() !== null} onSelect={() => void comprobar(p.id)}>
                                      {t("providers.github.check_connection")}
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem class="text-error-strong" disabled={estado() !== null}
                                      title={t("settings.providers.disconnect_title", { name: p.name })}
                                      onSelect={() => void desconectar(p.id)}>
                                      {t("providers.github.disconnect")}
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </SettingsRow>
                            {/* El alcance por repositorio lo decide GitHub: la cuenta elegida
                                aporta todo lo que su instalación alcanza, también lo nuevo. */}
                            <Show when={elegidas().length > 0}>
                              <SettingsRow label={t("settings.providers.repositories")} description={t("settings.providers.inherited_access")}>
                                <Show when={p.setup_url}>
                                  {(url) => (
                                    <Button variant="ghost" size="compact" disabled={estado() !== null}
                                      title={espera()}
                                      onClick={() => void configurarAcceso({ ...p, setup_url: url() })}>
                                      {t("settings.providers.change_on_github")}
                                    </Button>
                                  )}
                                </Show>
                              </SettingsRow>
                            </Show>
                          </Show>
                        </>
                      )}
                    </Match>

                    <Match when={esperaAqui()}>
                      {(e) => (
                        <>
                          <SettingsRow
                            label={t("settings.providers.waiting", { name: p.name })}
                            description={
                              <ExternalLink url={e().url}>
                                {t("settings.providers.open", { name: p.name })}
                              </ExternalLink>
                            }
                          >
                            <Button
                              variant="outline"
                              size="compact"
                              onClick={() => cancelarNavegador(p.id)}
                            >
                              {t("settings.providers.cancel")}
                            </Button>
                          </SettingsRow>
                          <SettingsBlock>
                            <p class="m-0 select-all rounded-sm bg-surface-muted p-2 text-center font-mono text-xl tracking-[0.12em]">{e().code}</p>
                          </SettingsBlock>
                        </>
                      )}
                    </Match>

                    {/* Sin código que teclear: aquí la persona no copia nada,
                        elige repositorios en una página que ya está abierta. Lo
                        que la pantalla aporta es que la espera se ve y se puede
                        cortar. */}
                    <Match when={montajes()[p.id]}>
                      {(url) => (
                        <SettingsRow
                          label={t("settings.providers.setup_waiting", { name: p.name })}
                          description={
                            <ExternalLink url={url()}>
                              {t("settings.providers.open", { name: p.name })}
                            </ExternalLink>
                          }
                        >
                          <Button size="compact" disabled={estado() !== null} onClick={() => void actualizarAcceso(p.id)}>
                            {t("settings.providers.refresh_access")}
                          </Button>
                          <Button
                            variant="outline"
                            size="compact"
                            onClick={() => cancelarNavegador(p.id)}
                          >
                            {t("settings.providers.cancel")}
                          </Button>
                        </SettingsRow>
                      )}
                    </Match>

                    <Match when={!p.connected && !esperaAqui()}>
                      <form
                        class="contents"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void conectar(p);
                        }}
                      >
                        {/* El camino sin pegar nada, cuando el proveedor lo
                            tiene. Va arriba: es el que casi todo el mundo
                            quiere. Con su aviso: por este camino GitHub no
                            sabe dar solo lectura. */}
                        <Show when={p.browser_login}>
                          <SettingsRow
                            label={t("settings.providers.browser_row")}
                            description={prosa(p.login_help)}
                          >
                            <Button
                              size="sm"
                              type="button"
                              disabled={estado() !== null}
                              onClick={() => void conectarEnNavegador(p)}
                            >
                              {p.id === "github" ? t("providers.github.connect") : t("settings.providers.browser_login", { name: p.name })}
                            </Button>
                          </SettingsRow>
                        </Show>

                        <For each={p.fields}>
                          {(c) => (
                            <SettingsRow
                              label={
                                <>
                                  {prosa(c.label)}
                                  <Show when={!c.required}>
                                    <span class="ml-1 text-xs text-neutral-500">{t("settings.providers.optional")}</span>
                                  </Show>
                                </>
                              }
                              description={prosa(c.help)}
                            >
                              <Input
                                class="w-[220px] font-mono text-xs"
                                type="text"
                                aria-label={prosa(c.label)}
                                value={b().data[c.id] ?? ""}
                                onInput={(e) =>
                                  setBorradores((x) => ({
                                    ...x,
                                    [p.id]: {
                                      token: b().token,
                                      data: {
                                        ...b().data,
                                        [c.id]: e.currentTarget.value,
                                      },
                                    },
                                  }))
                                }
                              />
                            </SettingsRow>
                          )}
                        </For>

                        {/* GitHub: un solo botón, con la App Danil; sin token pegado. */}
                        <Show when={p.id !== "github"}>
                        <SettingsRow
                          label={
                            p.browser_login
                              ? t("settings.providers.or_token")
                              : prosa(p.token_label)
                          }
                          description={
                            <ExternalLink url={p.token_url}>
                              {t("settings.providers.create_token", { name: p.name })}
                            </ExternalLink>
                          }
                        >
                          {/* Oculto mientras se pega, y en cuanto el llavero lo
                              tiene no vuelve a existir ningún campo con él. La
                              pantalla no lo enseña nunca, ni recortado. */}
                          <Input
                            class="w-[220px] font-mono text-xs"
                            type="password"
                            autocomplete="off"
                            spellcheck={false}
                            placeholder={prosa(p.token_label)}
                            aria-label={prosa(p.token_label)}
                            value={b().token}
                            onInput={(e) =>
                              setBorradores((x) => ({
                                ...x,
                                [p.id]: {
                                  data: b().data,
                                  token: e.currentTarget.value,
                                },
                              }))
                            }
                          />
                          <Button
                            variant="secondary"
                            type="submit"
                            disabled={estado() !== null || !b().token.trim()}
                            title={
                              !b().token.trim()
                                ? t("settings.providers.missing_token", {
                                    // Con el locale del catálogo: `toLowerCase()`
                                    // a secas baja la `I` a `i` también en turco,
                                    // donde su minúscula es `ı`.
                                    label: prosa(p.token_label).toLocaleLowerCase(
                                      manifiesto().formato,
                                    ),
                                  })
                                : undefined
                            }
                          >
                            {estado() === "conectando"
                              ? t("settings.providers.connecting")
                              : t("settings.providers.connect")}
                          </Button>
                        </SettingsRow>
                        </Show>
                      </form>
                    </Match>
                  </Switch>
                  </Show>

                  <Show when={falla()}>
                    {(f) => (
                      <SettingsBlock>
                        <FailureNote f={f()} />
                      </SettingsBlock>
                    )}
                  </Show>

                  <Show when={estado() === "listando" && mostrarAreas()}>
                    <SettingsBlock>
                      <Skeleton filas={2} class="h-6" />
                    </SettingsBlock>
                  </Show>

                  <Show when={areasVisibles()}>
                    {(as) => (
                      <SettingsBlock class="gap-1.5">
                        <p class="m-0 text-xs text-neutral-500" title={prosa(p.area_help)}>
                          {as().length === 0
                            ? t("settings.providers.no_areas", {
                                label: prosa(p.areas_label),
                              })
                            : t("settings.providers.area_count", {
                                count: as().length,
                                label: prosa(
                                  as().length === 1 ? p.area_label : p.areas_label,
                                ),
                              })}
                        </p>

                        <Show when={choosing()[p.id]}>
                          <Button variant="outline" size="compact" class="self-start" onClick={() => {
                            setChoosing((current) => ({ ...current, [p.id]: false }));
                            void verAreas(p.id);
                          }}>
                            {t("settings.providers.finish_selection")}
                          </Button>
                        </Show>
                        <ul class="m-0 flex list-none flex-col gap-1 p-0">
                          <For each={as()}>
                            {(a) => {
                              const rs = () => repos()[`${p.id}/${a.key}`];
                              const abierto = () => abiertaAqui() === a.key;
                              const selected = () => p.connected?.selected_area?.key === a.key ||
                                p.connected?.selected_areas?.some((area) => area.key === a.key);

                              return (
                                <li>
                                  <div class="flex items-center gap-2 rounded-sm border border-border bg-surface px-2 py-1.5 text-xs">
                                    <span class="min-w-0 flex-1 truncate">{a.name}</span>
                                    <span class="font-mono text-caption text-neutral-500">{a.key}</span>
                                    <Show when={p.id !== "github" && (!p.select_area || selected())}>
                                      <Button
                                        variant="outline"
                                        size="compact"
                                        disabled={estado() !== null}
                                        title={espera()}
                                        onClick={() => void verProyectos(p.id, a.key)}
                                      >
                                        {abierto() ? t("settings.providers.hide") : t("settings.providers.show")}
                                      </Button>
                                    </Show>
                                    <Show when={p.select_area && choosing()[p.id]}>
                                      <Button
                                        variant="outline"
                                        size="compact"
                                        disabled={estado() !== null}
                                        onClick={() => void seleccionar(p.id, a.key, !selected())}
                                      >
                                        {selected() ? t("settings.providers.remove_area") : t("settings.providers.select_area")}
                                      </Button>
                                    </Show>
                                  </div>

                                  <Show when={abierto() && rs()?.length === 0}>
                                    <p class="m-0 py-2 text-xs text-neutral-500">{t("settings.providers.no_repos")}</p>
                                  </Show>

                                  <Show when={abierto() && rs()?.length}>
                                    <ul class="mt-1 mb-1.5 ml-3 flex list-none flex-col gap-1 border-l border-border p-0 pl-2.5">
                                      {/* El identificador solo aparece cuando
                                          dice algo que el nombre no dice. En
                                          Bitbucket suelen ser idénticos, y
                                          repetirlos convierte una lista de
                                          noventa y nueve en una de ciento
                                          noventa y ocho. */}
                                      <For each={rs() ?? []}>
                                        {(r) => (
                                          <li class="flex items-baseline gap-2 text-xs">
                                            <span class="min-w-0 truncate">{r.name}</span>
                                            <Show when={r.slug !== r.name}>
                                              <span class="min-w-0 truncate font-mono text-caption text-neutral-500">{r.slug}</span>
                                            </Show>
                                            {/* Traerlo es el acto: el botón
                                                vive en la fila del repositorio
                                                y no en una pantalla aparte, se
                                                decide mirando la lista, que es
                                                donde se reconoce cuál es
                                                cuál. */}
                                            <Button
                                              variant="outline"
                                              size="compact"
                                              class="ml-auto shrink-0"
                                              disabled={trayendo() !== null}
                                              title={
                                                traidos()[r.clone_url]
                                                  ? t("settings.providers.already_title")
                                                  : t("settings.providers.attach_title")
                                              }
                                              onClick={() => void traer(p.id, r)}
                                            >
                                              {traidos()[r.clone_url]
                                                ? t("settings.providers.already")
                                                : trayendo() === r.clone_url
                                                  ? t("settings.providers.attaching")
                                                  : t("settings.providers.attach")}
                                            </Button>
                                          </li>
                                        )}
                                      </For>
                                    </ul>
                                  </Show>
                                </li>
                              );
                            }}
                          </For>
                        </ul>
                      </SettingsBlock>
                    )}
                  </Show>
                  <Show when={p.id === "github"}>
                    <SettingsBlock>
                      <details>
                        <summary class="cursor-pointer rounded-sm text-sm text-neutral-500 outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                          {t("providers.github.agent_tools")}
                          <Show when={cliFailure() || (cli()?.available && !cli()?.managed_supported)}>
                            {" "}
                            <Badge tone="warning">{t("providers.github.cli.attention")}</Badge>
                          </Show>
                        </summary>
                        <SettingsRow label={t("providers.github.cli.title")}>
                          <Show when={cli()} fallback={
                            <Show when={loadingCli()} fallback={
                              <Show when={!cliFailure()}><span class="text-xs text-neutral-500">{t("providers.github.cli.unavailable")}</span></Show>
                            }><Skeleton filas={1} class="h-6" /></Show>
                          }>{(info) => <>
                            <span class="text-xs text-neutral-500">{info().version ?? t("providers.github.cli.absent")}</span>
                            <Show when={!info().managed_supported && info().installable}>
                              <Button variant="secondary" size="compact" disabled={installingCli()} onClick={() => void installCli()}>
                                {installingCli() ? t("providers.github.cli.installing") : t("providers.github.cli.install")}
                              </Button>
                            </Show>
                            <Show when={info().managed_supported}><Badge>{t("providers.github.cli.ready")}</Badge></Show>
                          </>}</Show>
                        </SettingsRow>
                      </details>
                      <Show when={cliFailure()}>{(f) => <FailureNote f={f()} />}</Show>
                    </SettingsBlock>
                  </Show>
                </SettingsSection>
              );
            }}
          </For>
          <Show when={!props.solo}>
            <SettingsSection title={t("onboarding.tools.drive")} description={t("onboarding.tools.about.drive")}>
              <div class="mt-3">
                <Suspense fallback={null}>
                  <Integraciones solo={["drive"]} onCambio={() => {}} />
                </Suspense>
              </div>
            </SettingsSection>
            <SettingsSection title={t("onboarding.tools.references.group")} description={t("onboarding.tools.references.about")}>
              <div class="mt-3">
                <Suspense fallback={null}>
                  <Integraciones solo={["zotero"]} onCambio={() => {}} />
                  <LocalKeysBanner kinds={["zotero"]} />
                  <CredentialsInUse kinds={["zotero"]} title={t("danil.credentials.zotero_title")} />
                </Suspense>
              </div>
            </SettingsSection>
          </Show>
        </SettingsPanel>
      </Show>
    </Show>
  );
}
