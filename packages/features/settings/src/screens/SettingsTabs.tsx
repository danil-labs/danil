import Bot from "lucide-solid/icons/bot";
import CircleUserRound from "lucide-solid/icons/circle-user-round";
import CreditCard from "lucide-solid/icons/credit-card";
import ExternalLink from "lucide-solid/icons/external-link";
import GitBranch from "lucide-solid/icons/git-branch";
import Palette from "lucide-solid/icons/palette";
import Plug from "lucide-solid/icons/plug";
import Shield from "lucide-solid/icons/shield";
import SlidersHorizontal from "lucide-solid/icons/sliders-horizontal";
import Sparkles from "lucide-solid/icons/sparkles";
import Wrench from "lucide-solid/icons/wrench";
import { createResource, type JSX, lazy, Show, Suspense } from "solid-js";
import { t } from "../../../../ui/src/lib/i18n";
import { capabilities } from "../../../../host/src/platform";
import { machineAction } from "../../../../host/src/machine-action";
import { type Superficie } from "../../../../ui/src/lib/surfaces";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "../../../../ui/src/sidebar";
import type { MaquinasDeAjustes } from "../model/machines-port";
import type { PiezasDeAjustes } from "../model/features-port";
import type { SesionesDeAjustes } from "../model/sessions-port";
import type { ModelChoices } from "../../../../ui/src/lib/model-choices";
import AIProviders from "../components/AIProviders";
import type { SurfacesState } from "../model/ai-providers-view";
import Connections from "../components/Connections";
import ConnectionsOperation from "../components/ConnectionsOperation";
import General from "../components/General";
import Integrations from "../components/Integrations";
import LoginSecurity from "../components/LoginSecurity";
import { SettingsPanel } from "../../../../ui/src/SettingsLayout";
import ProveedorDeMemoria from "../components/MemoryProvider";
import Providers from "../components/Providers";
import Skills from "../components/Skills";
import { SETTINGS_ENTRIES, type SettingsEntryId } from "../model/settings-entries";

// Chunks aparte: solo los carga quien abre la sección.
const DanilAccount = lazy(() => import("../components/DanilAccountsEntry"));

const Appearance = lazy(() => import("../components/Appearance"));

const Agents = lazy(() => import("../components/Agents"));

const Maintenance = lazy(() => import("../components/Maintenance"));

/**
 * Configuración: entradas y pestañas definidas en `settings-entries.ts`.
 */

/** `panel: null` es una pestaña que la app todavía no tiene: sale con «pronto». */
export type Pestana = { id: string; name: string; panel: (() => JSX.Element) | null };

export type Entrada = {
  id: SettingsEntryId;
  name: string;
  icono: () => JSX.Element;
  tabs: Pestana[];
  footer?: boolean;
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
export const pestanasDe = (
  superficies: () => Superficie[],
  agentes: ContextoDeAgentes,
  workspace: () => string | null,
  maquinas: MaquinasDeAjustes,
  piezas: PiezasDeAjustes,
  sesiones: SesionesDeAjustes,
  integraciones?: (p: { solo: string[]; onCambio: () => void }) => JSX.Element,
): Record<string, Pestana | undefined> => {
  const cuenta = capabilities().danilAccount || capabilities().accountProfile;
  const tab = (id: string, name: () => string, panel: Pestana["panel"]): Pestana => ({ id, get name() { return name(); }, panel });
  return {
    "cuenta-danil": cuenta ? tab("cuenta-danil", () => t("settings.nav.danil_account"), () => <Suspense fallback={null}><DanilAccount part="profile" maquinas={maquinas} sesiones={sesiones} /></Suspense>) : undefined,
    emails: capabilities().accountEmails ? tab("emails", () => t("settings.tab.emails"), () => <Suspense fallback={null}><DanilAccount part="emails" maquinas={maquinas} sesiones={sesiones} /></Suspense>) : undefined,
    usage: capabilities().accountUsage ? tab("usage", () => t("settings.tab.usage"), () => capabilities().accountUsage?.()) : undefined,
    plan: capabilities().nativeWindow || capabilities().personalAccount?.plan ? tab("plan", () => t("settings.tab.plan"), () => capabilities().nativeWindow ? <Suspense><DeskPlan workspace={workspace()} sesiones={sesiones} /></Suspense> : capabilities().personalAccount?.plan?.()) : undefined,
    security: tab("security", () => t("settings.tab.security"), () => <LoginSecurity />),
    general: tab("general", () => t("settings.nav.general"), () => <General maquinas={maquinas} />),
    appearance: tab("appearance", () => t("settings.nav.appearance"), () => <Suspense fallback={null}><Appearance proyecto={agentes.proyecto} maquinas={maquinas} piezas={piezas} sesiones={sesiones} /></Suspense>),
    "proveedores-ia": tab("proveedores-ia", () => t("settings.nav.ai_providers"), () => { machineAction(); return <AIProviders superficies={superficies()} estado={agentes.estadoSuperficies} onRetry={agentes.reintentarSuperficies} maquinas={maquinas} piezas={piezas} />; }),
    fuentes: tab("fuentes", () => t("settings.nav.sources"), () => { machineAction(); return <Providers integraciones={integraciones} maquinas={maquinas} />; }),
    agentes: tab("agentes", () => t("settings.nav.agents"), () => (
      <Suspense fallback={null}>
        <Agents
          modelos={agentes.modelos}
          piezas={piezas}
          proyecto={agentes.proyecto}
          onAgentProfile={agentes.onAgentProfile}
        />
      </Suspense>
    )),
    skills: tab("skills", () => t("settings.nav.skills"), () => <Skills />),
    operation: tab("operation", () => t("settings.skills.tab_mcp"), () => <ConnectionsOperation maquinas={maquinas} />),
    plugins: tab("plugins", () => t("settings.tab.plugins"), () => <SettingsPanel><Integrations /></SettingsPanel>),
    memory: tab("memory", () => t("settings.tab.memory"), () => <SettingsPanel><ProveedorDeMemoria /></SettingsPanel>),
    external: cuenta ? tab("external", () => t("settings.tab.external"), () => <Suspense fallback={null}><Connections /></Suspense>) : undefined,
    maintenance: tab("maintenance", () => t("settings.entry.maintenance"), () => <Suspense fallback={null}><Maintenance maquinas={maquinas} /></Suspense>),
  };
};

const ENCABEZADOS: Record<SettingsEntryId, { name: () => string; icono: () => JSX.Element }> = {
  general: { name: () => t("settings.nav.general"), icono: () => <SlidersHorizontal size={15} /> },
  appearance: { name: () => t("settings.nav.appearance"), icono: () => <Palette size={15} /> },
  account: { name: () => t("settings.entry.account"), icono: () => <CircleUserRound size={15} /> },
  security: { name: () => t("settings.entry.security"), icono: () => <Shield size={15} /> },
  "ai-accounts": { name: () => t("settings.entry.ai_accounts"), icono: () => <Sparkles size={15} /> },
  "source-control": { name: () => t("settings.entry.source_control"), icono: () => <GitBranch size={15} /> },
  "agents-skills": { name: () => t("settings.entry.agents_skills"), icono: () => <Bot size={15} /> },
  connections: { name: () => t("settings.nav.connections"), icono: () => <Plug size={15} /> },
  billing: { name: () => t("settings.entry.billing"), icono: () => <CreditCard size={15} /> },
  maintenance: { name: () => t("settings.entry.maintenance"), icono: () => <Wrench size={15} /> },
};

/** Una entrada sale si tiene alguna pestaña que ya existe. */
export const entradasDe = (pestanas: Record<string, Pestana | undefined>): Entrada[] =>
  SETTINGS_ENTRIES.flatMap((e) => {
    const tabs = e.tabs.flatMap((id) => (pestanas[id] ? [pestanas[id]!] : []));
    if (!tabs.some((p) => p.panel)) return [];
    const h = ENCABEZADOS[e.id];
    const footer = "footer" in e && e.footer ? true : undefined;
    return [{ id: e.id, get name() { return h.name(); }, icono: h.icono, tabs, footer }];
  });

/** Una entrada con solo pestañas de cuenta personal, mientras llega si la cuenta lo es. */
export const SIN_PESTANA: Pestana = { id: "", name: "", panel: null };

export const idTab = (id: string) => `cfg-tab-${id}`;

export const idSub = (id: string) => `cfg-sub-${id}`;

/** Enlace de administracion cuando la plataforma web lo ofrece. */
export function AdminLink(props: { embedded?: boolean }) {
  const page = capabilities().adminPage;
  const [allowed] = createResource(async () => page ? await page.allowed().catch(() => false) : false);
  const item = () => (
    <SidebarMenuItem role="presentation">
      <SidebarMenuButton
        as="a"
        href={page?.href}
        target="_blank"
        rel="noopener"
        data-settings-admin=""
        selectionMark={false}
        class="h-10 min-h-10 grid-cols-[18px_minmax(0,1fr)_auto] gap-2.5 rounded-l-[10px] rounded-r-none border-0 py-0 pl-3.5 pr-3 outline-none focus:outline-none focus-visible:outline-none"
      >
        <span class="flex size-4 items-center justify-center"><Shield size={15} /></span>
        <span class="truncate">{t("web.admin.title")}</span>
        <ExternalLink size={13} class="text-neutral-500" />
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
  return (
    <Show when={allowed()}>
      <Show
        when={!props.embedded}
        fallback={item()}
      >
        <div class="mt-auto border-0 border-t border-solid border-border px-0 pb-3 pl-2 pt-2">
          <SidebarMenu role="presentation">
            {item()}
          </SidebarMenu>
        </div>
      </Show>
    </Show>
  );
}

const DeskPlan = lazy(() => import("../components/DeskPlan"));
