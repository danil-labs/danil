import { createEffect, createSignal, For, on, onCleanup, onMount, Show } from 'solid-js';
import { createInbox, matchesFilter, type Conversation, type ConversationCounts, type InboxFilter, type Message } from '../../../../../packages/attention/src/inbox.ts';
import { resolveWorkspaceAccount } from '../../../../../packages/attention/src/workspace-account.ts';
import { bffTransport } from './transport';
import { accountSources, type AgentsSession } from './workspace-sources';
import { t } from '../../lib/i18n';
import { inboxDraft } from './inbox-drafts';
import { createMessaging } from '../../../../../packages/attention/src/messaging.ts';
import { publishConversations, requestedConversation, requestConversation } from './loaded';
import { createPref } from '../../lib/prefs';
import { inboxWidth } from './inbox-widths';
import { Button } from '../../ui/Button';
import { Skeleton } from '../../ui/Skeleton';
import { ChannelFilter, ContactDetails, ConversationHeader, ConversationRow, ConversationSearch, FilterChips, InboxComposer, InboxSplitter, MessageBubble, senderLabel, SelectConversation } from './inbox-view';

/** La lista de conversaciones: por debajo de 224 el nombre y el avatar no caben. */
const LIST_MIN = 224;
const LIST_MAX = 480;
const LIST_DEFAULT = 288;
/** El detalle del contacto abre con el ancho que tenía antes de poder arrastrarse. */
const DETAIL_MIN = 240;
const DETAIL_MAX = 560;
const DETAIL_DEFAULT = 320;

export function Attention(props: { demo: boolean; session?: AgentsSession & { subscribe?: (clear: () => void) => () => void }; workspace: () => string | null }) {
  const [resolved, setResolved] = createSignal(false);
  const [account, setAccount] = createSignal<number>();
  const [rows, setRows] = createSignal<Conversation[]>([]);
  const [selected, setSelected] = createSignal<Conversation>();
  const [messages, setMessages] = createSignal<Message[]>([]);
  const [more, setMore] = createSignal(false);
  const [older, setOlder] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [loadingThread, setLoadingThread] = createSignal(false);
  const [error, setError] = createSignal('');
  const [canReply, setCanReply] = createSignal(false);
  const [detail, setDetail] = createSignal(false);
  const [query, setQuery] = createSignal('');
  const [channel, setChannel] = createSignal<string | null>(null);
  const [filter, setFilter] = createSignal<InboxFilter>('all');
  const [counts, setCounts] = createSignal<ConversationCounts>({ assistance: null, aiDisabled: null });
  const [listWidth, setListWidth] = createPref('inbox.list.width', LIST_DEFAULT);
  const [detailWidth, setDetailWidth] = createPref('inbox.detail.width', DETAIL_DEFAULT);
  // Lo guardado se acota a los topes de hoy al montar: un tope que bajó no se entera solo.
  if (listWidth() < LIST_MIN || listWidth() > LIST_MAX) setListWidth(inboxWidth(listWidth(), LIST_MIN, LIST_MAX));
  if (detailWidth() < DETAIL_MIN || detailWidth() > DETAIL_MAX) setDetailWidth(inboxWidth(detailWidth(), DETAIL_MIN, DETAIL_MAX));
  let listPanel: HTMLElement | undefined;
  let detailPanel: HTMLElement | undefined;
  const bff = bffTransport();
  const api = props.session ? createInbox(props.session, bff.request, bff.prefix) : null;
  const draftSession = props.session ?? { getToken: async () => '', unauthorized: async () => false };
  const messaging = props.session ? createMessaging(props.session, bff.request, bff.prefix) : null;
  let epoch = 0;
  let thread = 0;
  const clear = () => { epoch++; thread++; setCanReply(false); setRows([]); setSelected(undefined); setMessages([]); setMore(false); setOlder(false); setError(''); setDetail(false); setLoadingThread(false); setQuery(''); setChannel(null); setFilter('all'); setCounts({ assistance: null, aiDisabled: null }); };
  onCleanup(() => { epoch++; thread++; });
  // Cambiar de workspace es cambiar de cuenta: no queda nada del anterior en pantalla.
  createEffect(on(props.workspace, () => { if (!props.demo) void connect(); }, { defer: true }));
  onMount(() => {
    const stop = props.session?.subscribe?.(() => { clear(); setResolved(false); setAccount(undefined); setBusy(false); });
    if (stop) onCleanup(stop);
    if (!props.demo) void connect();
    if (props.demo) { setRows(demoRows()); setCounts({ assistance: 1, aiDisabled: 2 }); }
  });
  async function connect() {
    clear(); setResolved(false); setAccount(undefined); const request = epoch; setBusy(true);
    try { if (!api) throw new Error(t("web.alpha.session_required")); const value = await resolveWorkspaceAccount(props.workspace(), accountSources(props.session!)); if (request === epoch) { setResolved(true); if (value) void load(value.id); } }
    catch (cause) { if (request === epoch) setError(cause instanceof Error && cause.message === 'workspace_not_entered' ? t("web.service.not_entered") : cause instanceof Error ? cause.message : t("web.alpha.error")); }
    finally { if (request === epoch) setBusy(false); }
  }
  async function load(id: number, append = false) {
    if (!append) { clear(); setAccount(id); }
    const request=epoch; setBusy(true); setError('');
    try { if (!api) return; const [page, permissions] = await Promise.all([api.conversations(id,append?rows().length:0), api.permissions(id).catch(() => null)]); if(request===epoch)setCanReply(permissions?.permissions.includes('inbox.respond') === true); if(request===epoch){setRows(append?[...rows(),...page.rows]:page.rows);setMore(page.hasMore);setCounts(page.counts);} }
    catch(cause){if(request===epoch)setError(cause instanceof Error?cause.message:t("web.alpha.error"));}
    finally{if(request===epoch)setBusy(false);}
  }
  async function open(row: Conversation, previous=false) {
    if(!previous){thread++;setSelected(row);setMessages([]);setOlder(false);setDetail(false);}
    if(props.demo){setMessages([{id:1,conversation_id:row.id,content:row.last_message,direction:'inbound',sender_type:'contact'},{id:2,conversation_id:row.id,content:t("web.alpha.sample_reply"),direction:'outbound',sender_type:'ai-agent'}]);return;}
    const request=epoch, selectedThread=thread;setBusy(true);setLoadingThread(true);setError('');
    try{if(!api||!account())return;const page=await api.messages(account()!,row.id,previous?messages()[0]?.id:undefined);if(request===epoch&&selectedThread===thread){setMessages(previous?[...page.rows,...messages()]:page.rows);setOlder(page.hasMore);}}
    catch(cause){if(request===epoch&&selectedThread===thread)setError(cause instanceof Error?cause.message:t("web.alpha.error"));}
    finally{if(request===epoch&&selectedThread===thread){setBusy(false);setLoadingThread(false);}}
  }
  // El buscador global solo ve lo ya cargado y pide abrir una de esas filas.
  createEffect(() => publishConversations(rows()));
  onCleanup(() => publishConversations([]));
  createEffect(() => { const id = requestedConversation(); const row = id === null ? undefined : rows().find(r => r.id === id); if (row) { requestConversation(null); void open(row); } });
  function close() { thread++; setSelected(undefined); setMessages([]); setOlder(false); setError(''); setBusy(false); setLoadingThread(false); setDetail(false); }
  // Un tramo se corta al cambiar de lado o de remitente, como en Danil Agents.
  const position = (index: number) => {
    const list = messages();
    const same = (a?: Message, b?: Message) => !!a && !!b && a.direction === b.direction && senderLabel(a) === senderLabel(b);
    const prev = same(list[index - 1], list[index]);
    const next = same(list[index + 1], list[index]);
    return prev && next ? 'middle' : prev ? 'last' : next ? 'first' : 'single';
  };
  // La lista de alfa no admite `q` ni `channel_id`: se filtra lo ya cargado, páginas extra incluidas.
  const fold = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const channels = () => [...new Set(rows().map(row => row.channel_name.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const visible = () => {
    const needle = fold(query().trim());
    return rows().filter(row => matchesFilter(row, filter()) && (!channel() || row.channel_name.trim() === channel()) && (!needle || fold(`${row.contact_name} ${row.contact_phone ?? ''} ${row.contact_email ?? ''} ${row.contact_handle ?? ''} ${row.last_message} ${row.channel_name}`).includes(needle)));
  };
  const filtering = () => !!query().trim() || !!channel() || filter() !== 'all';
  // Los totales son de la cuenta entera; con un canal elegido no corresponden y no se muestran.
  const chipCounts = () => channel() ? {} : { assistance: counts().assistance, ai_disabled: counts().aiDisabled };
  const emptyText = () => query().trim() ? t("web.alpha.search_empty", { query: query().trim() }) : filter() !== 'all' ? t(`web.alpha.empty_${filter()}`) : t("web.alpha.channel_empty", { channel: channel() ?? '' });
  const listLoading = () => busy() && rows().length === 0 && !selected();
  return <section class="@container flex h-full min-h-0 min-w-0 flex-col overflow-hidden" style={{ '--inbox-list': `${listWidth()}px`, '--inbox-detail': `${detailWidth()}px` }} data-alpha-inbox="">
    <Show when={props.demo}><p class="m-0 border-b border-border px-4 py-2 text-xs text-neutral-500">{t("web.alpha.demo_badge")} · {t("web.alpha.external_only")} <a class="ml-2 underline" href={`${import.meta.env.BASE_URL}inbox`}>{t("web.alpha.change_mode")}</a></p></Show>
    {/* Alfa: sin selector de cuenta; abre «Danil Workspace» si existe y si no la primera. */}
    <Show when={error()}><div role="alert" class="flex flex-wrap items-center gap-2 border-b border-border p-3"><p class="m-0 text-sm text-error-strong">{t("web.alpha.error")} {error()}</p><Button size="sm" variant="secondary" disabled={busy()} onClick={() => selected() ? void open(selected()!) : account() ? void load(account()!) : void connect()}>{t("customize.retry")}</Button></div></Show>
    <div class="flex min-h-0 flex-1 overflow-hidden">
      <section ref={el => (listPanel = el)} aria-label={t("customize.conversations")} class={`min-h-0 w-full min-w-0 flex-col overflow-hidden dark:bg-surface @[46rem]:flex @[46rem]:w-[var(--inbox-list)] @[46rem]:max-w-[calc(100%_-_22.5rem)] @[46rem]:shrink-0 @[46rem]:border-r @[46rem]:border-border ${selected() ? 'hidden' : 'flex'}`}>
        <header class="flex min-h-11 w-full min-w-0 shrink-0 items-center gap-2 border-b border-border px-3 py-1">
          <span class="min-w-0 flex-1 truncate text-[0.85rem] font-semibold text-neutral-950">{t("web.alpha.inbox")}</span>
          <span class="shrink-0 rounded-full border border-border px-2 py-[3px] text-[0.68rem] font-medium text-neutral-500">{canReply() ? t("inbox-writes.enabled") : t("customize.read_only")}</span>
          <Show when={channels().length > 1}><ChannelFilter channels={channels()} value={channel()} onChange={setChannel}/></Show>
        </header>
        <div class="grid w-full min-w-0 shrink-0 gap-2 border-b border-border px-3 py-2"><ConversationSearch value={query()} onChange={setQuery}/><FilterChips value={filter()} counts={chipCounts()} onChange={setFilter}/></div>
        <div class="min-h-0 flex-1 overflow-y-auto">
          <Show when={!props.demo && resolved() && !busy() && !error() && !account()}><div role="status" class="grid gap-1 p-4 text-center text-[0.85rem] text-neutral-500" data-attention-unresolved=""><p class="m-0 font-medium text-neutral-950">{t("web.service.unresolved")}</p><p class="m-0">{t("web.service.unresolved_hint")}</p></div></Show>
          <Show when={listLoading()}><div class="p-3"><Skeleton class="h-14 rounded-md" filas={6}/></div></Show>
          <Show when={!busy() && !error() && (props.demo || account()) && rows().length === 0}><p role="status" class="p-4 text-center text-[0.85rem] text-neutral-500">{t("customize.page_empty")}</p></Show>
          <Show when={rows().length > 0 && visible().length === 0}><p role="status" class="p-4 text-center text-[0.85rem] text-neutral-500">{emptyText()}</p></Show>
          <ul class="m-2 grid min-w-0 list-none gap-0.5 p-0">
            <For each={visible()}>{row => <li class="min-w-0"><ConversationRow conversation={row} showChannel={channels().length > 1} active={selected()?.id === row.id} onSelect={() => void open(row)}/></li>}</For>
          </ul>
          <Show when={more() && filtering()}><p class="m-0 px-4 pb-2 text-center text-[0.72rem] text-neutral-500">{t("web.alpha.filter_loaded_only")}</p></Show>
          <Show when={more()}><div class="flex justify-center pb-3"><Button size="sm" variant="secondary" disabled={busy()} onClick={() => void load(account()!, true)}>{t("web.alpha.more")}</Button></div></Show>
        </div>
      </section>
      <InboxSplitter class="hidden @[46rem]:block" label={t("web.alpha.resize_list")} side="left" panel={() => listPanel} min={LIST_MIN} max={LIST_MAX} value={listWidth()} onResize={setListWidth} onReset={() => setListWidth(LIST_DEFAULT)}/>
      <div class={`min-h-0 min-w-0 flex-1 flex-col overflow-hidden @[46rem]:flex ${selected() ? 'flex' : 'hidden'}`}>
        <Show when={selected()} fallback={<SelectConversation/>}>{row => <section class="@container/detail flex h-full min-h-0 min-w-0 flex-col" aria-label={t("web.alpha.conversation_with", { name: row().contact_name || t("web.alpha.contact_fallback") })}>
          <ConversationHeader conversation={row()} detailsOpen={detail()} onBack={close} onToggleDetails={() => setDetail(!detail())}/>
          <div class="relative min-h-0 min-w-0 flex-1 overflow-hidden @[40rem]/detail:flex @[40rem]/detail:flex-row">
            <div class="@container relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden dark:bg-surface-muted @[40rem]/detail:min-w-0 @[40rem]/detail:flex-1">
              <div aria-label={t("web.alpha.messages")} class="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 pt-4 pb-[112px] [overscroll-behavior:contain] @[32rem]:px-6 @[48rem]:px-8 @[64rem]:px-12">
                <div class="grid min-h-full min-w-0 content-end gap-0">
                  <Show when={loadingThread() && messages().length === 0}><div class="grid gap-3 p-3" aria-label={t("web.alpha.loading_messages")}><Skeleton class="h-[72px] w-[min(72%,360px)] rounded-[18px]"/><div class="w-[min(72%,360px)] justify-self-end"><Skeleton class="h-[72px] w-full rounded-[18px]"/></div><Skeleton class="h-[52px] w-[min(48%,260px)] rounded-[18px]"/></div></Show>
                  <Show when={older()}><div class="flex justify-center py-1"><Button size="sm" variant="secondary" disabled={busy()} class="text-[0.8rem] font-semibold text-primary-dark" onClick={() => void open(row(), true)}>{busy() ? t("web.alpha.loading") : t("web.alpha.older")}</Button></div></Show>
                  <For each={messages()}>{(message, index) => <MessageBubble message={message} position={position(index())}/>}</For>
                  <Show when={!loadingThread() && !error() && messages().length === 0}><p class="m-0 p-3 text-center text-[0.85rem] text-neutral-500">{t("web.alpha.no_messages")}</p></Show>
                </div>
              </div>
              <InboxComposer draft={inboxDraft(draftSession, account() ?? 0, row().id)} conversation={row().id} allowed={canReply() && !props.demo && !row().contact_blocked} onSend={async (id, text, clientId, signal) => {
                if (!messaging || !canReply()) throw new Error(t("inbox-writes.denied"));
                return messaging.reply(id, text, clientId, signal);
              }} onRefresh={async () => {
                if (!api || !account()) throw new Error(t("web.alpha.session_required"));
                const currentEpoch = epoch, currentThread = thread;
                const page = await api.messages(account()!, row().id);
                if (currentEpoch === epoch && currentThread === thread) { setMessages(page.rows); setOlder(page.hasMore); }
              }}/>
            </div>
            <Show when={detail()}>
              <button type="button" class="absolute inset-0 z-10 bg-neutral-950/30 @[40rem]/detail:hidden" aria-label={t("web.alpha.close_details")} onClick={() => setDetail(false)}/>
              <InboxSplitter class="hidden @[40rem]/detail:block" label={t("web.alpha.resize_details")} side="right" panel={() => detailPanel} min={DETAIL_MIN} max={DETAIL_MAX} value={detailWidth()} onResize={setDetailWidth} onReset={() => setDetailWidth(DETAIL_DEFAULT)}/>
              <ContactDetails ref={el => (detailPanel = el)} conversation={row()} onClose={() => setDetail(false)}/>
            </Show>
          </div>
        </section>}</Show>
      </div>
    </div>
  </section>;
}

// El demo enseña cada estado de la fila de Appv2: humano requerido con la IA apagada,
// pausa por bucle, IA bloqueada y canales distintos. Las horas salen de «ahora».
function demoRows(): Conversation[] {
  const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
  const base = { account_id: 1, assist_reason: null, assistance_requested_at: null, assistance_state: null, contact_ai_blocked: false, contact_blocked: false, contact_phone: '', contact_handle: '', contact_email: '', last_message_direction: 'inbound', last_message_sender_type: 'contact' };
  return [
    { ...base, id: 1, contact_name: t("web.alpha.contact1"), channel_name: 'WhatsApp', active_provider: 'whatsapp_cloud', contact_phone: '5219991234567', last_message: t("web.alpha.preview1"), ai_assistance: false, unread_count: 2, last_message_at: ago(4), assistance_requested_at: ago(20), assistance_state: 'active' },
    { ...base, id: 2, contact_name: t("web.alpha.contact2"), channel_name: 'Web', active_provider: 'web', contact_email: 'luis@ejemplo.mx', last_message: t("web.alpha.preview2"), ai_assistance: true, unread_count: 0, last_message_at: ago(55) },
    { ...base, id: 4, contact_name: t("web.alpha.contact4"), channel_name: 'Instagram', active_provider: 'instagram', contact_handle: 'diego.ejemplo', last_message: t("web.alpha.preview4"), ai_assistance: false, unread_count: 1, last_message_at: ago(60 * 26), assist_reason: 'loop' },
    { ...base, id: 3, contact_name: t("web.alpha.contact3"), channel_name: 'WhatsApp', active_provider: 'whatsapp_cloud', contact_phone: '5215550001122', last_message: t("web.alpha.preview3"), ai_assistance: true, unread_count: 0, last_message_at: ago(60 * 24 * 3), last_message_direction: 'outbound', last_message_sender_type: 'ai-agent' },
    { ...base, id: 5, contact_name: '', channel_name: 'Messenger', active_provider: 'messenger', contact_handle: '27461930', last_message: t("web.alpha.preview5"), ai_assistance: false, unread_count: 0, last_message_at: ago(60 * 24 * 9), contact_ai_blocked: true },
  ];
}
