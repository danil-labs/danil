import TriangleAlert from "lucide-solid/icons/triangle-alert";
import { listen } from "../../lib/serviceEvents";
import { AvanceDeDescarga, BarraDeCarga, CodigoParaConfirmar, Peso } from "./DownloadProgress";
import ArrowRight from "lucide-solid/icons/arrow-right";
import Check from "lucide-solid/icons/check";
import ExternalLink from "lucide-solid/icons/external-link";
import FileText from "lucide-solid/icons/file-text";
import { createSignal, For, type JSX, Match, onCleanup, onMount, Show, Switch } from "solid-js";
import { createStore } from "solid-js/store";
import { mb } from "../../lib/format";
import { t } from "../../lib/i18n";
import { invoke } from "../../engine/client.ts";
import { borrarPref, leerPref } from "../../lib/prefs";
import { prosa, type Frase } from "../../lib/prose";
import { cn } from "../../lib/utils";
import { isMac } from "../../lib/window";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { detalleDe, prosaDe } from "../../ui/Failure";
import { CancelButton, RemoveButton } from "../../ui/IconAction";
import { Input } from "../../ui/Input";
import { MarcaProveedor } from "../../ui/icons";
import { GoogleDriveMark, MarcaPlugin, ZoteroMark } from "../../ui/toolMarks";
import { Spinner } from "../../ui/Spinner";
import { ErrorDeTarjeta } from "./ConnectAI";
import { explicar } from "./connect-store";

type Wait = { code: string; url: string };
type Campo = { id: string; label: Frase; help: Frase; required: boolean };
type Proveedor = {
  id: string;
  name: string;
  browser_login: boolean;
  fields: Campo[];
  token_label: Frase;
  token_help: Frase;
  token_url: string;
  setup_url: string | null;
  connected: { identity: { user: string; name: string }; workspace?: string } | null;
};
type Conocido = { id: string; grupo: string; pide_sesion: boolean; conectado: boolean; sesiones?: string[] };
/** Un `.bib` de un proyecto que sigue a Zotero (`zotero_bib_links`). `fallo` viene en inglés: lo leen también los agentes. */
type VinculoBib = { archivo: string; coleccion?: string; ids?: string[]; sincronizado?: number; fallo?: string };
const nombreDeArchivo = (ruta: string) => ruta.split(/[\\/]/).pop() || ruta;
type AgenteMcp = { id: string; label: string; recibe: boolean; instalado: boolean; login?: boolean };
type Plugin = { id: string; installed: boolean; installing: boolean; supported: boolean };
type FalloDelMotor = { what: Frase; detail?: string };
type AvanceDeDrive = {
  kind: "progress" | "verifying" | "done" | "cancelled" | "error" | "connection";
  received?: number;
  total?: number | null;
  failure?: FalloDelMotor | null;
};
type EstadoDeDrive = {
  supported: boolean;
  installed: boolean;
  install: AvanceDeDrive | null;
  connected: { email: string; name: string } | null;
  unverified: FalloDelMotor | null;
};
/** La app oficial de Google (Windows y Mac); sin `supported` Drive sigue con rclone. */
type DriveDeEscritorio = {
  supported: boolean;
  installed: boolean;
  running: boolean;
  mounts: { email: string | null; path: string }[];
  installer_bytes: number | null;
  /** La persona pidió que los agentes de este workspace no usen las unidades; lo guarda el motor. */
  unused?: boolean;
};
/** El evento `install` de la app oficial; en `error`, `failure` es una clave del catálogo. */
type InstalacionDeDrive = {
  operation: string;
  kind: "sizing" | "downloading" | "installing" | "done" | "cancelled" | "error";
  done: number;
  bytes: number;
  failure?: string | null;
};
const falloDeInstalacion = (clave: string | null | undefined, porOmision = "onboarding.tools.drive_app.install_failed") => {
  const texto = clave ? t(clave) : "";
  return texto && texto !== clave ? texto : t(porOmision);
};
/** Zotero en esta máquina: `local_api` dice si su API local contesta, está apagada o no existe. */
type EstadoDeZotero = {
  installed: boolean;
  running: boolean;
  version: string | null;
  local_api: "ready" | "disabled" | "unsupported" | "unavailable";
  installer_bytes: number | null;
};
const SIN_USAR_DRIVE = "onboarding.drive-desktop-unused";
const CADA_CUANTO_SESION = 2500;

/** Cómo se conecta cada integración: servicios de código, un servicio MCP conocido o Drive con su CLI. */
type Integracion = {
  id: string;
  nombre: string;
  comun: boolean;
  via: "proveedor" | "mcp" | "incluido" | "drive" | "referencias";
};
type EstadoDeIntegracion =
  | { k: "libre" }
  | { k: "formulario" }
  | { k: "descargando"; hecho: number; total: number | null }
  | { k: "instalando" }
  | { k: "sesion" }
  | { k: "conectando"; codigo?: string }
  | { k: "conectada"; detalle: string }
  | { k: "detectada"; detalle: string }
  | { k: "abriendo" }
  | { k: "permiso" }
  | { k: "saliendo" };
type Borrador = { data: Record<string, string>; token: string };

const INTEGRACIONES = (): Integracion[] => [
  { id: "github", nombre: "GitHub", comun: true, via: "proveedor" },
  { id: "drive", nombre: t("onboarding.tools.drive"), comun: true, via: "drive" },
  { id: "figma", nombre: "Figma", comun: true, via: "mcp" },
  { id: "atlassian", nombre: t("onboarding.tools.atlassian"), comun: true, via: "mcp" },
  { id: "gitlab", nombre: "GitLab", comun: false, via: "proveedor" },
  { id: "bitbucket", nombre: "Bitbucket", comun: false, via: "proveedor" },
  { id: "excalidraw", nombre: "Excalidraw", comun: false, via: "incluido" },
  { id: "notion", nombre: "Notion", comun: false, via: "mcp" },
  { id: "zotero", nombre: "Zotero", comun: false, via: "referencias" },
];
const RECOMENDADOS = ["drawio", "typst", "libreoffice"];
const ORDEN_PLUGINS = ["drawio", "typst", "libreoffice", "agentsview", "computer-use"];
const CON_PESO = new Set(["drawio", "typst", "libreoffice", "computer-use"]);
const descripcion = (id: string) => t(`onboarding.tools.about.${id}`);
const SIN_BORRADOR: Borrador = { data: {}, token: "" };

/** «Lo ves en la dirección: bitbucket.org/espacio/…», con el espacio en negrita como el diseño. */
function EspacioEnNegrita() {
  const [antes, despues] = t("onboarding.tools.bitbucket.space_hint", { space: "@@" }).split("@@");
  return (
    <>
      {antes}
      <b class="font-semibold">{t("onboarding.tools.bitbucket.space_word")}</b>
      {despues}
    </>
  );
}

/** Drive y las bibliotecas no son servicios de código ni MCP conocidos: sus marcas viven con las de los plugins. */
function MarcaIntegracion(props: { id: string; size?: number }) {
  return (
    <Switch fallback={<MarcaProveedor id={props.id} size={props.size} />}>
      <Match when={props.id === "drive"}><GoogleDriveMark size={props.size} /></Match>
      <Match when={props.id === "zotero"}><ZoteroMark size={props.size} /></Match>
    </Switch>
  );
}

/** «Ver más»: texto al aire, los íconos de lo escondido encimados en diagonal y la flecha. */
export function VerMas(props: {
  abierto: boolean;
  resto: { id: string; nombre: string; icono: JSX.Element }[];
  /** Los que se asoman primero; de vista previa sólo caben tres. */
  primero?: string[];
  onClick: () => void;
}) {
  const asoman = () => {
    const orden = (id: string) => {
      const i = props.primero?.indexOf(id) ?? -1;
      return i < 0 ? Number.MAX_SAFE_INTEGER : i;
    };
    return [...props.resto].sort((a, b) => orden(a.id) - orden(b.id)).slice(0, 3);
  };
  return (
    <Show when={props.resto.length > 0 || props.abierto}>
      <button
        type="button"
        class="group inline-flex h-10 cursor-pointer items-start self-start border-0 bg-transparent px-0.5 pt-1.5 text-xs font-medium text-neutral-500 outline-none hover:text-neutral-950 focus-visible:rounded-sm focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
        aria-expanded={props.abierto}
        aria-label={props.abierto ? undefined : t("onboarding.tools.more_label", { names: props.resto.map((r) => r.nombre).join(", ") })}
        onClick={() => props.onClick()}
      >
        <span class="inline-flex items-center">
          <span>{props.abierto ? t("onboarding.tools.less") : t("onboarding.tools.more")}</span>
          <Show when={!props.abierto}>
            <span class="relative z-[1] mr-[-3px] ml-[-2px] inline-flex translate-y-[5px] items-center transition-[translate,margin] duration-300 ease-[cubic-bezier(.3,1.4,.5,1)] group-hover:mx-[5px] group-hover:translate-y-[7px]">
              <For each={asoman()}>
                {(r, i) => (
                  <span
                    class="-ml-1.5 grid size-[15px] translate-y-[var(--sube)] place-items-center rounded-full border border-border-strong bg-surface-raised shadow-[0_0_0_1.5px_var(--color-bg)] transition-[width,height,margin,translate,box-shadow] duration-300 ease-[cubic-bezier(.3,1.4,.5,1)] first:ml-0 group-hover:ml-1 group-hover:size-[19px] group-hover:translate-y-0 group-hover:shadow-[0_0_0_2px_var(--color-bg),0_2px_6px_rgba(10,13,35,.12)] group-hover:first:ml-0 [&>svg]:size-[62%]"
                    style={{ "--sube": `${-3 * Math.min(i(), 3)}px` }}
                    title={r.nombre}
                  >
                    {r.icono}
                  </span>
                )}
              </For>
            </span>
          </Show>
          <ArrowRight
            size={14}
            aria-hidden="true"
            class={cn(
              "ml-0.5 transition-[translate,rotate] duration-200",
              props.abierto ? "ml-1.5 -rotate-90" : "group-hover:translate-x-[3px]",
            )}
          />
        </span>
      </button>
    </Show>
  );
}

/** Las integraciones: cada tarjeta mide lo mismo en todos sus estados y se conecta o desconecta en su sitio. */
export function Integraciones(props: { onCambio: (conectadas: number) => void; solo?: string[] }) {
  /** Con `solo`, únicamente esas tarjetas y todas a la vista: Configuración monta así la de Drive. */
  const integraciones = () =>
    props.solo
      ? INTEGRACIONES()
          .filter((i) => props.solo?.includes(i.id))
          .map((i) => ({ ...i, comun: true }))
      : INTEGRACIONES();
  const [proveedores, setProveedores] = createSignal<Proveedor[]>([]);
  const [conocidos, setConocidos] = createSignal<Conocido[]>([]);
  const [agentesMcp, setAgentesMcp] = createSignal<AgenteMcp[]>([]);
  const [estados, setEstados] = createStore<Record<string, EstadoDeIntegracion>>({});
  const [errores, setErrores] = createStore<Record<string, string | null>>({});
  const [borradores, setBorradores] = createStore<Record<string, Borrador>>({});
  /** Por qué se abrió el formulario en vez del navegador: el aviso del servicio, entero. */
  const [motivos, setMotivos] = createStore<Record<string, string | null>>({});
  const [verMas, setVerMas] = createSignal(false);
  const [falloDeCarga, setFalloDeCarga] = createSignal<string | null>(null);
  const [drive, setDrive] = createSignal<EstadoDeDrive | null>(null);
  const [escritorio, setEscritorio] = createSignal<DriveDeEscritorio | null>(null);
  const [zotero, setZotero] = createSignal<EstadoDeZotero | null>(null);
  const [bibs, setBibs] = createSignal<VinculoBib[]>([]);
  const [sincronizandoBibs, setSincronizandoBibs] = createSignal(false);
  let intentoDeZotero = 0;
  let finDeZotero: ((a: InstalacionDeDrive) => void) | null = null;
  let vigiaDeZotero: ReturnType<typeof setTimeout> | undefined;
  const oficial = () => escritorio()?.supported === true;
  /** Cada «Conectar» de la app oficial: lo que conteste uno ya cancelado no toca la tarjeta. */
  let intentoDeDrive = 0;
  let finDeInstalacion: ((a: InstalacionDeDrive) => void) | null = null;
  let vigiaDeSesion: ReturnType<typeof setTimeout> | undefined;
  let finDeDescarga: ((a: AvanceDeDrive) => void) | null = null;
  const scope = invoke<{ active: string | null }>("list_workspaces").then((s) => s.active ?? "pending");
  let esperandoMcp: string | null = null;
  let incluidas = false;
  let cerrada = false;

  const agenteDeSesion = () => agentesMcp().find((a) => a.instalado && a.recibe && a.login);
  const proveedor = (id: string) => proveedores().find((p) => p.id === id);
  const conocido = (i: Integracion) => conocidos().find((c) => c.id === i.id);
  const descargaDeDrive = (a: AvanceDeDrive | null | undefined): EstadoDeIntegracion | null =>
    a && (a.kind === "progress" || a.kind === "verifying")
      ? { k: "descargando", hecho: a.received ?? 0, total: a.total ?? null }
      : null;
  const viva = (id: string) =>
    ["formulario", "descargando", "instalando", "sesion", "conectando", "abriendo", "saliendo"].includes(estados[id]?.k ?? "libre");
  const unidad = (d: DriveDeEscritorio | null) => d?.mounts?.[0];
  const borrador = (id: string) => borradores[id] ?? SIN_BORRADOR;

  function guardado(i: Integracion): EstadoDeIntegracion {
    if (i.id === "zotero") {
      const z = zotero();
      if (!z?.running) return { k: "libre" };
      if (z.local_api === "ready") return { k: "conectada", detalle: t("onboarding.tools.references.zotero_ready", { version: z.version ?? "" }) };
      return z.local_api === "disabled" ? { k: "permiso" } : { k: "libre" };
    }
    if (i.via === "drive" && oficial()) {
      const m = unidad(escritorio());
      if (!m) return { k: "libre" };
      const donde = [m.email, m.path].filter(Boolean).join(" · ");
      return escritorio()?.unused ? { k: "detectada", detalle: donde } : { k: "conectada", detalle: donde };
    }
    if (i.via === "drive") {
      const d = drive();
      if (d?.connected) return { k: "conectada", detalle: d.connected.email || d.connected.name };
      return descargaDeDrive(d?.install) ?? { k: "libre" };
    }
    if (i.via === "proveedor") {
      const c = proveedor(i.id)?.connected;
      if (!c) return { k: "libre" };
      const quien = c.identity.name && c.identity.user ? `${c.identity.name} · @${c.identity.user}` : c.identity.user || c.workspace || "";
      return { k: "conectada", detalle: quien };
    }
    const c = conocido(i);
    if (!c?.conectado) return { k: "libre" };
    if (!c.pide_sesion || (c.sesiones ?? []).length > 0) return { k: "conectada", detalle: descripcion(i.id) };
    return { k: "detectada", detalle: t("onboarding.tools.needs_login") };
  }

  async function cargar() {
    try {
      const [p, c, a, d, o, z, b] = await Promise.all([
        invoke<Proveedor[]>("list_git_hosts", { scope: await scope }),
        invoke<Conocido[]>("list_known_mcp"),
        invoke<AgenteMcp[]>("list_mcp_providers"),
        invoke<EstadoDeDrive>("google_drive_status").catch(() => null),
        invoke<DriveDeEscritorio>("google_drive_desktop_status").catch(() => null),
        invoke<EstadoDeZotero>("zotero_status").catch(() => null),
        invoke<VinculoBib[]>("zotero_bib_links").catch(() => []),
      ]);
      if (cerrada) return;
      // Antes la guardaba la ventana; ahora es del motor, que la lee en cada turno.
      if (o && leerPref(SIN_USAR_DRIVE, false)) {
        borrarPref(SIN_USAR_DRIVE);
        if (!o.unused) {
          await invoke("set_google_drive_desktop_use", { used: false }).catch(() => {});
          o.unused = true;
        }
      }
      setDrive(d);
      setEscritorio(o);
      setZotero(z);
      setBibs(b);
      setProveedores(p);
      setConocidos(c);
      setAgentesMcp(a);
      setFalloDeCarga(null);
      for (const i of integraciones()) if (!viva(i.id)) setEstados(i.id, guardado(i));
      props.onCambio(integraciones().filter((i) => estados[i.id]?.k === "conectada").length);
      void incluir();
    } catch (e) {
      setFalloDeCarga(explicar(e));
    }
  }

  /** Lo incluido no pide nada: se deja puesto en el workspace al abrir la pantalla. */
  async function incluir() {
    if (incluidas) return;
    incluidas = true;
    for (const i of integraciones().filter((x) => x.via === "incluido")) {
      const c = conocido(i);
      if (!c || c.conectado) continue;
      try {
        await invoke("connect_known_mcp", { id: i.id });
      } catch (e) {
        setErrores(i.id, explicar(e));
      }
    }
    if (!cerrada) await cargar();
  }

  onMount(() => void cargar());
  const fin = listen("mcp", () => {
    if (esperandoMcp) setEstados(esperandoMcp, { k: "libre" });
    esperandoMcp = null;
    void cargar();
  });
  // `mcp-login` no se abre aquí: el CLI o el motor ya abrieron esa pestaña.
  const alDrive = listen<AvanceDeDrive>("google-drive", (e) => {
    const a = e.payload;
    if (a.kind === "connection") return void cargar();
    const bajando = descargaDeDrive(a);
    if (bajando) {
      if (estados.drive?.k === "descargando" || finDeDescarga) setEstados("drive", bajando);
      return;
    }
    finDeDescarga?.(a);
  });
  // Al abrir se pregunta a Google si la conexión sigue viva; sin red queda conectada y sin comprobar.
  onMount(async () => {
    const o = await invoke<DriveDeEscritorio>("google_drive_desktop_status").catch(() => null);
    if (o?.supported) return;
    void invoke<EstadoDeDrive>("google_drive_status")
      .then((d) => (d.connected ? invoke<EstadoDeDrive>("check_google_drive") : d))
      .then((d) => {
        if (cerrada) return;
        setDrive(d);
        if (!viva("drive")) setEstados("drive", guardado(INTEGRACIONES().find((i) => i.id === "drive")!));
      })
      .catch((e) => {
        setErrores("drive", explicar(e));
        void cargar();
      });
  });
  const alInstalarZotero = listen<InstalacionDeDrive>("install", (e) => {
    const a = e.payload;
    if (a.operation !== "zotero") return;
    if (a.kind === "done" || a.kind === "cancelled" || a.kind === "error") return finDeZotero?.(a);
    if (estados.zotero?.k !== "descargando" && estados.zotero?.k !== "instalando") return;
    if (a.kind === "installing") setEstados("zotero", { k: "instalando" });
    else if (a.bytes > 0) setEstados("zotero", { k: "descargando", hecho: a.done, total: a.bytes });
  });
  const alInstalar = listen<InstalacionDeDrive>("install", (e) => {
    const a = e.payload;
    if (a.operation !== "google-drive-desktop") return;
    if (a.kind === "done" || a.kind === "cancelled" || a.kind === "error") return finDeInstalacion?.(a);
    if (estados.drive?.k !== "descargando") return;
    if (a.kind === "installing") setEstados("drive", { k: "instalando" });
    else if (a.bytes > 0) setEstados("drive", { k: "descargando", hecho: a.done, total: a.bytes });
  });
  onCleanup(() => {
    cerrada = true;
    clearTimeout(vigiaDeSesion);
    clearTimeout(vigiaDeZotero);
    for (const l of [fin, alDrive, alInstalar, alInstalarZotero]) void l.then((f) => f());
    for (const i of integraciones()) {
      if ((i.via === "proveedor" || i.via === "drive") && estados[i.id]?.k === "conectando") void cancelar(i);
    }
  });

  /** El respaldo de Configuración: pegar un token cuando el navegador no se pudo usar. */
  function abrirFormulario(i: Integracion, motivo: string | null) {
    setMotivos(i.id, motivo);
    setEstados(i.id, { k: "formulario" });
  }

  const contarConectadas = () => props.onCambio(integraciones().filter((x) => estados[x.id]?.k === "conectada").length);

  function usarUnidad(i: Integracion, o: DriveDeEscritorio) {
    setEscritorio({ ...o, unused: false });
    void invoke("set_google_drive_desktop_use", { used: true }).catch((e) => setErrores(i.id, explicar(e)));
    setEstados(i.id, guardado(i));
    contarConectadas();
  }

  /** Mientras la persona inicia sesión en la app de Google, la tarjeta pasa sola a conectada cuando aparece la unidad. */
  function vigilarSesion(i: Integracion, intento: number) {
    clearTimeout(vigiaDeSesion);
    vigiaDeSesion = setTimeout(async () => {
      const o = await invoke<DriveDeEscritorio>("google_drive_desktop_status").catch(() => null);
      if (cerrada || intento !== intentoDeDrive || estados[i.id]?.k !== "sesion") return;
      if (o && unidad(o)) return usarUnidad(i, o);
      vigilarSesion(i, intento);
    }, CADA_CUANTO_SESION);
  }

  /** La app oficial de Google se descarga e instala sola; la persona acepta el permiso del sistema e inicia sesión. */
  async function conectarDriveDeEscritorio(i: Integracion) {
    const intento = ++intentoDeDrive;
    const vigente = () => !cerrada && intento === intentoDeDrive;
    const antes = escritorio()!;
    if (unidad(antes)) return usarUnidad(i, antes);
    try {
      if (antes.installed) await invoke("open_google_drive_desktop");
      else {
        setEstados(i.id, { k: "descargando", hecho: 0, total: antes.installer_bytes });
        const terminada = new Promise<InstalacionDeDrive>((resolve) => (finDeInstalacion = resolve));
        await invoke("install_google_drive_desktop");
        const a = await terminada;
        finDeInstalacion = null;
        if (!vigente() || a.kind === "cancelled") return;
        if (a.kind === "error") throw new Error(falloDeInstalacion(a.failure));
      }
      if (!vigente()) return;
      const o = await invoke<DriveDeEscritorio>("google_drive_desktop_status");
      if (!vigente()) return;
      if (unidad(o)) return usarUnidad(i, o);
      setEscritorio(o);
      setEstados(i.id, { k: "sesion" });
      vigilarSesion(i, intento);
    } catch (e) {
      finDeInstalacion = null;
      if (!vigente()) return;
      setErrores(i.id, explicar(e) || t("onboarding.tools.drive_app.install_failed"));
      setEstados(i.id, { k: "libre" });
      void cargar();
    }
  }

  /** Drive: su CLI (rclone) se descarga si falta y luego se aprueba en el navegador. */
  async function conectarDrive(i: Integracion) {
    if (oficial()) return conectarDriveDeEscritorio(i);
    const d = drive();
    if (d && !d.supported) return void setErrores(i.id, t("onboarding.tools.unsupported"));
    try {
      if (!d?.installed) {
        setEstados(i.id, { k: "descargando", hecho: 0, total: null });
        void invoke<number>("install_size", { operation: "google-drive" })
          .then((b) => {
            const e = estados[i.id];
            if (e?.k === "descargando" && !e.total) setEstados(i.id, { ...e, total: b });
          })
          .catch(() => {});
        const terminado = new Promise<AvanceDeDrive>((resolve) => (finDeDescarga = resolve));
        await invoke("install_google_drive");
        const a = await terminado;
        finDeDescarga = null;
        if (a.kind === "cancelled") return void setEstados(i.id, { k: "libre" });
        if (a.kind === "error") throw a.failure ?? new Error(t("onboarding.tools.drive_install_failed"));
        if (cerrada || estados[i.id]?.k === "libre") return;
      }
      setEstados(i.id, { k: "conectando" });
      const { url } = await invoke<{ url: string }>("start_google_drive_login");
      invoke("open_external", { target: url }).catch(() => {});
      const fresco = await invoke<EstadoDeDrive>("finish_google_drive_login");
      if (cerrada) return;
      setDrive(fresco);
      setEstados(i.id, guardado(i));
    } catch (e) {
      finDeDescarga = null;
      if (cerrada || estados[i.id]?.k === "libre") return;
      setErrores(i.id, explicar(e));
      setEstados(i.id, { k: "libre" });
      void cargar();
    }
    props.onCambio(integraciones().filter((x) => estados[x.id]?.k === "conectada").length);
  }

  /** Con Zotero abierto la tarjeta dice lo que sigue: lista, falta el permiso en Zotero o hay que actualizarlo. */
  function segunZotero(i: Integracion, z: EstadoDeZotero) {
    setZotero(z);
    if (z.local_api === "unsupported") {
      setErrores(i.id, t("settings.references.zotero.error_too_old"));
      setEstados(i.id, { k: "libre" });
    } else setEstados(i.id, guardado(i));
    contarConectadas();
  }

  /** Mientras Zotero arranca, la tarjeta pasa sola al siguiente paso cuando contesta. */
  function vigilarZotero(i: Integracion, intento: number) {
    clearTimeout(vigiaDeZotero);
    vigiaDeZotero = setTimeout(async () => {
      const z = await invoke<EstadoDeZotero>("zotero_status").catch(() => null);
      if (cerrada || intento !== intentoDeZotero || estados[i.id]?.k !== "abriendo") return;
      if (z?.running) return segunZotero(i, z);
      vigilarZotero(i, intento);
    }, CADA_CUANTO_SESION);
  }

  /** Zotero se instala solo si falta y se abre; después solo queda permitir su API local. */
  async function conectarZotero(i: Integracion) {
    const intento = ++intentoDeZotero;
    const vigente = () => !cerrada && intento === intentoDeZotero;
    try {
      let z = await invoke<EstadoDeZotero>("zotero_status");
      if (!vigente()) return;
      if (!z.installed) {
        setEstados(i.id, { k: "descargando", hecho: 0, total: z.installer_bytes });
        const terminada = new Promise<InstalacionDeDrive>((resolve) => (finDeZotero = resolve));
        await invoke("install_zotero");
        const a = await terminada;
        finDeZotero = null;
        if (!vigente() || a.kind === "cancelled") return;
        if (a.kind === "error") throw new Error(falloDeInstalacion(a.failure, "settings.references.zotero.error_install"));
        z = await invoke<EstadoDeZotero>("zotero_status");
        if (!vigente()) return;
      }
      if (z.running) return segunZotero(i, z);
      await invoke("open_zotero");
      if (!vigente()) return;
      setEstados(i.id, { k: "abriendo" });
      vigilarZotero(i, intento);
    } catch (e) {
      finDeZotero = null;
      if (!vigente()) return;
      setErrores(i.id, explicar(e) || t("settings.references.zotero.error_install"));
      setEstados(i.id, { k: "libre" });
    }
  }

  async function conectar(i: Integracion) {
    setErrores(i.id, null);
    setMotivos(i.id, null);
    if (i.id === "zotero") return conectarZotero(i);
    if (i.via === "drive") return conectarDrive(i);
    if (i.via === "proveedor") {
      const p = proveedor(i.id);
      if (!p) return void setErrores(i.id, t("onboarding.tools.unavailable"));
      if (!p.browser_login) return abrirFormulario(i, null);
      setEstados(i.id, { k: "conectando" });
      try {
        const espera = await invoke<Wait>("start_browser_login", { id: i.id, scope: await scope });
        if (cerrada) return;
        setEstados(i.id, { k: "conectando", codigo: espera.code });
        invoke("open_external", { target: espera.url }).catch(() => {});
      } catch (e) {
        if (estados[i.id]?.k !== "conectando") return;
        return abrirFormulario(i, explicar(e));
      }
      try {
        const fresco = await invoke<Proveedor>("finish_browser_login", { id: i.id, scope: await scope });
        if (fresco.setup_url) invoke("open_external", { target: fresco.setup_url }).catch(() => {});
        // Pasa directo a «Conectada» con lo que devolvió el login, sin mostrar «Conectar» mientras recarga.
        setProveedores((ps) => ps.map((x) => (x.id === fresco.id ? fresco : x)));
        // Los agentes usan gh con esta conexión; en Ajustes se instala a mano, aquí se deja listo.
        if (i.id === "github") invoke("install_gh").catch(() => {});
      } catch (e) {
        if (estados[i.id]?.k !== "conectando") return;
        setErrores(i.id, explicar(e));
      }
      setEstados(i.id, guardado(i));
      return void cargar();
    }
    const c = conocido(i);
    if (!c) return void setErrores(i.id, t("onboarding.tools.unavailable"));
    esperandoMcp = i.id;
    setEstados(i.id, { k: "conectando" });
    try {
      await invoke("connect_known_mcp", { id: i.id });
      // Lo autoriza el motor para todos los agentes; `provider` solo dice quién lo pidió.
      if (c.pide_sesion) {
        await invoke("mcp_login", { provider: agenteDeSesion()?.id ?? "", id: i.id });
        return;
      }
    } catch (e) {
      if (esperandoMcp !== i.id) return;
      esperandoMcp = null;
      setErrores(i.id, explicar(e));
      setEstados(i.id, { k: "libre" });
      return;
    }
    esperandoMcp = null;
    await cargar();
    setEstados(i.id, guardado(i));
  }

  async function conectarConToken(i: Integracion) {
    const p = proveedor(i.id);
    const b = borrador(i.id);
    if (!p || !b.token.trim() || p.fields.some((c) => c.required && !b.data[c.id]?.trim())) return;
    setErrores(i.id, null);
    setEstados(i.id, { k: "conectando" });
    try {
      const data = Object.fromEntries(Object.entries(b.data).map(([k, v]) => [k, v.trim()]));
      await invoke("connect_git_host", { scope: await scope, id: i.id, data, token: b.token.trim() });
      setBorradores(i.id, SIN_BORRADOR);
      setMotivos(i.id, null);
      setEstados(i.id, { k: "libre" });
      await cargar();
    } catch (e) {
      const texto = explicar(e);
      setErrores(i.id, i.id === "bitbucket" && texto !== t("onboarding.ai.error.keyring") ? t("onboarding.tools.bitbucket.invalid") : texto);
      setEstados(i.id, { k: "formulario" });
    }
  }

  // La tarjeta vuelve al instante; el motor termina de cortar por detrás.
  async function cancelar(i: Integracion) {
    setErrores(i.id, null);
    const e = estados[i.id]?.k;
    const conToken = Boolean(borradores[i.id]?.token);
    setBorradores(i.id, SIN_BORRADOR);
    setMotivos(i.id, null);
    if (!cerrada) setEstados(i.id, { k: "libre" });
    if (i.id === "zotero") {
      intentoDeZotero++;
      finDeZotero = null;
      clearTimeout(vigiaDeZotero);
      if (e === "descargando") void invoke("cancel_install", { operation: "zotero" }).catch(() => {});
    } else if (i.via === "drive" && oficial()) {
      intentoDeDrive++;
      finDeInstalacion = null;
      clearTimeout(vigiaDeSesion);
      if (e === "descargando") void invoke("cancel_install", { operation: "google-drive-desktop" }).catch(() => {});
    } else if (i.via === "drive") {
      if (e === "descargando") void invoke("cancel_install", { operation: "google-drive" }).catch(() => {});
      if (e === "conectando") void invoke("cancel_google_drive_login").catch(() => {});
    } else if (i.via === "proveedor" && e === "conectando" && !conToken) {
      void invoke("cancel_browser_login", { id: i.id, scope: await scope }).catch(() => {});
    } else if (i.via !== "proveedor" && esperandoMcp === i.id) {
      esperandoMcp = null;
      void invoke("disconnect_known_mcp", { id: i.id }).catch(() => {});
    }
  }

  async function desconectar(i: Integracion) {
    setErrores(i.id, null);
    // Solo deja de usarla Terminus: la app de Google sigue instalada y con su sesión.
    if (i.via === "drive" && oficial()) {
      try {
        await invoke("set_google_drive_desktop_use", { used: false });
        setEscritorio((o) => (o ? { ...o, unused: true } : o));
      } catch (e) {
        setErrores(i.id, explicar(e));
      }
      setEstados(i.id, guardado(i));
      return contarConectadas();
    }
    setEstados(i.id, { k: "saliendo" });
    try {
      if (i.via === "drive") await invoke("disconnect_google_drive");
      else if (i.via === "proveedor") await invoke("disconnect_git_host", { id: i.id, scope: await scope });
      else await invoke("disconnect_known_mcp", { id: i.id });
    } catch (e) {
      setErrores(i.id, explicar(e));
    }
    setEstados(i.id, { k: "libre" });
    await cargar();
  }

  const formularioAbierto = (i: Integracion) =>
    i.via === "proveedor" && (estados[i.id]?.k === "formulario" || (estados[i.id]?.k === "conectando" && Boolean(borradores[i.id]?.token)));

  const detalle = (i: Integracion) => {
    const e = estados[i.id];
    if (i.via === "incluido") return descripcion(i.id);
    switch (e?.k) {
      case "conectada":
        return e.detalle;
      case "formulario":
        return t("onboarding.tools.fill_below");
      case "detectada":
        return i.via === "drive" ? t("onboarding.tools.drive_app.unused", { where: e.detalle }) : e.detalle;
      case "descargando":
        if (i.id === "zotero") return t("onboarding.tools.references.zotero_downloading");
        return i.via === "drive" && oficial() ? t("onboarding.tools.drive_app.downloading") : t("onboarding.tools.downloading_cli_start");
      case "instalando":
        if (i.id === "zotero") return t("onboarding.tools.references.zotero_installing");
        return isMac() ? t("onboarding.tools.drive_app.installing_mac") : t("onboarding.tools.drive_app.installing_windows");
      case "abriendo":
        return t("onboarding.tools.references.zotero_opening");
      case "permiso":
        return t("onboarding.tools.references.zotero_permission");
      case "sesion":
        return t("onboarding.tools.drive_app.sign_in");
      case "conectando":
        if (formularioAbierto(i)) return t("onboarding.tools.checking_token");
        if (e.codigo) return t("onboarding.login.confirm_in_browser");
        return t("onboarding.tools.finish_in_browser");
      case "saliendo":
        return t("onboarding.ai.disconnecting");
      default:
        if (i.id === "zotero" && zotero()?.installed && !zotero()?.running) return t("onboarding.tools.references.zotero_closed");
        return descripcion(i.id);
    }
  };

  function Tarjeta(p: { i: Integracion }) {
    const e = () => estados[p.i.id];
    const nombre = p.i.nombre;
    const fallo = () => Boolean(errores[p.i.id]) && !formularioAbierto(p.i);
    const cancelarEsta = () => (
      <CancelButton label={t("onboarding.tools.cancel_connect", { name: nombre })} onClick={() => void cancelar(p.i)} />
    );
    // El aviso de Zotero se despliega dentro de su tarjeta, no en una caja aparte.
    const permiso = () => p.i.id === "zotero" && e()?.k === "permiso";
    return (
      <div
        class={cn(
          "relative grid overflow-hidden rounded-lg border",
          permiso() && "sm:col-span-2",
          e()?.k === "conectada" && p.i.via !== "incluido" && "border-success-strong/40 bg-success/5",
          ["conectando", "formulario", "descargando", "instalando", "sesion", "abriendo", "permiso"].includes(e()?.k ?? "") && "border-primary bg-primary/5",
          (!e() || ["libre", "saliendo", "detectada"].includes(e()!.k) || p.i.via === "incluido") && "border-border bg-surface-raised",
          // Al final: `cn` deja la última clase de borde, y un fallo tiene que verse rojo.
          fallo() && "animate-sacudir border-error-strong bg-surface-raised",
        )}
      >
        <div class="relative flex h-[56px] items-center gap-3 px-3 py-2">
        <span class="grid size-[26px] shrink-0 place-items-center rounded-md bg-surface-muted text-neutral-950">
          <MarcaIntegracion id={p.i.id} size={15} />
        </span>
        <span class="grid min-w-0 flex-1 gap-px">
          <strong class="truncate text-ui font-semibold text-neutral-950">{nombre}</strong>
          <span class={cn("truncate text-caption", fallo() ? "text-error-strong" : "text-neutral-500")} title={fallo() ? (errores[p.i.id] ?? "") : detalle(p.i)}>
            {fallo() ? errores[p.i.id] : detalle(p.i)}
          </span>
        </span>
        <span class="flex w-[148px] shrink-0 items-center justify-end gap-1.5">
          <Switch
            fallback={
              <>
                <Show when={fallo()}>
                  <TriangleAlert size={15} class="shrink-0 text-error-strong" aria-hidden="true" />
                </Show>
                <Show when={!fallo() && p.i.via === "drive" && oficial() && !escritorio()?.installed}>
                  <Peso bytes={escritorio()?.installer_bytes} />
                </Show>
                <Show when={!fallo() && p.i.id === "zotero" && zotero() && !zotero()!.installed}>
                  <Peso bytes={zotero()?.installer_bytes} />
                </Show>
                <Button size="compact" variant="secondary" onClick={() => void conectar(p.i)}>
                  {fallo() ? t("onboarding.ai.retry") : t("onboarding.ai.connect")}
                </Button>
              </>
            }
          >
            <Match when={p.i.via === "incluido"}>
              <Badge tone="success" class="gap-1">
                <Check size={11} stroke-width={3} aria-hidden="true" />
                {t("onboarding.tools.included")}
              </Badge>
            </Match>
            <Match when={e()?.k === "conectada"}>
              <Badge tone="success" class="gap-1">
                <Check size={11} stroke-width={3} aria-hidden="true" />
                {t("onboarding.tools.connected")}
              </Badge>
              {/* Zotero no tiene sesión que cerrar: es la app de la persona. */}
              <Show when={p.i.id !== "zotero"}>
                <RemoveButton
                  icon="unlink"
                  label={p.i.via === "drive" && oficial() ? t("onboarding.tools.drive_app.stop") : t("onboarding.ai.disconnect", { name: nombre })}
                  onClick={() => void desconectar(p.i)}
                />
              </Show>
            </Match>
            <Match when={e()?.k === "abriendo"}>
              <Spinner size={18} class="text-primary" />
              {cancelarEsta()}
            </Match>
            <Match when={e()?.k === "permiso"}>{null}</Match>
            <Match when={e()?.k === "detectada"}>
              <Button size="compact" variant="secondary" onClick={() => void conectar(p.i)}>
                {p.i.via === "drive" ? t("onboarding.ai.use_this") : t("onboarding.tools.authorize")}
              </Button>
            </Match>
            <Match when={e()?.k === "instalando"}>
              <Spinner size={18} class="text-primary" />
            </Match>
            <Match when={e()?.k === "sesion"}>
              <Button
                size="compact"
                variant="secondary"
                onClick={() => void invoke("open_google_drive_desktop").catch((x) => setErrores(p.i.id, explicar(x)))}
              >
                {t("onboarding.tools.drive_app.open")}
              </Button>
              {cancelarEsta()}
            </Match>
            <Match when={e()?.k === "descargando" && e()}>
              {(d) => {
                const x = () => d() as { hecho: number; total: number | null };
                return (
                  <AvanceDeDescarga
                    total={x().total}
                    cancelar={t("onboarding.tools.cancel_connect", { name: nombre })}
                    onCancelar={() => void cancelar(p.i)}
                  />
                );
              }}
            </Match>
            <Match when={e()?.k === "conectando"}>
              <Show when={(e() as { codigo?: string }).codigo} fallback={<Spinner size={18} class="text-primary" />}>
                {(c) => <CodigoParaConfirmar codigo={c()} />}
              </Show>
              <Show when={!formularioAbierto(p.i)}>{cancelarEsta()}</Show>
            </Match>
            <Match when={e()?.k === "formulario"}>{cancelarEsta()}</Match>
            <Match when={e()?.k === "saliendo"}>
              <Spinner class="text-neutral-500" />
            </Match>
          </Switch>
        </span>
        <Show when={e()?.k === "descargando" && (e() as { hecho: number; total: number | null })}>
          {(d) => <BarraDeCarga hecho={d().hecho} total={d().total} />}
        </Show>
        <Show when={e()?.k === "instalando"}>
          <BarraDeCarga hecho={0} total={null} />
        </Show>
        </div>
        <Show when={permiso()}>
          <div class="grid gap-2 border-t border-primary/30 px-3 py-3 motion-safe:animate-entrar" role="status">
            <strong class="text-ui font-semibold">{t("onboarding.tools.references.zotero_permission_title")}</strong>
            <p class="m-0 text-ui">{t("settings.references.zotero.error_local_api")}</p>
            <div class="mt-0.5 flex flex-wrap items-center gap-2">
              <span class="text-xs text-neutral-500">{t("onboarding.tools.references.zotero_permission_why")}</span>
              <span class="flex-1" />
              <Button size="sm" variant="ghost" onClick={() => void invoke("open_zotero").catch((x) => setErrores("zotero", explicar(x)))}>
                {t("onboarding.tools.references.zotero_open")}
              </Button>
              <Button size="sm" onClick={() => void conectar(p.i)}>
                {t("onboarding.ai.retry")}
              </Button>
            </div>
          </div>
        </Show>
        {/* Los `.bib` que siguen a Zotero los vincula el agente («conecta refs.bib con mi colección X»). */}
        <Show when={p.i.id === "zotero" && e()?.k === "conectada" && bibs().length > 0}>
          <div class="grid gap-1 border-t border-border px-3 py-2">
            <For each={bibs()}>
              {(b) => (
                <div class="flex min-h-7 min-w-0 items-center gap-2 text-xs">
                  <FileText size={13} class="shrink-0 text-neutral-500" aria-hidden="true" />
                  <span class="min-w-0 flex-1 truncate font-medium" title={b.archivo}>
                    {nombreDeArchivo(b.archivo)}
                  </span>
                  <span class={cn("min-w-0 truncate", b.fallo ? "text-error-strong" : "text-neutral-500")} title={b.fallo ?? undefined}>
                    {b.fallo
                      ? t("settings.references.zotero.bib_failed")
                      : b.coleccion
                        ? t("settings.references.zotero.bib_collection", { name: b.coleccion })
                        : t("settings.references.zotero.bib_cited")}
                  </span>
                  <RemoveButton
                    icon="unlink"
                    label={t("settings.references.zotero.bib_unlink", { name: nombreDeArchivo(b.archivo) })}
                    onClick={() => void desvincularBib(b.archivo)}
                  />
                </div>
              )}
            </For>
            <div class="flex justify-end">
              <Button size="sm" variant="ghost" disabled={sincronizandoBibs()} onClick={() => void sincronizarBibs()}>
                {sincronizandoBibs() ? t("settings.references.zotero.bib_syncing") : t("settings.references.zotero.bib_sync")}
              </Button>
            </div>
          </div>
        </Show>
      </div>
    );
  }

  /** «Sincronizar con Zotero»: vuelve a traer cada `.bib` vinculado; el fallo de uno queda en su fila. */
  async function sincronizarBibs() {
    setSincronizandoBibs(true);
    setErrores("zotero", null);
    try {
      setBibs(await invoke<VinculoBib[]>("sync_zotero_bibs"));
    } catch (x) {
      setErrores("zotero", explicar(x));
    } finally {
      setSincronizandoBibs(false);
    }
  }

  async function desvincularBib(archivo: string) {
    try {
      await invoke("unlink_zotero_bib", { path: archivo });
      setBibs(await invoke<VinculoBib[]>("zotero_bib_links"));
    } catch (x) {
      setErrores("zotero", explicar(x));
    }
  }

  /** Datos y token del servicio, con los textos que da el motor; Bitbucket con los del diseño. */
  function Formulario(q: { i: Integracion }) {
    const p = () => proveedor(q.i.id);
    const ocupado = () => estados[q.i.id]?.k === "conectando";
    const error = () => errores[q.i.id];
    const bitbucket = q.i.id === "bitbucket";
    const poner = (campo: string, valor: string) =>
      setBorradores(q.i.id, (b) => ({ ...(b ?? SIN_BORRADOR), data: { ...(b?.data ?? {}), [campo]: valor } }));
    const listo = () =>
      Boolean(p()) && borrador(q.i.id).token.trim() !== "" && !p()!.fields.some((c) => c.required && !borrador(q.i.id).data[c.id]?.trim());
    const alEnter = (e: KeyboardEvent) => {
      if (e.key === "Enter" && listo() && !ocupado()) void conectarConToken(q.i);
    };
    return (
      <Show when={p()}>
        {(prov) => (
          <div class="grid gap-2 rounded-lg border border-primary bg-surface-raised px-4 py-3.5 motion-safe:animate-entrar">
            <p class="m-0 flex items-center gap-2 text-ui">
              <MarcaIntegracion id={q.i.id} size={16} />
              <strong class="font-semibold">{t("onboarding.tools.credential.title", { name: q.i.nombre })}</strong>
            </p>
            <Show when={motivos[q.i.id]}>
              {(m) => (
                <p class="m-0 text-xs break-words text-error-strong" role="alert">
                  {m()}
                </p>
              )}
            </Show>
            <div class="grid gap-3 md:grid-cols-2">
              <For each={prov().fields}>
                {(c, n) => (
                  <label class="grid gap-1.5">
                    <span class="text-ui font-semibold">
                      {bitbucket ? t("onboarding.tools.bitbucket.space") : prosa(c.label)}
                    </span>
                    <Input
                      spellcheck={false}
                      placeholder={bitbucket ? t("onboarding.tools.bitbucket.space_placeholder") : undefined}
                      value={borrador(q.i.id).data[c.id] ?? ""}
                      disabled={ocupado()}
                      ref={(el) => n() === 0 && queueMicrotask(() => el.focus())}
                      onInput={(e) => poner(c.id, e.currentTarget.value)}
                      onKeyDown={alEnter}
                    />
                    <span class="text-xs text-neutral-500">
                      {bitbucket ? <EspacioEnNegrita /> : prosa(c.help)}
                    </span>
                  </label>
                )}
              </For>
              <label class="grid gap-1.5">
                <span class="text-ui font-semibold">
                  {bitbucket ? t("onboarding.tools.bitbucket.token") : prosa(prov().token_label)}
                </span>
                <Input
                  type="password"
                  class={cn("font-mono tracking-[0.02em]", error() && "border-error-strong")}
                  autocomplete="off"
                  spellcheck={false}
                  placeholder={bitbucket ? t("onboarding.tools.bitbucket.token_placeholder") : undefined}
                  value={borrador(q.i.id).token}
                  disabled={ocupado()}
                  aria-invalid={error() ? true : undefined}
                  ref={(el) => prov().fields.length === 0 && queueMicrotask(() => el.focus())}
                  onInput={(e) => {
                    setErrores(q.i.id, null);
                    setBorradores(q.i.id, (b) => ({ ...(b ?? SIN_BORRADOR), token: e.currentTarget.value }));
                  }}
                  onKeyDown={alEnter}
                />
                <Show
                  when={error()}
                  fallback={
                    <span class="text-xs text-neutral-500">
                      {bitbucket ? t("onboarding.tools.bitbucket.token_hint") : prosa(prov().token_help)}{" "}
                      <button
                        type="button"
                        class="inline-flex cursor-pointer items-center gap-0.5 border-0 bg-transparent p-0 text-primary hover:underline"
                        onClick={() => void invoke("open_external", { target: prov().token_url }).catch(() => {})}
                      >
                        {t("onboarding.tools.credential.create_token")}
                        <ExternalLink size={11} aria-hidden="true" />
                      </button>
                    </span>
                  }
                >
                  {(e) => (
                    <span class="text-xs break-words text-error-strong" role="alert">
                      {e()}
                    </span>
                  )}
                </Show>
              </label>
            </div>
            <div class="mt-0.5 flex flex-wrap items-center gap-2">
              <span class="text-xs text-neutral-500">{t("onboarding.tools.credential.stored")}</span>
              <span class="flex-1" />
              <Button size="sm" variant="ghost" disabled={ocupado()} onClick={() => void cancelar(q.i)}>
                {t("onboarding.cancel")}
              </Button>
              <Button size="sm" disabled={ocupado() || !listo()} onClick={() => void conectarConToken(q.i)}>
                {ocupado() ? t("onboarding.ai.checking") : t("onboarding.ai.connect")}
              </Button>
            </div>
          </div>
        )}
      </Show>
    );
  }

  const visibles = () => {
    const base = integraciones().filter(
      (i) =>
        i.comun ||
        (i.via !== "incluido" &&
          ["formulario", "descargando", "instalando", "sesion", "conectando", "abriendo", "permiso", "conectada"].includes(estados[i.id]?.k ?? "")),
    );
    // Por id: integraciones() arma objetos nuevos en cada lectura.
    const vistas = new Set(base.map((i) => i.id));
    return verMas() ? [...base, ...integraciones().filter((i) => !vistas.has(i.id))] : base;
  };
  // Como el diseño: la pila de «Ver más» enseña todo lo que no es común, aunque ya esté a la vista.
  const escondidas = () => integraciones().filter((i) => !i.comun);

  return (
    <>
      <div class="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <For each={visibles()}>{(i) => <Tarjeta i={i} />}</For>
      </div>
      <Show when={falloDeCarga()}>{(e) => <ErrorDeTarjeta class="rounded-md border-t" texto={e()} />}</Show>
      <For each={integraciones().filter(formularioAbierto)}>{(i) => <Formulario i={i} />}</For>
      <VerMas
        abierto={verMas()}
        resto={escondidas().map((i) => ({ id: i.id, nombre: i.nombre, icono: <MarcaIntegracion id={i.id} size={12} /> }))}
        primero={["gitlab", "bitbucket", "notion"]}
        onClick={() => setVerMas((v) => !v)}
      />
    </>
  );
}

/** Los plugins se instalan dentro de su tarjeta; instalar sigue en segundo plano si se avanza. */
export function Plugins(props: { onCambio: (estado: { instalados: number; instalando: number }) => void }) {
  const [catalogo, setCatalogo] = createSignal<{ workspace: string; plugins: Plugin[] } | null>(null);
  const [falloDeCarga, setFalloDeCarga] = createSignal<string | null>(null);
  const [ocupados, setOcupados] = createStore<Record<string, "instalando" | "desinstalando" | "cancelado" | undefined>>({});
  const [errores, setErrores] = createStore<Record<string, string | null>>({});
  const [avances, setAvances] = createStore<Record<string, { hecho: number; total: number }>>({});
  const [pesos, setPesos] = createStore<Record<string, number | null>>({});
  const [verMas, setVerMas] = createSignal(false);
  let cerrada = false;

  const plugins = () =>
    [...(catalogo()?.plugins ?? [])]
      .filter((p) => ORDEN_PLUGINS.includes(p.id))
      .sort((a, b) => ORDEN_PLUGINS.indexOf(a.id) - ORDEN_PLUGINS.indexOf(b.id));
  const instalando = (p: Plugin) => ocupados[p.id] === "instalando" || (p.installing && !ocupados[p.id]);
  const peso = (p: Plugin) => {
    const b = pesos[p.id];
    if (b) return mb(b);
    return CON_PESO.has(p.id) ? t(`onboarding.tools.size.${p.id}`) : "";
  };

  function avisar() {
    props.onCambio({
      instalados: plugins().filter((p) => p.installed && !ocupados[p.id]).length,
      instalando: plugins().filter(instalando).length,
    });
  }

  async function cargar() {
    try {
      const c = await invoke<{ workspace: string; plugins: Plugin[] }>("list_integrations");
      if (cerrada) return;
      setCatalogo(c);
      avisar();
      for (const p of c.plugins.filter((x) => ORDEN_PLUGINS.includes(x.id) && pesos[x.id] === undefined)) {
        setPesos(p.id, null);
        invoke<number>("install_size", { operation: `plugin:${p.id}` })
          .then((b) => setPesos(p.id, b))
          .catch(() => {});
      }
    } catch (e) {
      setFalloDeCarga(explicar(e));
    }
  }
  onMount(() => void cargar());
  const cambios = listen("integrations-changed", () => void cargar());
  const avance = listen<{ operation: string; kind: string; done: number; bytes: number }>("install", (e) => {
    const id = e.payload.operation.startsWith("plugin:") ? e.payload.operation.slice(7) : null;
    if (!id || e.payload.bytes <= 0) return;
    setAvances(id, { hecho: e.payload.done, total: e.payload.bytes });
  });
  onCleanup(() => {
    cerrada = true;
    void cambios.then((f) => f());
    void avance.then((f) => f());
  });

  async function instalar(p: Plugin) {
    const workspace = catalogo()?.workspace;
    if (!workspace) return;
    setErrores(p.id, null);
    setAvances(p.id, { hecho: 0, total: pesos[p.id] ?? 0 });
    setOcupados(p.id, "instalando");
    avisar();
    try {
      await invoke("install_integration", { id: p.id });
      await invoke("set_integration_enabled", { id: p.id, workspace, enabled: true });
    } catch (e) {
      if (!cerrada && ocupados[p.id] !== "cancelado" && !`${prosaDe(e)} ${detalleDe(e)}`.includes("install.cancelled")) setErrores(p.id, explicar(e));
    }
    if (cerrada) return;
    setOcupados(p.id, undefined);
    await cargar();
  }

  // La tarjeta vuelve al instante; el motor termina de cortar por detrás.
  function cancelar(p: Plugin) {
    setOcupados(p.id, "cancelado");
    avisar();
    void invoke("cancel_install", { operation: `plugin:${p.id}` }).catch(() => {});
  }

  async function desinstalar(p: Plugin) {
    setErrores(p.id, null);
    setOcupados(p.id, "desinstalando");
    avisar();
    try {
      // Un Tinymist vivo bloquea en Windows la carpeta que desinstalar borra.
      if (p.id === "typst") await invoke("typst_live_stop", { key: null, session: null }).catch(() => {});
      await invoke("uninstall_integration", { id: p.id });
    } catch (e) {
      setErrores(p.id, explicar(e));
    }
    setOcupados(p.id, undefined);
    await cargar();
  }

  function Tarjeta(q: { p: Plugin }) {
    const nombre = () => t(`onboarding.tools.plugin.${q.p.id}`);
    const sub = () => errores[q.p.id] ?? (!q.p.supported && !q.p.installed ? t("onboarding.tools.unsupported") : descripcion(q.p.id));
    const av = () => avances[q.p.id];
    return (
      <div
        class={cn(
          "relative flex h-16 items-center gap-3 overflow-hidden rounded-lg border px-3.5 py-2.5",
          instalando(q.p)
            ? "border-primary bg-primary/5"
            : q.p.installed && !ocupados[q.p.id]
              ? "border-success-strong/40 bg-success/5"
              : "border-border bg-surface-raised",
        )}
      >
        <span class="grid size-[26px] shrink-0 place-items-center rounded-md bg-surface-muted text-neutral-950">
          <MarcaPlugin id={q.p.id} size={15} />
        </span>
        <span class="grid min-w-0 flex-1 gap-1">
          <strong class="flex min-w-0 items-center text-ui leading-[1.2] font-semibold text-neutral-950">
            <span class="truncate">{nombre()}</span>
            <Show when={RECOMENDADOS.includes(q.p.id)}>
              <span class="ml-1 shrink-0 rounded-full bg-primary/10 px-1.5 py-px text-2xs font-medium text-primary">
                {t("onboarding.tools.recommended")}
              </span>
            </Show>
          </strong>
          <span class={cn("truncate text-caption", errores[q.p.id] ? "text-error-strong" : "text-neutral-500")} title={sub()}>
            {sub()}
          </span>
        </span>
        <span class="flex w-[176px] shrink-0 items-center justify-end gap-1.5">
          <Switch
            fallback={
              <>
                <span class="text-caption whitespace-nowrap text-neutral-500">{peso(q.p)}</span>
                <Button
                  size="compact"
                  variant="secondary"
                  class="ml-1"
                  disabled={!q.p.supported}
                  onClick={() => void instalar(q.p)}
                >
                  {errores[q.p.id] ? t("onboarding.ai.retry") : t("onboarding.tools.install")}
                </Button>
              </>
            }
          >
            <Match when={instalando(q.p)}>
              <AvanceDeDescarga
                total={av()?.total ?? null}
                cancelar={t("onboarding.ai.cancel_download", { name: nombre() })}
                onCancelar={() => cancelar(q.p)}
              />
            </Match>
            <Match when={ocupados[q.p.id] === "desinstalando"}>
              <span class="text-caption whitespace-nowrap text-neutral-500">{t("onboarding.tools.uninstalling")}</span>
              <Spinner class="text-neutral-500" />
            </Match>
            <Match when={q.p.installed}>
              <span class="text-caption whitespace-nowrap text-neutral-500">{peso(q.p)}</span>
              <Badge tone="success" class="gap-1">
                <Check size={11} stroke-width={3} aria-hidden="true" />
                {t("onboarding.tools.installed")}
              </Badge>
              <RemoveButton
                icon="trash"
                label={t("onboarding.tools.uninstall", { name: nombre() })}
                onClick={() => void desinstalar(q.p)}
              />
            </Match>
          </Switch>
        </span>
        <Show when={instalando(q.p)}>
          <BarraDeCarga hecho={av()?.hecho ?? 0} total={av()?.total ?? null} />
        </Show>
      </div>
    );
  }

  const visibles = () => {
    const base = plugins().filter((p) => RECOMENDADOS.includes(p.id) || p.installed || instalando(p));
    const vistos = new Set(base.map((p) => p.id));
    return verMas() ? [...base, ...plugins().filter((p) => !vistos.has(p.id))] : base;
  };
  const escondidos = () => plugins().filter((p) => !visibles().includes(p));

  return (
    <>
      <div class="grid gap-2">
        <For each={visibles()}>{(p) => <Tarjeta p={p} />}</For>
      </div>
      <Show when={falloDeCarga()}>{(e) => <ErrorDeTarjeta class="rounded-md border-t" texto={e()} />}</Show>
      <VerMas
        abierto={verMas()}
        resto={escondidos().map((p) => ({ id: p.id, nombre: t(`onboarding.tools.plugin.${p.id}`), icono: <MarcaPlugin id={p.id} size={12} /> }))}
        onClick={() => setVerMas((v) => !v)}
      />
    </>
  );
}
