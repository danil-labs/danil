import { invoke } from "../../lib/invoke.ts";
import Bot from "lucide-solid/icons/bot";
import CircleUserRound from "lucide-solid/icons/circle-user-round";
import CreditCard from "lucide-solid/icons/credit-card";
import ExternalLink from "lucide-solid/icons/external-link";
import Folders from "lucide-solid/icons/folders";
import GitBranch from "lucide-solid/icons/git-branch";
import Monitor from "lucide-solid/icons/monitor";
import Plug from "lucide-solid/icons/plug";
import Shield from "lucide-solid/icons/shield";
import SlidersHorizontal from "lucide-solid/icons/sliders-horizontal";
import Sparkles from "lucide-solid/icons/sparkles";
import { listen } from "../../lib/serviceEvents";
import { createResource, createSignal, For, type JSX, lazy, onCleanup, onMount, Show, Suspense } from "solid-js";
import { Dynamic } from "solid-js/web";
import { capabilities } from "../../lib/platform";
import { t } from "../../lib/i18n";
import { flechaDeLista } from "../../lib/shortcuts";
import { type Superficie } from "../../lib/surfaces";
import { cn } from "../../lib/utils";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Select } from "../../ui/Select";
import { Dialog, DialogContent, DialogTitle } from "../../ui/Dialog";
import { Close } from "../../ui/icons";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "../../ui/sidebar";
import type { ModelChoices } from "../projects/NewAgent";
import type { SurfacesState } from "./ai-providers-view";
import { asFailure } from "../../ui/Failure";
import AIProviders from "./AIProviders";
import Connections from "./Connections";
import ConnectionsOperation from "./ConnectionsOperation";
import { CustomerAgents, CustomerConnections } from "./CustomerService";
import Environment from "./Environment";
import { machines } from "../machines/store";
import { secretsRoute } from "./secrets-support";
import General from "./General";
import Integrations from "./Integrations";
import { PaquetesDeLengua } from "./LanguagePacks";
import type { ContextoDeProyectos } from "./ManageProjects";
import ProveedorDeMemoria from "./MemoryProvider";
import { NotifyBehavior } from "./NotifyBehavior";
import Providers from "./Providers";
import { SETTINGS_ENTRIES, type SettingsEntryId, type SettingsGroup, settingsTarget } from "./settings-entries";
import Skills from "./Skills";
import Workspaces from "./Workspaces";
import { SettingsPanel, SettingsSection } from "./layout";
import "../../locales/settingsPhrases";
// Chunks aparte: solo los carga quien abre la sección.
const DanilAccount = lazy(() => import("./DanilAccount"));
const SupportAccess = lazy(() => import("./SupportAccess"));
const ActivityLogs = lazy(() => import("./ActivityLogs"));
const Appearance = lazy(() => import("./Appearance"));
const ManageProjects = lazy(() => import("./ManageProjects"));
const Agents = lazy(() => import("./Agents"));
const AppDownloads = lazy(() => import("./AppDownloads"));

/** Portal del Harness, servicio aparte; el escritorio lo abre en el navegador. */
const HARNESS_URL = "https://harness.danil.ai/";
const Secrets = lazy(() => import("./Secrets"));

/**
 * Configuración: siete entradas, y lo que eran secciones sueltas va en
 * pestañas dentro de su entrada (`settings-entries.ts`).
 */

/** `panel: null` es una pestaña que la app todavía no tiene: sale con «pronto». */
type Pestana = { id: string; name: string; panel: (() => JSX.Element) | null };

type Entrada = {
  id: SettingsEntryId;
  group: SettingsGroup;
  name: string;
  icono: () => JSX.Element;
  tabs: Pestana[];
};

/** Lo que la sección de agentes necesita de la ventana. Getters: leerlos aquí
 *  haría a `entrada()` depender de ellos. */
type ContextoDeAgentes = {
  readonly modelos: ModelChoices;
  readonly proyecto: string;
  /** Los agentes de las tareas abiertas: sus proveedores llegan desplegados. */
  readonly agentesEnUso: string[];
  onAgentProfile: (project: string, name: string) => void;
  /** Si `list_surfaces` todavía no contesta, contestó o falló. */
  readonly estadoSuperficies: SurfacesState;
  reintentarSuperficies: () => void;
};

/**
 * **Recibe el accesor de `superficies` y no la lista, y eso es carga
 * estructural.** Si leyera la lista, cada refresco de `list_surfaces` daría
 * pestañas nuevas y remontaría `AIProviders` entero, llevándose a media
 * autenticación el campo del código de «Agregar cuenta» (medido: 36 s con el
 * CLI esperando). Los nombres son getters por lo mismo: leídos aquí, cambiar
 * de lengua remontaría General antes de guardar la lengua.
 */
const pestanasDe = (
  superficies: () => Superficie[],
  agentes: ContextoDeAgentes,
  proyectos: ContextoDeProyectos | undefined,
  workspace: () => string | null,
  activityMachine: () => string | null,
  agentsWorkspace: () => string | null,
): Record<string, Pestana | undefined> => {
  const cuenta = capabilities().danilAccount || capabilities().accountProfile;
  const tab = (id: string, name: () => string, panel: Pestana["panel"]): Pestana => ({ id, get name() { return name(); }, panel });
  return {
    "cuenta-danil": cuenta ? tab("cuenta-danil", () => t("settings.tab.profile"), () => <Suspense fallback={null}><DanilAccount part="profile" /></Suspense>) : undefined,
    emails: capabilities().accountEmails ? tab("emails", () => t("settings.tab.emails"), () => <Suspense fallback={null}><DanilAccount part="emails" /></Suspense>) : undefined,
    usage: capabilities().accountUsage ? tab("usage", () => t("settings.tab.usage"), () => capabilities().accountUsage?.()) : undefined,
    plan: capabilities().personalAccount?.plan ? tab("plan", () => t("settings.tab.plan"), () => capabilities().personalAccount?.plan?.()) : undefined,
    support: capabilities().personalAccount && capabilities().supportAccess ? tab("support", () => t("web.admin.support"), () => <Suspense fallback={null}><SettingsPanel><SupportAccess source={capabilities().supportAccess!} /></SettingsPanel></Suspense>) : undefined,
    security: tab("security", () => t("settings.tab.security"), null),
    general: tab("general", () => t("settings.nav.general"), () => <General />),
    appearance: tab("appearance", () => t("settings.nav.appearance"), () => <Suspense fallback={null}><Appearance proyecto={agentes.proyecto} /></Suspense>),
    notify: tab("notify", () => t("settings.tab.notify"), () => <SettingsPanel><SettingsSection title={t("settings.tab.notify")}><NotifyBehavior /></SettingsSection></SettingsPanel>),
    languages: tab("languages", () => t("settings.languages.title"), () => <SettingsPanel><PaquetesDeLengua /></SettingsPanel>),
    workspaces: tab("workspaces", () => t("settings.tab.workspace_bar"), () => <Workspaces />),
    download: capabilities().appDownloads ? tab("download", () => t("web.download.tab"), () => <Suspense fallback={null}><AppDownloads /></Suspense>) : undefined,
    "proveedores-ia": tab("proveedores-ia", () => t("settings.nav.ai_providers"), () => <AIProviders superficies={superficies()} agentesEnUso={agentes.agentesEnUso} estado={agentes.estadoSuperficies} onRetry={agentes.reintentarSuperficies} />),
    machines: cuenta ? tab("machines", () => t("settings.tab.machines"), () => <Suspense fallback={null}><DanilAccount part="machines" /></Suspense>) : undefined,
    entorno: tab("entorno", () => t("settings.nav.environment"), () => <Environment />),
    activity: tab("activity", () => t("activity.title"), () => <Suspense fallback={null}><ActivityLogs workspace={workspace()} machine={activityMachine()} /></Suspense>),
    proyectos: tab("proyectos", () => t("settings.tab.folders"), proyectos ? () => <Suspense fallback={null}><ManageProjects contexto={proyectos} /></Suspense> : null),
    fuentes: tab("fuentes", () => t("settings.nav.sources"), () => <Providers />),
    secrets: tab("secrets", () => t("settings.tab.secrets"), capabilities().nativeWindow || capabilities().accountCredentials ? () => <Suspense fallback={null}><Secrets /></Suspense> : null),
    agentes: tab("agentes", () => t("settings.nav.agents"), () => (
      <Suspense fallback={null}>
        <Agents
          modelos={agentes.modelos}
          proyecto={agentes.proyecto}
          onAgentProfile={agentes.onAgentProfile}
          after={<CustomerAgents workspace={agentsWorkspace} />}
        />
      </Suspense>
    )),
    skills: tab("skills", () => t("settings.nav.skills"), () => <Skills />),
    operation: tab("operation", () => t("settings.skills.tab_mcp"), () => <ConnectionsOperation />),
    plugins: tab("plugins", () => t("settings.tab.plugins"), () => <SettingsPanel><Integrations /></SettingsPanel>),
    memory: tab("memory", () => t("settings.tab.memory"), () => <SettingsPanel><ProveedorDeMemoria /></SettingsPanel>),
    external: cuenta ? tab("external", () => t("settings.tab.external"), () => <Suspense fallback={null}><Connections workspace={workspace()} /></Suspense>) : undefined,
    customers: tab("customers", () => t("settings.tab.customers"), () => <CustomerConnections workspace={agentsWorkspace} />),
    business: capabilities().businessBilling ? tab("business", () => t("settings.tab.business"), () => capabilities().businessBilling?.("plan")) : undefined,
    fiscal: capabilities().businessBilling ? tab("fiscal", () => t("settings.tab.fiscal"), () => capabilities().businessBilling?.("fiscal")) : undefined,
  };
};

const ENCABEZADOS: Record<SettingsEntryId, { name: () => string; icono: () => JSX.Element }> = {
  account: { name: () => t("settings.entry.account"), icono: () => <CircleUserRound size={15} /> },
  preferences: { name: () => t("settings.entry.preferences"), icono: () => <SlidersHorizontal size={15} /> },
  "ai-accounts": { name: () => t("settings.entry.ai_accounts"), icono: () => <Sparkles size={15} /> },
  "source-control": { name: () => t("settings.entry.source_control"), icono: () => <GitBranch size={15} /> },
  machines: { name: () => t("settings.entry.machines"), icono: () => <Monitor size={15} /> },
  projects: { name: () => t("settings.entry.projects"), icono: () => <Folders size={15} /> },
  "agents-skills": { name: () => t("settings.entry.agents_skills"), icono: () => <Bot size={15} /> },
  connections: { name: () => t("settings.nav.connections"), icono: () => <Plug size={15} /> },
  billing: { name: () => t("settings.entry.billing"), icono: () => <CreditCard size={15} /> },
};

/** Una entrada sale si tiene alguna pestaña que ya existe. */
const entradasDe = (pestanas: Record<string, Pestana | undefined>): Entrada[] =>
  SETTINGS_ENTRIES.flatMap((e) => {
    const tabs = e.tabs.flatMap((id) => (pestanas[id] ? [pestanas[id]!] : []));
    if (!tabs.some((p) => p.panel)) return [];
    const h = ENCABEZADOS[e.id];
    return [{ id: e.id, group: e.group, get name() { return h.name(); }, icono: h.icono, tabs }];
  });

const GRUPOS: { id: SettingsGroup; nombre: () => string }[] = [
  { id: "you", nombre: () => t("settings.nav.group_you") },
  { id: "workspace", nombre: () => t("settings.nav.group_workspace") },
];

/** Una entrada con solo pestañas de cuenta personal, mientras llega si la cuenta lo es. */
const SIN_PESTANA: Pestana = { id: "", name: "", panel: null };

const idTab = (id: string) => `cfg-tab-${id}`;
const idSub = (id: string) => `cfg-sub-${id}`;

/** El enlace al Harness: en la web de alfa, solo para owner y admin; el escritorio no sabe el rol y la ofrece siempre. Es un enlace de verdad: siempre a `/admin`, en otra pestaña. */
function AdminLink() {
  const page = capabilities().adminPage;
  const [allowed] = createResource(async () => (page ? await page.allowed().catch(() => false) : capabilities().nativeWindow));
  const href = page?.href ?? HARNESS_URL;
  /** El escritorio no abre pestañas: lo manda al navegador. */
  const open = (event: MouseEvent) => {
    if (page) return;
    event.preventDefault();
    void invoke("open_external", { target: HARNESS_URL }).catch(() => {});
  };
  return (
    <Show when={allowed()}>
      <div class="mt-auto border-0 border-t border-solid border-border px-0 pb-3 pl-2 pt-2">
        <SidebarMenu role="presentation">
          <SidebarMenuItem role="presentation">
            <SidebarMenuButton
              as="a"
              href={href}
              target="_blank"
              rel="noopener"
              data-settings-admin=""
              selectionMark={false}
              class="h-10 min-h-10 grid-cols-[18px_minmax(0,1fr)_auto] gap-2.5 rounded-l-[10px] rounded-r-none border-0 py-0 pl-3.5 pr-3"
              onClick={open}
            >
              <span class="flex size-4 items-center justify-center"><Shield size={15} /></span>
              <span class="truncate">{t("web.admin.title")}</span>
              <ExternalLink size={13} class="text-neutral-500" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </div>
    </Show>
  );
}

export default function Settings(props: {
  workspace?: string | null;
  /** Su nombre: con él se avisa si la atención que se ve es de otra cuenta. */
  workspaceName?: string | null;
  /** Id del workspace abierto, o la clave de uno que solo tiene agentes. */
  agentsWorkspace?: string | null;
  activityMachine?: string | null;
  onClose: () => void;
  /** Con qué entrada o pestaña abrir: un id de `settings-entries.ts`, viejo o nuevo. */
  panel?: string;
  /** Con qué se crea un agente desde Agentes: lo mismo que ofrece el riel. */
  modelos: ModelChoices;
  /** La carpeta abierta, donde nace por omisión un agente nuevo. */
  proyecto?: string;
  /** Los agentes de las tareas abiertas. */
  agentesEnUso?: string[];
  /** Abre el perfil de un agente en esa carpeta; quien llama cierra la hoja. */
  onAgentProfile?: (project: string, name: string) => void;
  /** Los proyectos del espacio y lo que se puede hacer con ellos. */
  proyectos?: ContextoDeProyectos;
}) {
  // Lo que se puede elegir para trabajar, que es lo que decide qué proveedores
  // tienen pantalla. Con su estado: aquí no apaga nada, lo enseña.
  const [superficies, setSuperficies] = createSignal<Superficie[]>([]);
  const [estadoSuperficies, setEstadoSuperficies] = createSignal<SurfacesState>({ k: "loading" });
  /**
   * **Sólo se guarda si de verdad cambió**, y eso no es una optimización.
   *
   * `list_surfaces` devuelve objetos nuevos en cada llamada, así que escribir la
   * señal con una respuesta idéntica despierta a todo el que la lea para nada.
   *
   * **Es la tercera de tres defensas, y sola no bastaba.** Las otras dos son
   * `destinosDe`, que recibe el accesor para que el panel no se monte de nuevo,
   * y el `Index` de `AIProviders`, que reutiliza la fila cuando el contenido sí
   * cambia. Esta solo cubre el caso fácil —que no haya cambiado nada— y no el
   * otro: **añadir una cuenta cambia la lista de verdad**, porque la insignia del
   * proveedor sale de `surfaces::sin_cuenta`.
   *
   * Comparar por JSON basta: son datos planos que vienen de Rust en un orden
   * fijo (el de `agents::AGENTS`), así que dos respuestas iguales se serializan
   * igual.
   */
  const cargarSuperficies = () => {
    void invoke<Superficie[]>("list_surfaces")
      .then((s) => {
        setSuperficies((antes) =>
          JSON.stringify(antes) === JSON.stringify(s) ? antes : s,
        );
        setEstadoSuperficies({ k: "ready" });
      })
      // Lo que ya se veía se queda; sin nada, el panel dice por qué (una VM encendiéndose, por ejemplo).
      .catch((e) => setEstadoSuperficies({ k: "failed", f: asFailure(e) }));
  };
  onMount(cargarSuperficies);

  /**
   * **Instalar un CLI cambia lo que esta pantalla afirma, así que se vuelve a
   * preguntar.**
   *
   * Se leía una sola vez al montar. La insignia de cada proveedor sale de aquí
   * —`superficie.marca`, que dice «no instalado» mirando si hay binario— así que
   * tras instalar desde el propio panel la fila seguía diciendo que no está,
   * mientras el botón de instalar sí desaparecía: `Accounts` vuelve a pedir
   * `list_providers` con este mismo evento y esta lista no: quedan dos verdades
   * sobre lo mismo en la misma tarjeta, y la que se lee primero es la falsa —«se
   * instaló pero sale no instalado, y ya no sale instalar»—. `App.tsx` hace lo
   * mismo para el menú del chat.
   */
  onMount(() => {
    const cambios = listen("providers", cargarSuperficies);
    // **Y conectar una cuenta también cambia lo que esta pantalla afirma.** La
    // insignia de un proveedor dice «sin cuenta» mirando cuál está elegida
    // (`surfaces::sin_cuenta`), así que guardar una clave la deja mintiendo
    // igual que la dejaba instalar un CLI. `App.tsx` ya escuchaba este evento
    // para el menú del chat, con el motivo escrito ahí; faltaba aquí.
    const cuenta = listen("account", cargarSuperficies);
    window.addEventListener("harness:consentimiento", cargarSuperficies);
    // Una máquina de la cuenta se encendió o trajo otra rebanada: su lista puede haber llegado.
    window.addEventListener("harness:machine-slices", cargarSuperficies);
    onCleanup(() => {
      window.removeEventListener("harness:consentimiento", cargarSuperficies);
      window.removeEventListener("harness:machine-slices", cargarSuperficies);
      void cambios.then((f) => f());
      void cuenta.then((f) => f());
    });
  });
  const pestanas = pestanasDe(superficies, {
    get modelos() {
      return props.modelos;
    },
    get proyecto() {
      return props.proyecto ?? "";
    },
    get agentesEnUso() {
      return props.agentesEnUso ?? [];
    },
    onAgentProfile: (project, name) => props.onAgentProfile?.(project, name),
    get estadoSuperficies() {
      return estadoSuperficies();
    },
    reintentarSuperficies: () => {
      setEstadoSuperficies({ k: "loading" });
      cargarSuperficies();
    },
  }, props.proyectos, () => props.workspace ?? null, () => props.activityMachine ?? null, () => props.agentsWorkspace ?? null);
  const ENTRADAS = entradasDe(pestanas);

  // Sin soporte del motor activo, Secretos no se ofrece; su enlace directo sí abre el aviso.
  const [personal] = createResource(async () => (await capabilities().personalAccount?.isPersonal().catch(() => false)) ?? false);
  const dePersonal = (p: Pestana) => ["plan", "support"].includes(p.id);
  const pestanaVisible = (p: Pestana) => (dePersonal(p) ? personal() === true : p.id !== "secrets" || secretsRoute(capabilities().accountCredentials ? "worker" : "engine", machines()) !== "unsupported");
  const pedido = settingsTarget(props.panel);
  const inicial = ENTRADAS.find((e) => e.id === pedido?.entry) ?? ENTRADAS[0];
  const [activo, setActivo] = createSignal<SettingsEntryId>(inicial.id);
  // La pestaña elegida en cada entrada: volver a una entrada la deja como estaba.
  const [subs, setSubs] = createSignal<Partial<Record<SettingsEntryId, string>>>(
    pedido?.tab && inicial.id === pedido.entry && inicial.tabs.some((p) => p.id === pedido.tab && p.panel) ? { [inicial.id]: pedido.tab } : {},
  );
  let hoja: HTMLDivElement | undefined;
  // El foco viaja con las flechas sin arrastrar la selección.
  const [foco, setFoco] = createSignal<SettingsEntryId>(inicial.id);
  onMount(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Un campo marcado cancela lo suyo con Esc y se queda con la tecla:
        // esta escucha va en captura y de otro modo llega antes que él.
        if ((e.target as Element | null)?.closest?.("[data-owns-escape]")) return;
        // Un diálogo abierto encima, como «Añadir un proyecto», cierra él solo.
        const otro = (e.target as Element | null)?.closest?.("[role=dialog]");
        if (otro && otro !== hoja) return;
        // La superficie está encima de todo: se queda con el Esc y no deja que
        // llegue a cerrar la columna de artefactos que hay detrás.
        e.stopPropagation();
        props.onClose();
      }
    };
    window.addEventListener("keydown", alTeclear, true);
    onCleanup(() => window.removeEventListener("keydown", alTeclear, true));
  });
  // Con la hoja ya abierta, `panel` no vuelve a leerse: un enlace interno («Iniciar sesión» en Secretos) cambia de destino por aquí.
  onMount(() => {
    const alPedir = (e: Event) => {
      const id = (e as CustomEvent<unknown>).detail;
      const target = settingsTarget(typeof id === "string" ? id : undefined);
      const d = ENTRADAS.find((x) => x.id === target?.entry);
      if (!d) return;
      if (target?.tab) setSubs((s) => ({ ...s, [d.id]: target.tab! }));
      abrir(d);
    };
    window.addEventListener("harness:open-settings", alPedir);
    onCleanup(() => window.removeEventListener("harness:open-settings", alPedir));
  });

  function mover(paso: number | "inicio" | "fin") {
    const i = ENTRADAS.findIndex((d) => d.id === foco());
    const j =
      paso === "inicio"
        ? 0
        : paso === "fin"
          ? ENTRADAS.length - 1
          : (i + paso + ENTRADAS.length) % ENTRADAS.length;
    const id = ENTRADAS[j].id;
    setFoco(id);
    document.getElementById(idTab(id))?.focus();
  }

  function teclas(e: KeyboardEvent) {
    const pasos: Record<string, number | "inicio" | "fin"> = {
      ArrowDown: 1,
      ArrowUp: -1,
      Home: "inicio",
      End: "fin",
    };
    const paso = pasos[e.key];
    if (paso === undefined) return;
    e.preventDefault();
    mover(paso);
  }

  function abrir(d: Entrada) {
    setFoco(d.id);
    // WebKit no le da el foco a un botón al pulsarlo, así que sin esto el
    // primer clic deja las flechas sin punto de partida.
    document.getElementById(idTab(d.id))?.focus({ focusVisible: false } as FocusOptions);
    setActivo(d.id);
  }

  const entrada = () => ENTRADAS.find((d) => d.id === activo()) ?? ENTRADAS[0];
  const pestana = () => {
    const e = entrada();
    return e.tabs.find((p) => p.id === subs()[e.id] && p.panel && (!dePersonal(p) || pestanaVisible(p))) ?? e.tabs.find((p) => p.panel && pestanaVisible(p)) ?? SIN_PESTANA;
  };
  const elegir = (p: Pestana) => {
    if (p.panel) setSubs((antes) => ({ ...antes, [entrada().id]: p.id }));
  };

  // Las flechas mueven entre pestañas, que es lo que un `tablist` promete.
  function moverPestana(e: KeyboardEvent) {
    if (!flechaDeLista(e)) return;
    const paso = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (paso === 0) return;
    e.preventDefault();
    const usables = entrada().tabs.filter((p) => p.panel && pestanaVisible(p));
    const i = usables.findIndex((p) => p.id === pestana().id);
    const siguiente = usables[(i + paso + usables.length) % usables.length];
    elegir(siguiente);
    document.getElementById(idSub(siguiente.id))?.focus();
  }

  function Fila(p: { d: Entrada }) {
    return (
      <SidebarMenuItem role="presentation">
        <SidebarMenuButton
          id={idTab(p.d.id)}
          role="tab"
          aria-selected={activo() === p.d.id}
          aria-controls="cfg-panel"
          tabindex={foco() === p.d.id ? 0 : -1}
          isActive={activo() === p.d.id}
          selectionMark={false}
          // El fondo del activo vive en el átomo; la barra de acento pertenece a
          // la navegación principal y aquí duplicaba una señal sobre una lista corta.
          class="pestana-fundida h-10 min-h-10 grid-cols-[18px_minmax(0,1fr)] gap-2.5 rounded-l-[10px] rounded-r-none border-0 py-0 pl-3.5 pr-3 focus-visible:outline-offset-[-2px] data-[active=true]:bg-surface data-[active=true]:font-semibold data-[active=true]:hover:bg-surface"
          onClick={() => abrir(p.d)}
          onKeyDown={teclas}
        >
          {/* Sin color propio: hereda el del botón, que sale de `@theme` y se
              invierte con el tema. */}
          <span class="flex size-4 items-center justify-center">{p.d.icono()}</span>
          <span class="truncate">{p.d.name}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && props.onClose()}>
        <DialogContent
          // El ancho conserva tope porque el panel es prosa y controles; el alto
          // crece con la ventana.
          ref={hoja}
          class="flex h-[min(900px,100%)] w-[min(1120px,100%)] max-w-[1120px] flex-col overflow-hidden p-0"
          aria-label={t("settings.title")}
        >
          {/* **La fila tiene que ser `minmax(0,1fr)` y no la implícita.** Con
              `grid-auto-rows: auto` el riel crece por debajo de la hoja y su
              `overflow-y-auto` no tiene nada que desplazar. */}
          <div class="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] md:grid-cols-[224px_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)]">
            <header class="grid gap-3 border-b border-border bg-rail px-4 py-3 md:hidden">
              <div class="flex items-center justify-between gap-3">
                <DialogTitle class="m-0 text-lead font-semibold">{t("settings.title")}</DialogTitle>
                <Button variant="ghost" size="iconCompact" onClick={props.onClose} aria-label={t("settings.close")}>
                  <Close size={16} />
                </Button>
              </div>
              <Select
                aria-label={t("settings.nav.label")}
                value={activo()}
                onChange={(event) => {
                  const id = event.currentTarget.value as SettingsEntryId;
                  setFoco(id);
                  setActivo(id);
                }}
              >
                <For each={GRUPOS}>{(group) => (
                  <optgroup label={group.nombre()}>
                    <For each={ENTRADAS.filter((entry) => entry.group === group.id)}>
                      {(entry) => <option value={entry.id}>{entry.name}</option>}
                    </For>
                  </optgroup>
                )}</For>
              </Select>
              <AdminLink />
            </header>
            <Sidebar
              role="tablist"
              aria-orientation="vertical"
              aria-label={t("settings.nav.label")}
              class="hidden border-0 bg-rail md:grid"
            >
              <SidebarHeader class="pb-6 pl-5 pr-3 pt-4">
                <h2 class="m-0 text-lead font-semibold">
                  {t("settings.title")}
                </h2>
              </SidebarHeader>

              {/* Sin barra visible: su canal separaba la pestaña activa del panel
                  en cuanto el riel desbordaba, por ejemplo con zoom. */}
              <SidebarContent class="flex flex-col gap-6 overflow-y-auto px-0 pb-4 pl-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <For each={GRUPOS}>
                  {(g) => (
                    <Show when={ENTRADAS.some((e) => e.group === g.id)}>
                      <div role="presentation" class="flex flex-col gap-3">
                        <p class="m-0 px-3 text-xs text-neutral-500">{g.nombre()}</p>
                        <SidebarMenu role="presentation" class="gap-1.5">
                          <For each={ENTRADAS.filter((e) => e.group === g.id)}>{(d) => <Fila d={d} />}</For>
                        </SidebarMenu>
                      </div>
                    </Show>
                  )}
                </For>
              </SidebarContent>
              <AdminLink />
            </Sidebar>

            <div class="relative min-h-0 min-w-0 bg-surface">
              {/* Cada panel debe montarse como componente: invocarlo aquí
                  metería sus señales en el efecto de selección y lo repintaría
                  cuando cambian sus propios controles. */}
              <div
                id="cfg-panel"
                role="tabpanel"
                aria-labelledby={idTab(entrada().id)}
                class="h-full min-h-0 min-w-0 overflow-auto md:flex md:flex-col md:overflow-hidden"
              >
                {/* En escritorio el encabezado y sus pestañas quedan fuera del scroll: así el cerrar no comparte lugar con el contenido. */}
                <div class="px-4 pt-5 md:shrink-0 md:px-8 md:pt-6">
                <header class={cn("grid grid-cols-[minmax(0,1fr)] items-center gap-3 md:grid-cols-[minmax(0,1fr)_auto]", entrada().tabs.length > 1 ? "mb-5" : "border-0 border-b border-solid border-border pb-4")}>
                  <h2 class="m-0 text-lg font-semibold">{entrada().name}</h2>
                  <Button variant="ghost" size="iconCompact" class="hidden size-7 md:inline-flex" onClick={props.onClose} aria-label={t("settings.close")}>
                    <Close size={16} />
                  </Button>
                </header>
                <Show when={entrada().tabs.length > 1}>
                  <div
                    role="tablist"
                    aria-label={entrada().name}
                    onKeyDown={moverPestana}
                    class="flex items-end gap-5 overflow-x-auto border-0 border-b border-solid border-border"
                  >
                    <For each={entrada().tabs.filter(pestanaVisible)}>
                      {(p) => (
                        <button
                          type="button"
                          role="tab"
                          id={idSub(p.id)}
                          aria-selected={pestana().id === p.id}
                          aria-controls="cfg-subpanel"
                          aria-disabled={p.panel ? undefined : true}
                          title={p.panel ? undefined : t("settings.nav.soon_why")}
                          tabindex={pestana().id === p.id ? 0 : -1}
                          onClick={() => elegir(p)}
                          class={cn(
                            "-mb-px inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-0 border-b-2 border-solid border-transparent bg-transparent px-0 pt-0 pb-2 text-sm text-neutral-500 hover:text-neutral-950 aria-disabled:cursor-default aria-disabled:hover:text-neutral-500",
                            pestana().id === p.id && "border-neutral-950 font-semibold text-neutral-950",
                          )}
                        >
                          {p.name}
                          <Show when={!p.panel}>
                            <Badge forma="dato">{t("settings.nav.soon")}</Badge>
                          </Show>
                        </button>
                      )}
                    </For>
                  </div>
                </Show>
                </div>
                <div id="cfg-subpanel" role={entrada().tabs.length > 1 ? "tabpanel" : undefined} aria-labelledby={entrada().tabs.length > 1 ? idSub(pestana().id) : undefined} class="min-w-0 px-4 pb-10 pt-5 md:min-h-0 md:flex-1 md:overflow-auto md:px-8">
                  <Dynamic component={pestana().panel ?? (() => null)} />
                </div>
              </div>
            </div>
          </div>
      </DialogContent>
    </Dialog>
  );
}
