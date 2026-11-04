import ArrowLeft from 'lucide-solid/icons/arrow-left';
import ExternalLink from 'lucide-solid/icons/external-link';
import { createResource, createSignal, For, type JSX, onCleanup, onMount, Show, Suspense, lazy } from 'solid-js';
import type { InboxSession } from '../../../../../packages/attention/src/inbox.ts';
import { createService, type ServiceAgent, type ServiceApi } from '../../../../../packages/attention/src/service.ts';
import { resolveWorkspaceAccount } from '../../../../../packages/attention/src/workspace-account.ts';
import { SettingsPanel, SettingsRow, SettingsSection } from '../../features/settings/layout';
import { t } from '../../lib/i18n';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { bffTransport } from './transport';
import { accountSources, type AgentsSession } from './workspace-sources';

const Channels = lazy(() => import('./Channels').then(module => ({ default: module.Channels })));

/** Conectar y editar siguen en Danil Agents (decisión de la primera entrega). */
const AGENTS_URL = 'https://app.danil.ai';

export type ServiceSource = ServiceApi & { resolves: (workspace: string | null) => Promise<boolean> };
type Session = InboxSession & { subscribe?: (clear: () => void) => () => void };
export type CustomerProps = { demo: boolean; session?: Session; load: () => Promise<ServiceSource | null>; workspace: () => string | null };

export function liveService(session: AgentsSession): ServiceSource {
  const bff = bffTransport();
  return {
    ...createService(session, bff.request, bff.prefix),
    resolves: async workspace => !!await resolveWorkspaceAccount(workspace, accountSources(session)),
  };
}

const TYPES: Record<string, string> = { pessoa: 'sales', rpessoa: 'sales', ripley: 'brand', rripley: 'brand', comala: 'citizen', rcomala: 'citizen', dazai: 'demo', rdazai: 'demo' };
// El tipo guardado es un nombre interno: nunca llega a la pantalla.
function typeLabel(type: string) {
  const kind = TYPES[type.toLowerCase().replace(/[^a-z]/g, '')];
  return kind === 'sales' ? t("web.service.type_sales") : kind === 'brand' ? t("web.service.type_brand") : kind === 'citizen' ? t("web.service.type_citizen") : kind === 'demo' ? t("web.service.type_demo") : t("web.service.type_other");
}

function OpenAgents() {
  return <Button as="a" size="sm" variant="secondary" href={AGENTS_URL} target="_blank" rel="noopener noreferrer" data-open-agents="">
    {t("web.service.open_agents")}<ExternalLink size={13} />
  </Button>;
}

/** Sin cuenta para el workspace activo no se piden las listas: nunca datos de otra cuenta. */
function Resolved(props: { source: ServiceSource; workspace: () => string | null; children: JSX.Element }) {
  const [resolved] = createResource(props.workspace, workspace => props.source.resolves(workspace).catch(() => false));
  return <Show when={!resolved.loading}>
    <Show when={resolved()} fallback={<SettingsSection data-service-unresolved="" title={t("web.service.unresolved")} description={t("web.service.unresolved_hint")} />}>
      {props.children}
    </Show>
  </Show>;
}

function Listed<T>(props: { title: string; description: string; aside?: JSX.Element; empty: string; load: () => Promise<T[]>; children: (row: T) => JSX.Element }) {
  const [rows] = createResource(() => props.load());
  const failed = () => rows.error as Error | undefined;
  return <SettingsSection title={props.title} aside={props.aside} description={props.description}>
    <Show when={rows.loading}><p role="status" class="m-0 py-3 text-xs text-neutral-500">{t("web.alpha.loading")}</p></Show>
    <Show when={failed()}>{cause => <p role="alert" class="m-0 py-3 text-sm text-error-strong">{cause().message === 'HTTP 403' ? t("web.service.denied") : t("web.service.failed")}</p>}</Show>
    <Show when={!rows.loading && !failed() && rows()?.length === 0}><p role="status" class="m-0 py-3 text-sm text-neutral-500">{props.empty}</p></Show>
    <Show when={!rows.loading && !failed()}><For each={rows()}>{props.children}</For></Show>
  </SettingsSection>;
}

function AgentDetail(props: { source: ServiceSource; agent: ServiceAgent; onBack: () => void }) {
  const [detail] = createResource(() => props.source.agent(props.agent.id));
  const names = (rows: { name: string }[]) => rows.map(row => row.name).filter(Boolean).join(', ');
  return <SettingsPanel data-service-agent={props.agent.id}>
    <div class="grid justify-items-start gap-2">
      <Button variant="ghost" size="sm" class="-ml-2" onClick={props.onBack}><ArrowLeft size={14} />{t("web.service.back")}</Button>
      <SettingsSection class="w-full" title={props.agent.name} aside={<OpenAgents />} description={typeLabel(props.agent.type)} />
    </div>
    <Show when={detail.loading}><p role="status" class="m-0 text-xs text-neutral-500">{t("web.alpha.loading")}</p></Show>
    <Show when={detail.error}><p role="alert" class="m-0 text-sm text-error-strong">{t("web.service.failed")}</p></Show>
    <Show when={!detail.loading && !detail.error ? detail() : undefined}>{d => <>
      <SettingsSection title={t("web.service.detail_channels")}>
        <Show when={d().channels.length > 0} fallback={<SettingsRow label={t("web.service.no_channel")} />}>
          <For each={d().channels}>{row => <SettingsRow label={row.name || row.provider} description={row.provider} />}</For>
        </Show>
      </SettingsSection>
      <SettingsSection title={t("web.service.detail_uses")}>
        <SettingsRow label={t("web.service.calendars")} description={d().calendar ? (d().calendar!.email || d().calendar!.name) : t("web.service.none")} />
        <SettingsRow label={t("web.service.http_tools")} description={names(d().httpTools) || t("web.service.none")} />
      </SettingsSection>
      <SettingsSection title={t("web.service.detail_knows")}>
        <SettingsRow label={t("web.service.catalog")} description={names(d().inventories) || t("web.service.none")} />
        <SettingsRow label={t("web.service.documents")} description={names(d().documents) || t("web.service.none")} />
        <SettingsRow label={t("web.service.directives")} description={names(d().directives) || t("web.service.none")} />
      </SettingsSection>
      <SettingsSection title={t("web.service.detail_instructions")}>
        <SettingsRow label={t("web.service.model")} description={d().model || t("web.service.none")} />
        <SettingsRow label={t("web.service.role")} description={d().description || t("web.service.none")} />
      </SettingsSection>
    </>}</Show>
  </SettingsPanel>;
}

/** Cambiar de sesión o de workspace desmonta todo: ni selección ni lecturas del ámbito anterior. */
function Scoped(props: { session?: Session; workspace: () => string | null; children: () => JSX.Element }) {
  const [epoch, setEpoch] = createSignal(0);
  onMount(() => {
    const stop = props.session?.subscribe?.(() => setEpoch(value => value + 1));
    if (stop) onCleanup(stop);
  });
  return <Show when={`${epoch()}:${props.workspace() ?? ''}`} keyed>{(_) => props.children()}</Show>;
}

function AgentsBody(props: { source: ServiceSource; workspace: () => string | null }) {
  const [open, setOpen] = createSignal<ServiceAgent | null>(null);
  return <section class="grid min-w-0 gap-6" data-service-agents="">
    <Resolved source={props.source} workspace={props.workspace}>
      <Show when={open()} fallback={
        <Listed title={t("web.service.agents_title")} description={t("web.service.agents_hint")} aside={<OpenAgents />} empty={t("web.service.agents_empty")} load={() => props.source.agents()}>
          {row => <SettingsRow label={row.name} description={typeLabel(row.type)}><Button variant="ghost" size="sm" onClick={() => setOpen(row)}>{t("web.service.see")}</Button></SettingsRow>}
        </Listed>}>
        {agent => <AgentDetail source={props.source} agent={agent()} onBack={() => setOpen(null)} />}
      </Show>
    </Resolved>
  </section>;
}

/** Agentes y skills › Agentes, sección de atención a clientes. */
export function CustomerAgents(props: CustomerProps) {
  const [source] = createResource(props.load);
  return <Show when={source()}>{s => <Scoped session={props.session} workspace={props.workspace}>{() => <AgentsBody source={s()} workspace={props.workspace} />}</Scoped>}</Show>;
}

/** Conexiones › Atención a clientes. Canales ya tenía su vista; lo demás sale de aquí. */
export function CustomerConnections(props: CustomerProps) {
  const [source] = createResource(props.load);
  return <Show when={source()}>{s => <Scoped session={props.session} workspace={props.workspace}>{() => <SettingsPanel data-service-connections="">
    <Resolved source={s()} workspace={props.workspace}>
      <SettingsSection><SettingsRow label={t("web.service.edit_hint")}><OpenAgents /></SettingsRow></SettingsSection>
      <Suspense fallback={null}><Channels demo={props.demo} session={props.session} /></Suspense>
      <Listed title={t("web.service.calendars")} description={t("web.service.calendars_hint")} empty={t("web.service.calendars_empty")} load={() => s().calendars()}>
        {row => <SettingsRow label={row.email || row.name} description={row.provider}><Badge tone={row.connected ? 'success' : 'danger'}>{row.connected ? t("web.service.connected") : t("web.service.disconnected")}</Badge></SettingsRow>}
      </Listed>
      <Listed title={t("web.service.http_tools")} description={t("web.service.http_tools_hint")} empty={t("web.service.http_tools_empty")} load={() => s().httpTools()}>
        {row => <SettingsRow label={<span class="inline-flex flex-wrap items-center gap-2">{row.name}<Show when={row.method}><Badge forma="dato">{row.method}</Badge></Show></span>} description={row.host}><Show when={!row.active}><Badge>{t("web.service.inactive")}</Badge></Show></SettingsRow>}
      </Listed>
      <Listed title={t("web.service.variables")} description={t("web.service.variables_hint")} empty={t("web.service.variables_empty")} load={() => s().variables()}>
        {row => <SettingsRow label={<span class="font-mono text-ui">{row.key}</span>} description={row.secret ? t("web.service.secret") : undefined} />}
      </Listed>
    </Resolved>
  </SettingsPanel>}</Scoped>}</Show>;
}
