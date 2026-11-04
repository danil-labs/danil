import { createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import { createChannels, type Channel, type ConnectionState } from '../../../../../packages/attention/src/channels.ts';
import type { InboxSession } from '../../../../../packages/attention/src/inbox.ts';
import { SettingsRow, SettingsSection } from '../../features/settings/layout';
import { t } from '../../lib/i18n';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { bffTransport } from './transport';

const TONE: Record<ConnectionState, 'success' | 'warning' | 'danger' | 'neutral'> = {
  connected: 'success', connecting: 'warning', expired: 'danger', disconnected: 'danger', failed: 'danger', replaced: 'neutral', untracked: 'neutral',
};
const DEMO: Channel[] = [
  { id: 1, account_id: null, name: 'WhatsApp · Ventas', provider: 'whatsapp', identity: '+52 55 0000 0000', active: true, connection: 'connected' },
  { id: 2, account_id: null, name: 'Web', provider: 'web', identity: '', active: true, connection: 'untracked' },
  { id: 3, account_id: null, name: 'Instagram', provider: 'instagram', identity: '@ejemplo', active: false, connection: 'expired' },
];
const PROVIDERS: Record<string, string> = { whatsapp: 'WhatsApp', whatsapp_cloud: 'WhatsApp', instagram: 'Instagram', messenger: 'Messenger', web: 'Web', simla: 'Simla' };

/** Canales de la cuenta activa en Appv2, de sólo lectura. Conectar o editar sigue en Appv2. */
export function Channels(props: { demo: boolean; session?: InboxSession & { subscribe?: (clear: () => void) => () => void } }) {
  const [rows, setRows] = createSignal<Channel[]>(props.demo ? DEMO : []);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal('');
  const bff = bffTransport();
  const api = props.session ? createChannels(props.session, bff.request, bff.prefix) : null;
  let epoch = 0;
  async function load() {
    if (props.demo) return;
    const request = ++epoch; setBusy(true); setError('');
    try { if (!api) throw new Error(t('web.alpha.session_required')); const value = await api.list(); if (request === epoch) setRows(value); }
    catch (cause) { if (request === epoch) { setRows([]); setError(cause instanceof Error ? cause.message : t('web.alpha.error')); } }
    finally { if (request === epoch) setBusy(false); }
  }
  onMount(() => {
    const stop = props.session?.subscribe?.(() => { epoch++; setRows([]); setError(''); setBusy(false); });
    if (stop) onCleanup(stop);
    void load();
  });
  onCleanup(() => { epoch++; });
  return <SettingsSection title={t('web.alpha.channels_title')} description={props.demo ? t('web.alpha.channels_demo') : t('web.alpha.channels_live')}>
    <Show when={!props.demo}><Button size="sm" variant="secondary" class="mb-2 justify-self-start" disabled={busy()} onClick={() => void load()}>{t('web.alpha.refresh')}</Button></Show>
    <Show when={busy()}><p role="status" class="text-xs text-neutral-500">{t('web.alpha.loading')}</p></Show>
    <Show when={error()}><p role="alert" class="text-sm text-error-strong">{t(error() === 'HTTP 403' ? 'web.alpha.channels_denied' : 'web.alpha.channels_error')} {error()}</p></Show>
    <Show when={!busy() && !error() && rows().length === 0}><p role="status" class="text-sm text-neutral-500">{t('web.alpha.channels_empty')}</p></Show>
    <For each={rows()}>{row => <SettingsRow
      label={row.name || PROVIDERS[row.provider] || row.provider}
      description={[PROVIDERS[row.provider] ?? row.provider, row.identity, row.active ? t('web.alpha.channel_ai_on') : t('web.alpha.channel_ai_off')].filter(Boolean).join(' · ')}>
      <Badge tone={TONE[row.connection]}>{t(`web.alpha.conn_${row.connection}`)}</Badge>
    </SettingsRow>}</For>
  </SettingsSection>;
}
