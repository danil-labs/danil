import type { AgentsSession } from './workspace-sources';
import { For, lazy, Show, Suspense } from 'solid-js';
import { t } from '../../lib/i18n';
import { SettingsRow, SettingsSection } from '../../features/settings/layout';
import { Button } from '../../ui/Button';
import { Attention } from './Attention';
import { createCustomization } from '../../lib/customization';
import { featureEntries } from '../../lib/attention-labels';
import { AttentionMenu, PersonalizeMenu } from './SidebarEntries';
import { loadedConversations, requestConversation } from './loaded';

const CustomizationSection = lazy(() => import('./CustomizationSection').then(module => ({default:module.CustomizationSection})));
const Customer = () => import('./CustomerService');
const CustomerAgents = lazy(() => Customer().then(module => ({default:module.CustomerAgents})));
const CustomerConnections = lazy(() => Customer().then(module => ({default:module.CustomerConnections})));
const LiveBroadcasts = lazy(async () => { const [{ Broadcasts }, { webBroadcastSource }] = await Promise.all([import('./Broadcasts'), import('./broadcasts/source')]); return { default: (props: { session?: AgentsSession & { subscribe?: (clear: () => void) => () => void }; workspace: () => string | null }) => <Broadcasts source={props.session ? webBroadcastSource(props.session, props.workspace) : undefined}/> }; });
const DemoBroadcasts = lazy(async () => { const [{ Broadcasts }, { demoBroadcastSource }] = await Promise.all([import('./Broadcasts'), import('./broadcasts/demo')]); return { default: () => <Broadcasts source={demoBroadcastSource()}/> }; });

export function attentionCapability(demo: boolean, initial: boolean, session?: AgentsSession & { subscribe?: (clear: () => void) => () => void; userId?: string | null }) {
  const load = async () => demo ? (await import('./service-demo')).serviceDemo() : session ? (await Customer()).liveService(session) : null;
  return {
    customization: createCustomization, entries: featureEntries,
    demo, userId: demo ? 'demo' : session?.userId, subscribe: session?.subscribe,
    sidebarMenu: AttentionMenu, personalizeMenu: PersonalizeMenu,
    catalog: (props: import("./CustomizationSection").CustomizationSectionProps) => <Suspense fallback={null}><CustomizationSection {...props}/></Suspense>,
    broadcasts: (workspace: () => string | null) => <Suspense fallback={null}>{demo ? <DemoBroadcasts/> : <Show when={{ name: workspace() }} keyed>{scope => <LiveBroadcasts session={session} workspace={() => scope.name}/>}</Show>}</Suspense>,
    initial,
    render: (workspace: () => string | null) => <Attention demo={demo} session={session} workspace={workspace}/>,
    agentSettings: (name: string) => <SettingsSection title={`${t("web.alpha.service_agent")} · ${name}`} description={t("web.alpha.configuration_unavailable")}><For each={['scope','knowledge','tools','schedule','host']}>{field=><SettingsRow label={t(`web.alpha.${field}`)} description={t(`web.alpha.${field}_hint`)}><input class="w-48 max-w-full rounded-md border border-border bg-surface p-2 text-sm" disabled={!demo} aria-label={t(`web.alpha.${field}`)}/></SettingsRow>}</For><Button class="mt-3 justify-self-start" disabled>{t("web.alpha.publish")}</Button></SettingsSection>,
    customerAgents: (workspace: () => string | null) => <Suspense fallback={null}><CustomerAgents demo={demo} session={session} load={load} workspace={workspace}/></Suspense>,
    customerConnections: (workspace: () => string | null) => <Suspense fallback={null}><CustomerConnections demo={demo} session={session} load={load} workspace={workspace}/></Suspense>,
    search: { conversations: loadedConversations, open: requestConversation },
  };
}
