import { createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import type { Conversation, Message } from '../../../../packages/attention/src/inbox.ts';
import { t } from '../lib/i18n';
import { Button } from '../ui/Button';
import { ContactDetails, ConversationRow, ConversationHeader, InboxComposer, MessageBubble, SelectConversation } from './attention/inbox-view';
import { createInboxDraft, type InboxDraft } from './attention/inbox-drafts';
import { inboxConversation, inboxMessage, platformInbox } from './platform-inbox';
import type { inboxReplies } from './inbox-replies';
import { PlatformSessionError } from './platform-session';

/** Keyed by workspace in PlatformEntry: old reads and in-flight writes cannot enter a new inbox. */
export function PlatformInbox(props: { workspace: string; api: ReturnType<typeof platformInbox>; reply: ReturnType<typeof inboxReplies> }) {
  const [rows, setRows] = createSignal<Conversation<string>[]>([]);
  const [selected, setSelected] = createSignal<Conversation<string>>();
  const [messages, setMessages] = createSignal<Message<string>[]>([]);
  const [cursor, setCursor] = createSignal<string | null>(null);
  const [before, setBefore] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal('');
  const [details, setDetails] = createSignal(false);
  const drafts = new Map<string, InboxDraft>();
  const lifetime = new AbortController();
  let thread = 0;
  onCleanup(() => { lifetime.abort(); for (const draft of drafts.values()) draft.invalidate(); });
  const draft = (id: string) => {
    let value = drafts.get(id);
    if (!value) { value = createInboxDraft(); drafts.set(id, value); }
    return value;
  };
  const report = (cause: unknown) => setError(cause instanceof PlatformSessionError && cause.status === 403 ? t('inbox-writes.denied') : t('web.platform.unavailable'));
  async function load(append = false) {
    if (busy()) return;
    setBusy(true); setError('');
    try {
      const page = await props.api.conversations(append ? cursor() ?? undefined : undefined, lifetime.signal);
      if (lifetime.signal.aborted) return;
      if (append && page.page.has_more && page.page.next_cursor === cursor()) throw new Error('repeated_cursor');
      const incoming = page.data.map(row => inboxConversation(row, props.workspace));
      setRows([...new Map((append ? [...rows(), ...incoming] : incoming).map(row => [row.id, row])).values()]);
      setCursor(page.page.next_cursor);
    } catch (cause) { if (!lifetime.signal.aborted) report(cause); }
    finally { if (!lifetime.signal.aborted) setBusy(false); }
  }
  async function read(row: Conversation<string>, older = false) {
    const generation = ++thread;
    if (!older) { setSelected(row); setDetails(false); setMessages([]); setBefore(null); }
    setBusy(true); setError('');
    try {
      const page = await props.api.messages(row.id, older ? before() ?? undefined : undefined, lifetime.signal);
      if (lifetime.signal.aborted || generation !== thread) return;
      if (older && page.page.has_more && page.page.next_cursor === before()) throw new Error('repeated_cursor');
      const incoming = page.data.map(inboxMessage).reverse();
      setMessages([...new Map((older ? [...incoming, ...messages()] : incoming).map(row => [row.id, row])).values()]);
      setBefore(page.page.next_cursor);
    } catch (cause) { if (!lifetime.signal.aborted && generation === thread) { report(cause); throw cause; } }
    finally { if (!lifetime.signal.aborted && generation === thread) setBusy(false); }
  }
  const open = (row: Conversation<string>, older = false) => { void read(row, older).catch(() => { /* read displays the failure; the composer also needs its rejection. */ }); };
  onMount(() => { void load(); });
  return <section class="grid min-h-[28rem] gap-3" data-platform-inbox="" aria-label={t('web.alpha.inbox')} aria-busy={busy()}>
    <Show when={error()}><p role="alert" class="m-0 text-ui text-error-strong">{error()}</p><Button disabled={busy()} onClick={() => selected() ? open(selected()!) : void load()}>{t('customize.retry')}</Button></Show>
    <div class="grid min-h-[28rem] grid-cols-1 overflow-hidden rounded-lg border border-border md:grid-cols-[18rem_minmax(0,1fr)]">
      <div class="border-border md:border-r">
        <h2 class="m-0 border-b border-border p-3 text-ui font-semibold">{t('web.alpha.inbox')}</h2>
        <For each={rows()}>{row => <ConversationRow conversation={row} showChannel={false} active={selected()?.id === row.id} onSelect={() => open(row)}/>}</For>
        <Show when={!busy() && !error() && rows().length === 0}><p role="status" class="p-3 text-ui text-neutral-500">{t('customize.page_empty')}</p></Show>
        <Show when={cursor()}><Button disabled={busy()} onClick={() => void load(true)}>{t('web.alpha.more')}</Button></Show>
      </div>
      <Show when={selected()} fallback={<SelectConversation/>}>{row => <div class="relative flex min-h-[28rem] min-w-0 flex-col">
        <ConversationHeader conversation={row()} detailsOpen={details()} onBack={() => { thread++; setSelected(undefined); setMessages([]); setBusy(false); }} onToggleDetails={() => setDetails(!details())}/>
        <div class="grid flex-1 content-end overflow-y-auto px-4 pb-36" aria-label={t('web.alpha.messages')}>
          <Show when={before()}><Button disabled={busy()} onClick={() => open(row(), true)}>{t('web.alpha.older')}</Button></Show>
          <For each={messages()}>{message => <MessageBubble message={message} position="single"/>}</For>
          <Show when={!busy() && !error() && messages().length === 0}><p class="text-ui text-neutral-500">{t('web.alpha.no_messages')}</p></Show>
        </div>
        <Show when={details()}><ContactDetails conversation={row()} onClose={() => setDetails(false)}/></Show>
        <InboxComposer draft={draft(row().id)} conversation={row().id} allowed={!busy()} onSend={props.reply} onRefresh={() => read(row())}/>
      </div>}</Show>
    </div>
  </section>;
}
