import { createSignal, onCleanup, onMount, Show } from 'solid-js';
import { t } from '../lib/i18n';
import { Button } from '../ui/Button';
import type { WatchedSession } from './session';
import { Attention } from './attention/Attention';
import { agentsSession, type AgentsSession } from './attention/workspace-sources';

/** The platform selection identifies the legacy directory entry; credentials stay separate. */
export function LegacyInbox(props: { workspace: string; session: WatchedSession; endpoint: string; login: string }) {
  const [ready, setReady] = createSignal<{ key: string; session: AgentsSession & { subscribe(clear: () => void): () => void } }>();
  const [error, setError] = createSignal(false);
  let disposed = false;
  onCleanup(() => { disposed = true; });
  onMount(() => { void (async () => {
    try {
      const person = await props.session.user();
      if (!person) throw new Error('legacy_session_required');
      const session = agentsSession(props.endpoint, props.session);
      const entries = (await session.directory()).filter(row => row.capabilities.agents && Number.isSafeInteger(row.danil_workspace_id) && String(row.danil_workspace_id) === props.workspace);
      const [entry] = entries;
      if (entries.length !== 1 || !entry) throw new Error('legacy_workspace_unavailable');
      if (!disposed) setReady({ key: entry.key, session: { ...session, subscribe: clear => props.session.watch(person.user_id, () => { clear(); if (!disposed) { setReady(undefined); setError(true); } }) } });
    } catch { if (!disposed) setError(true); }
  })(); });
  return <section class="min-h-[28rem]" data-legacy-inbox="">
    <Show when={error()}><p role="alert" class="text-ui text-error-strong">{t('web.alpha.session_required')}</p><Button as="a" href={props.login}>{t('web.auth.signin')}</Button></Show>
    <Show when={ready()}>{value => <Attention demo={false} session={value().session} workspace={() => value().key}/>}</Show>
  </section>;
}
