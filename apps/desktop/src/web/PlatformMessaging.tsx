import { createSignal, For, onCleanup, onMount, Show, type JSX } from 'solid-js';
import { t } from '../lib/i18n';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Textarea } from '../ui/Textarea';
import { PlatformSessionError } from './platform-session';
import { runMessagingOperation, type MessagingOperation, type MessagingIntents, type CampaignAction, type MessagingCampaign, type MessagingChannel, type MessagingContact, type MessagingTemplate, platformMessaging } from './platform-messaging';

export type MessagingDomain = 'campaigns' | 'channels' | 'templates' | 'contacts' | 'media';
export type { MessagingIntents } from './platform-messaging';
type Api = ReturnType<typeof platformMessaging>;
type Row = MessagingCampaign | MessagingChannel | MessagingContact | MessagingTemplate;
type Context = { api: Api; signal: AbortSignal; busy: () => boolean; run: <T>(operation: MessagingOperation<T>, confirmed?: (result: T) => void) => Promise<void> };

async function choices<T>(read: (cursor?: string) => Promise<{ data: T[]; page: { next_cursor: string | null } }>) {
  const rows: T[] = [], seen = new Set<string>();
  let cursor: string | null = null;
  do {
    const result = await read(cursor ?? undefined);
    rows.push(...result.data); cursor = result.page.next_cursor;
    if (cursor && seen.has(cursor)) throw new Error('repeated_cursor');
    if (cursor) seen.add(cursor);
  } while (cursor);
  return rows;
}

export function PlatformMessaging(props: { domain: MessagingDomain; api: Api; intents: MessagingIntents }) {
  const [rows, setRows] = createSignal<Row[]>([]);
  const [cursor, setCursor] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal('');
  const pendingForDomain = () => [...props.intents.values()].filter(entry => entry.operation.resource.startsWith(`messaging/${props.domain}`));
  const [pending, setPending] = createSignal(pendingForDomain());
  const [saved, setSaved] = createSignal(false);
  const abort = new AbortController();
  let alive = true;
  onCleanup(() => { alive = false; abort.abort(); });
  async function load(append = false) {
    if (props.domain === 'media') return;
    setBusy(true); setError('');
    try {
      const result = await props.api[props.domain](append ? cursor() ?? undefined : undefined, abort.signal);
      if (alive) { setRows(append ? [...rows(), ...result.data] : result.data); setCursor(result.page.next_cursor); }
    } catch (cause) {
      if (alive) { setRows([]); setCursor(null); showError(cause); }
    } finally { if (alive) setBusy(false); }
  }
  function showError(cause: unknown) {
    setError(cause instanceof PlatformSessionError && cause.status === 403 ? 'web.platform.denied' : 'web.platform.unavailable');
  }
  const context: Context = { api: props.api, signal: abort.signal, busy: () => busy() || pending().length > 0, async run(operation, confirmed) {
    if (busy()) return;
    setSaved(false); setBusy(true); setError('');
    try {
      const result = await runMessagingOperation(props.intents, operation, abort.signal);
      if (alive) { confirmed?.(result); setSaved(true); await load(); }
    } catch (cause) {
      if (alive) showError(cause);
    } finally { if (alive) { setPending(pendingForDomain()); setBusy(false); } }
  } };
  onMount(() => void load());
  return <section class="grid min-w-0 gap-4" data-platform-messaging="" aria-label={t(`web.messaging.${props.domain}`)} aria-busy={busy()}>
    <h2 class="m-0 text-lead font-semibold">{t(`web.messaging.${props.domain}`)}</h2>
    <Show when={props.domain !== 'media'} fallback={<p role="status" data-messaging-unavailable="">{t('web.messaging.media_unavailable')}</p>}>
      <Button variant="secondary" class="justify-self-start" disabled={context.busy()} onClick={() => void load()}>{t('web.alpha.refresh')}</Button>
      <Show when={saved()}><p role="status" class="m-0 text-ui text-success-strong">{t('web.messaging.saved')}</p></Show>
      <Show when={error()}><p role="alert" class="m-0 text-ui text-error-strong">{t(error())}</p></Show>
      <Show when={pending().length}><p role="status">{t('web.messaging.uncertain')}</p><For each={pending()}>{entry => <Button disabled={busy()} onClick={() => void context.run(entry.operation)}>{t('web.messaging.retry_operation')}</Button>}</For></Show>
      <Show when={!busy() && !error() && rows().length === 0}><p role="status">{t('customize.page_empty')}</p></Show>
      <ul class="m-0 grid list-none gap-3 p-0"><For each={rows()}>{row => <li class="grid gap-2 border-b border-border pb-3">
        <strong class="text-ui">{row.name || ('phone' in row ? row.phone : '') || row.id}</strong>
        <Show when={row.object === 'channel'}><p class="m-0 text-ui">{(row as MessagingChannel).provider} · {t(`web.messaging.connection_${(row as MessagingChannel).connection.status}`)}</p></Show>
        <Show when={row.object === 'template'}><p class="m-0 whitespace-pre-wrap text-ui">{(row as MessagingTemplate).components.body.text}</p><p class="m-0 text-ui">{t(`web.messaging.template_${(row as MessagingTemplate).status}`)}</p><Show when={(row as MessagingTemplate).status === 'draft'}><div class="flex flex-wrap gap-2">
          <Button disabled={context.busy()} onClick={() => void context.run(props.api.operations.submitTemplate(row.id))}>{t('web.messaging.submit_template')}</Button>
          <Button variant="danger" disabled={context.busy()} onClick={() => void context.run(props.api.operations.deleteTemplate(row.id))}>{t('broadcasts.discard')}</Button>
        </div><TemplateForm context={context} draft={row as MessagingTemplate}/></Show></Show>
        <Show when={row.object === 'campaign'}><CampaignOperations context={context} row={row as MessagingCampaign}/></Show>
      </li>}</For></ul>
      <Show when={cursor()}><Button disabled={context.busy()} onClick={() => void load(true)}>{t('web.messaging.more')}</Button></Show>
      <Show when={props.domain === 'contacts'}><ContactForm context={context}/></Show>
      <Show when={props.domain === 'channels'}><p role="status">{t('web.messaging.channel_management_unavailable')}</p></Show>
      <Show when={props.domain === 'templates'}><TemplateForm context={context}/></Show>
      <Show when={props.domain === 'campaigns'}><CampaignForm context={context}/></Show>
    </Show>
  </section>;
}

function Field(props: { label: string; children: JSX.Element }) {
  return <label class="grid gap-1 text-ui">{props.label}{props.children}</label>;
}
function ContactForm(props: { context: Context }) {
  const [name, setName] = createSignal('');
  const [phone, setPhone] = createSignal('');
  return <form class="grid max-w-lg gap-3" onSubmit={event => { event.preventDefault(); const body = { name: name().trim(), phone: phone().trim() }; void props.context.run(props.context.api.operations.saveContact(body)); }}>
    <Field label={t('broadcasts.name')}><Input required value={name()} disabled={props.context.busy()} onInput={e => setName(e.currentTarget.value)}/></Field>
    <Field label={t('web.messaging.phone')}><Input type="tel" required value={phone()} disabled={props.context.busy()} onInput={e => setPhone(e.currentTarget.value)}/></Field>
    <Button type="submit" disabled={props.context.busy()}>{t('web.messaging.save_contact')}</Button>
  </form>;
}
function TemplateForm(props: { context: Context; draft?: MessagingTemplate }) {
  const [name, setName] = createSignal(props.draft?.name ?? '');
  const [body, setBody] = createSignal(props.draft?.components.body.text ?? '');
  const [channel, setChannel] = createSignal(props.draft?.channel_ids[0] ?? '');
  const [language, setLanguage] = createSignal(props.draft?.language ?? 'es_MX');
  const [category, setCategory] = createSignal<'utility' | 'marketing' | 'authentication'>(props.draft?.category as 'utility' | 'marketing' | 'authentication' ?? 'utility');
  const [channels, setChannels] = createSignal<MessagingChannel[]>([]);
  const [error, setError] = createSignal(false);
  onMount(() => { void choices(cursor => props.context.api.channels(cursor, props.context.signal)).then(rows => setChannels(rows.filter(row => row.provider === 'whatsapp' && row.connection.status === 'connected')), () => { if (!props.context.signal.aborted) setError(true); }); });
  return <form class="grid max-w-lg gap-3" onSubmit={event => { event.preventDefault(); const payload = { name: name(), language: language(), category: category(), channel_ids: [channel()], components: { header: props.draft?.components.header ?? null, body: { ...props.draft?.components.body, text: body() }, footer: props.draft?.components.footer ?? null } }; void props.context.run(props.context.api.operations.saveTemplate(payload, props.draft?.id)); }}>
    <Show when={error()}><p role="alert">{t('web.platform.unavailable')}</p></Show>
    <Field label={t('broadcasts.name')}><Input required pattern="[a-z0-9_]+" disabled={props.context.busy()} value={name()} onInput={e => setName(e.currentTarget.value)}/></Field>
    <Field label={t('broadcasts.whatsapp_number')}><Select required disabled={props.context.busy()} value={channel()} onChange={e => setChannel(e.currentTarget.value)}><option value="">{t('web.messaging.choose')}</option><For each={channels()}>{row => <option value={row.id}>{row.name}</option>}</For></Select></Field>
    <Field label={t('broadcasts.language')}><Select value={language()} disabled={props.context.busy()} onChange={e => setLanguage(e.currentTarget.value)}><For each={['es_MX', 'es_ES', 'en_US']}>{value => <option value={value}>{t(`broadcasts.language_${value}`)}</option>}</For></Select></Field>
    <Field label={t('broadcasts.category')}><Select value={category()} disabled={props.context.busy()} onChange={e => setCategory(e.currentTarget.value as 'utility' | 'marketing' | 'authentication')}><option value="utility">{t('broadcasts.category_utility')}</option><option value="marketing">{t('broadcasts.category_marketing')}</option></Select></Field>
    <Field label={t('web.messaging.body')}><Textarea required maxLength={1024} disabled={props.context.busy()} value={body()} onInput={e => setBody(e.currentTarget.value)}/></Field>
    <Button type="submit" disabled={props.context.busy() || !channel()}>{t('web.messaging.save_template')}</Button>
    <Button variant="secondary" disabled={props.context.busy()} onClick={() => void props.context.run(props.context.api.operations.syncTemplates())}>{t('broadcasts.sync')}</Button>
  </form>;
}
function CampaignForm(props: { context: Context }) {
  const [name, setName] = createSignal('');
  const [template, setTemplate] = createSignal('');
  const [channel, setChannel] = createSignal('');
  const [templates, setTemplates] = createSignal<MessagingTemplate[]>([]);
  const [channels, setChannels] = createSignal<MessagingChannel[]>([]);
  const [error, setError] = createSignal(false);
  const [variables, setVariables] = createSignal<Record<string, string>>({});
  const selected = () => templates().find(row => row.id === template());
  onMount(() => { void Promise.all([choices(cursor => props.context.api.templates(cursor, props.context.signal)), choices(cursor => props.context.api.channels(cursor, props.context.signal))]).then(([tpl, ch]) => { setTemplates(tpl.filter(row => row.status === 'approved' && !['image','video','document'].includes(row.components.header?.format ?? ''))); setChannels(ch); }, () => { if (!props.context.signal.aborted) setError(true); }); });
  return <form class="grid max-w-lg gap-3" onSubmit={event => { event.preventDefault(); const body = { name: name().trim(), template_id: template(), channel_id: channel(), variables: Object.fromEntries(Object.entries(variables()).map(([key, value]) => [key, { value }])) }; void props.context.run(props.context.api.operations.createCampaign(body)); }}>
    <Show when={error()}><p role="alert">{t('web.platform.unavailable')}</p></Show>
    <Field label={t('broadcasts.name')}><Input required maxLength={120} disabled={props.context.busy()} value={name()} onInput={e => setName(e.currentTarget.value)}/></Field>
    <Field label={t('web.messaging.templates')}><Select required disabled={props.context.busy()} value={template()} onChange={e => { setTemplate(e.currentTarget.value); setChannel(''); setVariables({}); }}><option value="">{t('web.messaging.choose')}</option><For each={templates()}>{row => <option value={row.id}>{row.name}</option>}</For></Select></Field>
    <Field label={t('web.messaging.channels')}><Select required disabled={props.context.busy()} value={channel()} onChange={e => setChannel(e.currentTarget.value)}><option value="">{t('web.messaging.choose')}</option><For each={channels().filter(row => selected()?.channel_ids.includes(row.id))}>{row => <option value={row.id}>{row.name}</option>}</For></Select></Field>
    <For each={selected()?.variables ?? []}>{variable => <Field label={variable.name}><Input required disabled={props.context.busy()} value={variables()[variable.name] ?? ''} onInput={e => setVariables({ ...variables(), [variable.name]: e.currentTarget.value })}/></Field>}</For>
    <Button type="submit" disabled={props.context.busy() || !channel()}>{t('web.messaging.create_campaign')}</Button>
  </form>;
}
function CampaignOperations(props: { context: Context; row: MessagingCampaign }) {
  const [contacts, setContacts] = createSignal<MessagingContact[]>([]);
  const [chosen, setChosen] = createSignal<string[]>([]);
  const [showContacts, setShowContacts] = createSignal(false);
  const [error, setError] = createSignal(false);
  const [sendAt, setSendAt] = createSignal('');
  const [confirm, setConfirm] = createSignal<CampaignAction>();
  const [audience, setAudience] = createSignal('');
  const actions = (): CampaignAction[] => props.row.status === 'draft' || props.row.status === 'scheduled' ? ['start', 'schedule', 'cancel'] : props.row.status === 'running' ? ['pause', 'cancel'] : props.row.status === 'paused' ? ['resume', 'cancel'] : [];
  async function pickContacts() {
    try { const rows = await choices(cursor => props.context.api.contacts(cursor, props.context.signal)); setContacts(rows); setShowContacts(true); }
    catch { if (!props.context.signal.aborted) setError(true); }
  }
  return <div class="grid gap-2">
    <p class="m-0 text-ui">{t(`broadcasts.status_${props.row.status}`)} · {t('web.messaging.total', { count: props.row.stats.audience ?? 0 })}</p>
    <Show when={error()}><p role="alert">{t('web.platform.unavailable')}</p></Show>
    <Show when={actions().length}><Button variant="secondary" disabled={props.context.busy()} onClick={() => void pickContacts()}>{t('web.messaging.add_contacts')}</Button></Show>
    <Show when={showContacts()}><fieldset disabled={props.context.busy()} class="grid gap-2 border border-border p-3"><For each={contacts()}>{row => <label class="text-ui"><input type="checkbox" checked={chosen().includes(row.id)} onChange={e => setChosen(e.currentTarget.checked ? [...chosen(), row.id] : chosen().filter(id => id !== row.id))}/> {row.name || row.phone}</label>}</For>
      <Button disabled={!chosen().length || props.context.busy()} onClick={() => { const ids = [...chosen()]; void props.context.run(props.context.api.operations.audience(props.row.id, ids), result => { setAudience(t('web.messaging.audience_result', result)); setShowContacts(false); }); }}>{t('web.messaging.add_contacts')}</Button>
    </fieldset></Show>
    <Show when={audience()}><p role="status">{audience()}</p></Show>
    <div class="flex flex-wrap gap-2"><For each={actions()}>{action => <Button variant="secondary" disabled={props.context.busy()} onClick={() => setConfirm(action)}>{t(`web.messaging.${action}`)}</Button>}</For></div>
    <Show when={confirm()}>{action => <div class="grid gap-2 border border-border p-3">
      <p class="m-0 text-ui">{t('web.messaging.confirm_action', { action: t(`web.messaging.${action()}`) })}</p>
      <Show when={action() === 'schedule'}><Field label={t('web.messaging.send_at')}><Input type="datetime-local" value={sendAt()} disabled={props.context.busy()} onInput={e => setSendAt(e.currentTarget.value)}/></Field></Show>
      <Button disabled={props.context.busy() || action() === 'schedule' && !sendAt()} onClick={() => { const operation = action(); const body = operation === 'schedule' ? { send_at: new Date(sendAt()).toISOString() } : {}; void props.context.run(props.context.api.operations.campaignAction(props.row.id, operation, body), () => { setConfirm(undefined); }); }}>{t('web.messaging.confirm')}</Button>
    </div>}</Show>
  </div>;
}
