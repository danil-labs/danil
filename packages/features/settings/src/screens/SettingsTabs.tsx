import Bot from "lucide-solid/icons/bot";
import CircleUserRound from "lucide-solid/icons/circle-user-round";
import Palette from "lucide-solid/icons/palette";
import Plug from "lucide-solid/icons/plug";
import Shield from "lucide-solid/icons/shield";
import SlidersHorizontal from "lucide-solid/icons/sliders-horizontal";
import Sparkles from "lucide-solid/icons/sparkles";
import Wrench from "lucide-solid/icons/wrench";
import { type JSX, lazy, Suspense } from "solid-js";
import { machineAction } from "../../../../host/src/machine-action";
import { capabilities } from "../../../../host/src/platform";
import { GitMark } from "../../../../ui/src/icons";
import { t } from "../../../../ui/src/lib/i18n";
import type { ModelChoices } from "../../../../ui/src/lib/model-choices";
import { type Superficie } from "../../../../ui/src/lib/surfaces";
import { SettingsPanel } from "../../../../ui/src/SettingsLayout";
import AIProviders from "../components/AIProviders";
import Connections from "../components/Connections";
import ConnectionsOperation from "../components/ConnectionsOperation";
import General from "../components/General";
import Integrations from "../components/Integrations";
import LoginSecurity from "../components/LoginSecurity";
import ProveedorDeMemoria from "../components/MemoryProvider";
import Providers from "../components/Providers";
import Skills from "../components/Skills";
import type { SurfacesState } from "../model/ai-providers-view";
import type { PiezasDeAjustes } from "../model/features-port";
import type { MaquinasDeAjustes } from "../model/machines-port";
import type { SesionesDeAjustes } from "../model/sessions-port";
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
  context: () => string | null,
  maquinas: MaquinasDeAjustes,
  piezas: PiezasDeAjustes,
  sesiones: SesionesDeAjustes,
  integraciones?: (p: { solo: string[]; onCambio: () => void }) => JSX.Element,
): Record<string, Pestana | undefined> => {
  const cuenta = capabilities().danilAccount || capabilities().accountProfile;
  const tab = (id: string, name: () => string, panel: Pestana["panel"]): Pestana => ({ id, get name() { return name(); }, panel });
  return {
    "cuenta-danil": cuenta ? tab("cuenta-danil", () => t("settings.nav.danil_account"), () => <Suspense fallback={null}><DanilAccount workspace={workspace()} context={context()} sesiones={sesiones} /></Suspense>) : undefined,
    security: tab("security", () => t("settings.tab.security"), () => <LoginSecurity />),
    general: tab("general", () => t("settings.nav.general"), () => <General maquinas={maquinas} />),
    appearance: tab("appearance", () => t("settings.nav.appearance"), () => { machineAction(); return <Suspense fallback={null}><Appearance workspace={workspace()} proyecto={agentes.proyecto} maquinas={maquinas} piezas={piezas} /></Suspense>; }),
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
  "source-control": { name: () => t("settings.entry.source_control"), icono: () => <GitMark size={15} /> },
  "agents-skills": { name: () => t("settings.entry.agents_skills"), icono: () => <Bot size={15} /> },
  connections: { name: () => t("settings.nav.connections"), icono: () => <Plug size={15} /> },
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

/** Respaldo vacío si una entrada no tuviera pestaña montable. */
export const SIN_PESTANA: Pestana = { id: "", name: "", panel: null };

export const idTab = (id: string) => `cfg-tab-${id}`;

export const idSub = (id: string) => `cfg-sub-${id}`;
