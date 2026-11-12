import ArrowLeft from 'lucide-solid/icons/arrow-left';
import ChevronDown from 'lucide-solid/icons/chevron-down';
import Globe from 'lucide-solid/icons/globe';
import IdCard from 'lucide-solid/icons/id-card';
import InboxIcon from 'lucide-solid/icons/inbox';
import Mail from 'lucide-solid/icons/mail';
import MessageSquare from 'lucide-solid/icons/message-square';
import Paperclip from 'lucide-solid/icons/paperclip';
import Phone from 'lucide-solid/icons/phone';
import Radio from 'lucide-solid/icons/radio';
import Search from 'lucide-solid/icons/search';
import SendHorizontal from 'lucide-solid/icons/send-horizontal';
import { For, type JSX, Show } from 'solid-js';
import type { InboxDraft } from './inbox-drafts';
import { inboxDrag, inboxWidth, type InboxSide } from './inbox-widths';
import { ReplyError } from '../../../../../packages/attention/src/messaging.ts';
import { contactDisplayName, contactIdentifier, contactSubIdentifier, type Conversation as LegacyConversation, type ConversationLabel, conversationLabels, type InboxFilter, type Message as LegacyMessage, normalizeProvider } from '../../../../../packages/attention/src/inbox.ts';
import { df } from '../../lib/format';

type Conversation = LegacyConversation<number | string>;
type Message = LegacyMessage<number | string>;
import { t } from '../../lib/i18n';
import { Button } from '../../ui/Button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../ui/DropdownMenu';
import { Textarea } from '../../ui/Textarea';
import { Toggle } from '../../ui/Toggle';

// Medidas, radios y colores de globo tomados del Inbox de Danil Agents (Appv2); letra y fondos son de Terminus.

const initials = (name: string) => name.split(/\s+/).map(part => part.match(/[\p{L}\p{N}]/u)?.[0] ?? '').filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';
const contactName = (row: Conversation) => contactDisplayName(row, t("web.alpha.contact_fallback"));
const provider = (row: Conversation) => row.active_provider || row.channel_name;
const aiState = (row: Conversation) => row.contact_ai_blocked ? t("web.alpha.ai_blocked_toggle") : row.ai_assistance ? t("customize.ai_enabled") : t("customize.ai_paused");
const aiShort = (row: Conversation) => row.contact_ai_blocked ? t("web.alpha.ai_blocked_short") : row.ai_assistance ? t("web.alpha.ai_on_short") : row.assist_reason ? t("web.alpha.ai_loop_short") : t("web.alpha.ai_paused_short");

const validDate = (value: string | null | undefined) => { const date = value ? new Date(value) : null; return date && !Number.isNaN(date.getTime()) ? date : null; };
const shortDate = (date: Date) => df({ day: '2-digit', month: '2-digit', year: '2-digit' }).format(date);
/** La hora mientras es de hoy y la fecha cuando ya no, como la lista de WhatsApp. */
export function lastMessageStamp(value: string | null | undefined, now = new Date()) {
  const date = validDate(value);
  if (!date) return null;
  const today = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  return today ? df({ hour: '2-digit', minute: '2-digit', hour12: false }).format(date) : shortDate(date);
}

/** El ícono de marca de cada canal; lucide ya no trae los de WhatsApp, Instagram ni Facebook. */
function ChannelGlyph(props: { provider: string; size: number }) {
  const icon = (children: JSX.Element, tone: string, fill = false) => <svg width={props.size} height={props.size} viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke={fill ? 'none' : 'currentColor'} stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class={`shrink-0 ${tone}`}>{children}</svg>;
  const kind = () => normalizeProvider(props.provider);
  return <>
    <Show when={kind() === 'whatsapp'}>{icon(<path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885M20.52 3.449C18.24 1.245 15.24 0 12.045 0 5.463 0 .104 5.334.101 11.892c0 2.096.549 4.142 1.595 5.945L0 24l6.335-1.652a12.062 12.062 0 005.71 1.447h.005c6.585 0 11.946-5.336 11.949-11.896 0-3.176-1.24-6.165-3.495-8.411z"/>, 'text-inbox-channel-whatsapp', true)}</Show>
    <Show when={kind() === 'instagram'}>{icon(<><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></>, 'text-inbox-channel-instagram')}</Show>
    <Show when={kind() === 'messenger'}>{icon(<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>, 'text-inbox-channel-messenger')}</Show>
    <Show when={kind() === 'web'}><Globe size={props.size} class="shrink-0 text-neutral-500" aria-hidden="true"/></Show>
    <Show when={!['whatsapp', 'instagram', 'messenger', 'web'].includes(kind())}><Radio size={props.size} class="shrink-0 text-neutral-500" aria-hidden="true"/></Show>
  </>;
}

const labelTone: Record<ConversationLabel, string> = { ai_paused_loop: 'bg-warning/16 text-warning-strong', ai_off: 'bg-brand-yellow text-brand-navy', human_required: 'bg-error/15 text-error-strong' };
const labelText: Record<ConversationLabel, string> = { ai_paused_loop: 'web.alpha.label_ai_paused_loop', ai_off: 'web.alpha.ai_off', human_required: 'web.alpha.label_human_required' };
const labelTitle = (row: Conversation, label: ConversationLabel) => {
  if (label !== 'human_required') return undefined;
  const since = validDate(row.assistance_requested_at);
  return since ? t("web.alpha.label_human_waiting_since", { date: shortDate(since) }) : t("web.alpha.label_human_waiting");
};

/** Las etiquetas de estado de Appv2: marcas cortas bajo la vista previa, más chicas que cualquier otra línea. */
export function ConversationLabels(props: { conversation: Conversation }) {
  return <Show when={conversationLabels(props.conversation).length > 0}>
    <span class="mt-1 flex min-w-0 max-w-full flex-wrap items-center gap-1 overflow-hidden">
      <For each={conversationLabels(props.conversation)}>{label => <span title={labelTitle(props.conversation, label)} class={`inline-flex shrink-0 items-center rounded-sm px-[3px] py-px text-[0.47rem] leading-[1.6] font-semibold tracking-[0.06em] uppercase ${labelTone[label]}`}>{t(labelText[label])}</span>}</For>
    </span>
  </Show>;
}

export const senderLabel = (message: Message) => message.direction === 'inbound' ? '' : /^ai(-agent)?$/.test(message.sender_type) ? t("web.alpha.sender_ai") : t("web.alpha.sender_team");

// Appv2 no manda foto del contacto: su avatar también es de iniciales.
function ContactAvatar(props: { name: string; channel: string; provider: string; size: 'row' | 'card' }) {
  return <span class="relative mt-0.5 shrink-0" role={props.size === 'row' ? 'img' : undefined} aria-label={props.size === 'row' ? props.channel || undefined : undefined} title={props.size === 'row' ? props.channel || undefined : undefined}>
    <span aria-hidden="true" class={`grid place-items-center rounded-full bg-neutral-100 text-neutral-700 dark:bg-surface-raised ${props.size === 'row' ? 'size-9 text-[0.8rem]' : 'size-11 text-[0.85rem]'}`}>{initials(props.name)}</span>
    <Show when={props.size === 'row'}><span aria-hidden="true" class="absolute -right-0.5 -bottom-0.5 grid size-[15px] place-items-center rounded-full border border-border bg-surface"><ChannelGlyph provider={props.provider} size={9}/></span></Show>
  </span>;
}

export function ConversationSearch(props: { value: string; onChange: (value: string) => void }) {
  return <div class="flex h-8 w-full min-w-0 items-center gap-1.5 rounded-full border border-border bg-surface py-0 pr-1 pl-2.5 text-neutral-500 transition-all duration-150 ease-out focus-within:border-primary focus-within:ring-[3px] focus-within:ring-primary/15">
    <Search size={13} class="shrink-0 text-neutral-500" aria-hidden="true"/>
    <input type="search" aria-label={t("web.alpha.search_label")} placeholder={t("web.alpha.search_placeholder")} value={props.value} onInput={event => props.onChange(event.currentTarget.value)} class="h-full w-full min-w-0 border-none bg-transparent p-0 text-label text-neutral-950 outline-none placeholder:text-neutral-500 [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-cancel-button]:[-webkit-appearance:none]"/>
  </div>;
}

const channelOption = 'flex cursor-pointer items-center gap-2 border border-transparent text-[0.78rem] aria-[current=true]:border-border-strong aria-[current=true]:bg-surface-raised aria-[current=true]:shadow-sm';

export function ChannelFilter(props: { channels: string[]; value: string | null; onChange: (value: string | null) => void }) {
  return <DropdownMenu>
    <DropdownMenuTrigger aria-label={t("web.alpha.channel_filter")} class="inline-flex h-8 min-h-8 w-auto max-w-[11rem] shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-neutral-200 bg-surface-raised px-2.5 py-1 text-[0.78rem] font-medium text-neutral-900 transition-colors outline-none hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-primary/20 dark:border-border-strong dark:text-neutral-950 dark:hover:bg-surface-muted">
      <Show when={props.value} fallback={<span class="truncate">{t("web.alpha.all_channels")}</span>}>{value => <><ChannelGlyph provider={value()} size={13}/><span class="max-w-[80px] truncate">{value()}</span></>}</Show>
      <ChevronDown size={13} class="shrink-0 opacity-60" aria-hidden="true"/>
    </DropdownMenuTrigger>
    <DropdownMenuContent class="min-w-[180px]">
      <DropdownMenuItem class={channelOption} aria-current={props.value === null ? 'true' : undefined} onSelect={() => props.onChange(null)}><span class="flex-1 truncate">{t("web.alpha.all_channels")}</span></DropdownMenuItem>
      <For each={props.channels}>{channel => <DropdownMenuItem class={channelOption} aria-current={props.value === channel ? 'true' : undefined} onSelect={() => props.onChange(channel)}><ChannelGlyph provider={channel} size={13}/><span class="flex-1 truncate">{channel}</span></DropdownMenuItem>}</For>
    </DropdownMenuContent>
  </DropdownMenu>;
}

/** Los cuatro filtros de Appv2 como chips que pasan a otra línea; solo las colas de trabajo llevan cuenta. */
export function FilterChips(props: { value: InboxFilter; counts: Partial<Record<InboxFilter, number | null>>; onChange: (value: InboxFilter) => void }) {
  const options: { value: InboxFilter; label: string }[] = [
    { value: 'all', label: t("web.alpha.filter_all") },
    { value: 'assistance', label: t("web.alpha.filter_assistance") },
    { value: 'ai_disabled', label: t("web.alpha.filter_ai_disabled") },
    { value: 'ai_blocked', label: t("web.alpha.filter_ai_blocked") },
  ];
  const count = (value: InboxFilter) => props.counts[value] ?? 0;
  return <div role="group" aria-label={t("web.alpha.filters_label")} class="flex flex-wrap items-center gap-1.5">
    <For each={options}>{option => <button type="button" aria-pressed={props.value === option.value} aria-label={count(option.value) > 0 ? t("web.alpha.filter_count", { label: option.label, count: count(option.value) }) : undefined} onClick={() => props.onChange(option.value)} class="inline-flex cursor-pointer items-center rounded-full border border-border bg-surface px-2.5 py-[3px] text-[0.72rem] font-medium whitespace-nowrap text-neutral-700 transition-colors outline-none hover:bg-surface-muted hover:text-neutral-950 focus-visible:ring-2 focus-visible:ring-primary/30 aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-[var(--action-text)] aria-pressed:shadow-sm aria-pressed:hover:bg-primary-dark">
      {option.label}
      <Show when={count(option.value) > 0}><span aria-hidden="true" class="ml-1.5 proportional-nums opacity-85">{count(option.value) > 99 ? '99+' : count(option.value)}</span></Show>
    </button>}</For>
  </div>;
}

export function ConversationRow(props: { conversation: Conversation; active: boolean; showChannel: boolean; onSelect: () => void }) {
  const row = () => props.conversation;
  const channel = () => props.showChannel ? row().channel_name.trim() : '';
  const sub = () => contactSubIdentifier(row());
  const stamp = () => lastMessageStamp(row().last_message_at);
  return <button type="button" aria-current={props.active ? 'true' : undefined} onClick={props.onSelect} class="flex w-full min-w-0 max-w-full cursor-pointer items-start gap-3 overflow-hidden rounded-md border border-transparent bg-transparent px-2.5 py-2 text-left transition-colors outline-none hover:bg-surface-muted focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary aria-[current=true]:border-border-strong aria-[current=true]:bg-surface-raised aria-[current=true]:shadow-sm">
    <ContactAvatar name={contactName(row())} channel={row().channel_name} provider={provider(row())} size="row"/>
    <span class="flex w-full min-w-0 max-w-full flex-1 gap-2 overflow-hidden">
      <span class="block min-w-0 flex-1 overflow-hidden">
        <span class="block min-w-0 truncate text-[0.88rem] font-semibold text-neutral-950">{contactName(row())}</span>
        <Show when={channel() || sub()}><span class="mt-0.5 flex min-w-0 max-w-full items-center gap-1.5 overflow-hidden">
          <Show when={channel()}><span title={channel()} class="max-w-[60%] shrink-0 truncate rounded-sm bg-neutral-500/10 px-1 text-[0.62rem] leading-[1.5] font-medium text-neutral-700">{channel()}</span></Show>
          <Show when={sub()}><span class="block min-w-0 flex-1 truncate text-[0.72rem] text-neutral-500">{sub()}</span></Show>
        </span></Show>
        <span class="mt-0.5 block min-w-0 truncate text-[0.8rem] text-neutral-500">{row().last_message || '—'}</span>
        <ConversationLabels conversation={row()}/>
      </span>
      <span class="flex shrink-0 flex-col items-end gap-1">
        <Show when={stamp()}><span class="shrink-0 text-[0.525rem] text-neutral-500 proportional-nums">{stamp()}</span></Show>
        <Show when={row().unread_count > 0}><span role="img" aria-label={t("web.alpha.unread_count", { count: row().unread_count })} class="inline-flex h-[15px] min-w-[15px] shrink-0 items-center justify-center rounded-full bg-brand-purple px-1 text-[0.5rem] leading-none font-bold text-white proportional-nums">{row().unread_count > 99 ? '99+' : row().unread_count}</span></Show>
      </span>
    </span>
  </button>;
}

/** El tirador entre dos paneles del Inbox: arrastra el ancho del panel, que se recuerda. */
export function InboxSplitter(props: {
  label: string;
  /** De qué lado está el panel: a la derecha el gesto va al revés. */
  side: InboxSide;
  panel: () => HTMLElement | undefined;
  min: number;
  max: number;
  value: number;
  onResize: (px: number) => void;
  onReset: () => void;
  class?: string;
}) {
  const mover = (px: number) => props.onResize(inboxWidth(px, props.min, props.max));
  return <div class={`group/tirador relative z-40 w-0 shrink-0 ${props.class ?? ''}`}>
    <span aria-hidden="true" class="pointer-events-none absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 rounded-full bg-primary opacity-0 transition-opacity duration-150 group-hover/tirador:opacity-70 group-focus-within/tirador:opacity-70"/>
    <div role="separator" tabindex={0} aria-label={props.label} aria-orientation="vertical" aria-valuemin={props.min} aria-valuemax={props.max} aria-valuenow={props.value}
      class="absolute inset-y-0 -left-1.5 w-3 cursor-col-resize touch-none bg-transparent outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-neutral-500"
      onPointerDown={event => {
        event.preventDefault();
        const medido = props.panel()?.getBoundingClientRect().width ?? 0;
        const desde = medido > 0 ? medido : props.value;
        const inicio = event.clientX;
        const seguir = (ev: PointerEvent) => props.onResize(inboxDrag(desde, ev.clientX - inicio, props.side, props.min, props.max));
        const soltar = () => {
          window.removeEventListener('pointermove', seguir);
          window.removeEventListener('pointerup', soltar);
          window.removeEventListener('pointercancel', soltar);
        };
        window.addEventListener('pointermove', seguir);
        window.addEventListener('pointerup', soltar);
        window.addEventListener('pointercancel', soltar);
      }}
      onDblClick={() => props.onReset()}
      onKeyDown={event => {
        if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); mover(event.key === 'Home' ? props.min : props.max); return; }
        const paso = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
        if (!paso) return;
        event.preventDefault();
        mover(props.value + paso * (props.side === 'left' ? 16 : -16));
      }}/>
  </div>;
}

export function SelectConversation() {
  return <div class="grid h-full place-items-center p-6 text-center">
    <div class="grid justify-items-center gap-2 text-neutral-500">
      <InboxIcon size={22} stroke-width={1.5} aria-hidden="true"/>
      <p class="m-0 text-[0.85rem] font-medium text-neutral-700">{t("web.alpha.select_conversation")}</p>
      <p class="m-0 text-label">{t("web.alpha.select_hint")}</p>
    </div>
  </div>;
}

export function ConversationHeader(props: { conversation: Conversation; detailsOpen: boolean; onBack: () => void; onToggleDetails: () => void }) {
  const row = () => props.conversation;
  return <header class="flex h-11 min-h-11 shrink-0 items-center gap-2 border-b border-border px-3 dark:bg-surface">
    <Button size="iconCompact" variant="ghost" class="text-neutral-500 @[46rem]:hidden" aria-label={t("web.alpha.back")} onClick={props.onBack}><ArrowLeft size={18}/></Button>
    <span class="flex min-w-0 flex-1 flex-col">
      <span class="truncate text-[0.9rem] font-semibold text-neutral-950">{contactName(row())}</span>
      <Show when={row().channel_name}><span class="flex min-w-0 items-center gap-1.5 truncate text-[0.72rem] font-medium text-neutral-500"><ChannelGlyph provider={provider(row())} size={12}/><span class="truncate">{row().channel_name}</span></span></Show>
    </span>
    <span class="flex shrink-0 items-center gap-2 text-[0.78rem] font-semibold text-neutral-500" title={t("web.alpha.ai_read_only")}>
      <span class="hidden @[36rem]/detail:inline">{t("web.alpha.ai_assistance")}</span>
      <Toggle checked={row().ai_assistance && !row().contact_ai_blocked} onChange={() => {}} disabled label={`${aiState(row())} · ${t("web.alpha.ai_read_only")}`}/>
    </span>
    <Button size="sm" variant={props.detailsOpen ? 'secondary' : 'ghost'} class="shrink-0 border-border bg-surface px-2 @[32rem]/detail:px-3" aria-label={t("web.alpha.contact_details")} aria-expanded={props.detailsOpen} aria-controls={`alpha-contact-${row().id}`} title={t("web.alpha.contact_details")} onClick={props.onToggleDetails}>
      <IdCard size={16} aria-hidden="true"/><span class="hidden @[32rem]/detail:inline">{t("web.alpha.details")}</span>
    </Button>
  </header>;
}

export function MessageBubble(props: { message: Message; position: 'first' | 'middle' | 'last' | 'single' }) {
  const outbound = () => props.message.direction === 'outbound';
  const deleted = () => !!props.message.deleted_at;
  const starts = () => props.position === 'first' || props.position === 'single';
  const tail = () => outbound() ? 'rounded-br-[6px]' : 'rounded-bl-[6px]';
  const top = () => starts() ? '' : outbound() ? 'rounded-tr-[6px]' : 'rounded-tl-[6px]';
  const ink = () => outbound() ? 'text-inbox-bubble-out-text' : 'text-neutral-950';
  const muted = () => outbound() ? 'text-inbox-bubble-out-muted' : 'text-neutral-500';
  return <div class={`flex min-w-0 flex-col gap-1 ${starts() ? 'mt-3' : 'mt-0.5'} ${outbound() ? 'items-end' : 'items-start'} ${deleted() ? 'opacity-70' : ''}`}>
    <article class={`relative min-w-0 max-w-[85%] rounded-[18px] border border-border/60 px-4 pt-3 pb-2 shadow-sm @[32rem]:max-w-[78%] @[48rem]:max-w-[70%] @[64rem]:max-w-[60%] ${top()} ${tail()} ${outbound() ? 'bg-inbox-bubble-out' : 'bg-inbox-bubble-in'}`}>
      <Show when={props.message.content} fallback={<Show when={!deleted()}><p class={`m-0 text-[0.92rem] leading-[1.42] italic ${muted()}`}>{t("web.alpha.attachment")}</p></Show>}>
        <p class={`m-0 min-w-0 whitespace-pre-wrap text-[0.92rem] leading-[1.42] [overflow-wrap:anywhere] ${deleted() ? `line-through ${muted()}` : ink()}`}>{props.message.content}</p>
      </Show>
      <footer class={`mt-1 flex items-center justify-end gap-1.5 text-[0.72rem] leading-none ${muted()}`}>
        <Show when={deleted()}><span class="italic">{t("web.alpha.deleted")}</span></Show>
        <Show when={outbound() && starts()}><span class="font-bold text-inbox-bubble-out-label">{senderLabel(props.message)}</span></Show>
      </footer>
    </article>
  </div>;
}

export function InboxComposer<Id extends number | string>(props: { draft: InboxDraft; conversation: Id; allowed: boolean; onSend: (conversation: Id, text: string, clientId: string, signal: AbortSignal) => Promise<{ requiresTemplate: boolean; duplicate: boolean }>; onRefresh: () => Promise<void> }) {
  const state = () => props.draft.value();
  async function refresh() {
    const draft = props.draft;
    draft.set(value => ({ ...value, pending: true }));
    try { await props.onRefresh(); if (!draft.signal.aborted) draft.set(value => ({ ...value, uncertain: false, notice: t("inbox-writes.reviewed"), error: false })); }
    catch { if (!draft.signal.aborted) draft.set(value => ({ ...value, notice: t("inbox-writes.refresh_failed"), error: true })); }
    finally { if (!draft.signal.aborted) draft.set(value => ({ ...value, pending: false })); }
  }
  async function send() {
    const draft = props.draft;
    if (state().pending || state().uncertain || !props.allowed || !state().text.trim()) return;
    draft.set(value => ({ ...value, pending: true, notice: '', error: false }));
    try {
      const result = await props.onSend(props.conversation, state().text, crypto.randomUUID(), draft.signal);
      if (draft.signal.aborted) return;
      draft.set(value => ({ ...value, text: result.requiresTemplate ? value.text : '', uncertain: result.requiresTemplate,
        notice: result.requiresTemplate ? t("inbox-writes.template") : result.duplicate ? t("inbox-writes.duplicate") : t("inbox-writes.queued"), error: result.requiresTemplate }));
      if (draft === props.draft) try { await props.onRefresh(); } catch { /* La aceptación se conserva aunque falle la lectura posterior. */ }
    } catch (cause) {
      if (draft.signal.aborted) return;
      const unknown = !(cause instanceof ReplyError) || cause.code === 'uncertain';
      draft.set(value => ({ ...value, uncertain: unknown, error: true,
        notice: unknown ? t("inbox-writes.uncertain") : cause.status === 403 ? t("inbox-writes.denied") : cause.status === 402 ? t("inbox-writes.wallet") : t("inbox-writes.failed") }));
    } finally { if (!draft.signal.aborted) draft.set(value => ({ ...value, pending: false })); }
  }
  return <form class="absolute right-0 bottom-0 left-0 z-10 bg-transparent p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]" onSubmit={event => { event.preventDefault(); void send(); }}>
    <p id="alpha-inbox-send-status" role={state().error ? 'alert' : 'status'} class={`m-0 mb-1.5 text-center text-[0.72rem] ${state().error ? 'text-error-strong' : 'text-neutral-500'}`}>{!props.allowed ? t("inbox-writes.denied") : state().pending ? t("inbox-writes.pending") : state().notice}</p>
    <Show when={state().uncertain}><Button size="sm" variant="secondary" disabled={state().pending} onClick={() => void refresh()}>{t("inbox-writes.review")}</Button></Show>
    <div class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-end gap-2 rounded-2xl border border-border/60 bg-surface/30 p-1.5 shadow-sm backdrop-blur-[4px]">
      <Button size="icon" variant="ghost" disabled aria-label={t("web.alpha.attach")} class="rounded-full border border-border-strong bg-neutral-100 text-neutral-700 dark:bg-surface-raised"><Paperclip size={17}/></Button>
      <Textarea variant="ghost" rows={1} maxLength={4096} value={state().text} onInput={event => { const text = event.currentTarget.value; props.draft.set(value => ({ ...value, text })); }} disabled={!props.allowed || state().pending} aria-label={t("web.alpha.reply_label")} aria-describedby="alpha-inbox-send-status" placeholder={t("web.alpha.reply_placeholder")} class="max-h-32 overflow-y-auto px-1 py-2 text-base leading-6"/>
      <Button size="icon" type="submit" disabled={!props.allowed || state().pending || state().uncertain || !state().text.trim()} aria-label={t("web.alpha.send_reply")} aria-describedby="alpha-inbox-send-status" class="rounded-full"><SendHorizontal size={17}/></Button>
    </div>
  </form>;
}

/** Teléfono, @usuario y correo como en la ficha de Appv2, más la última interacción. */
function contactFields(row: Conversation) {
  const fields: { icon: JSX.Element; label: string; value: string }[] = [];
  const identifier = contactIdentifier(row);
  const kind = normalizeProvider(row.active_provider);
  if (identifier && kind === 'instagram') fields.push({ icon: <ChannelGlyph provider="instagram" size={14}/>, label: t("web.alpha.handle"), value: identifier });
  else if (identifier?.includes('@')) fields.push({ icon: <Mail size={14} aria-hidden="true"/>, label: t("web.alpha.email"), value: identifier });
  else if (identifier) fields.push({ icon: <Phone size={14} aria-hidden="true"/>, label: t("web.alpha.phone"), value: identifier });
  const last = validDate(row.last_message_at);
  if (last) fields.push({ icon: <MessageSquare size={14} aria-hidden="true"/>, label: t("web.alpha.last_interaction_label"), value: t("web.alpha.last_interaction", { date: df({ dateStyle: 'medium', timeStyle: 'short' }).format(last) }) });
  return fields;
}

export function ContactDetails(props: { conversation: Conversation; onClose: () => void; ref?: (el: HTMLElement) => void }) {
  const row = () => props.conversation;
  return <aside ref={props.ref} id={`alpha-contact-${row().id}`} aria-label={t("web.alpha.contact_details")} class="absolute inset-0 z-20 flex h-full w-full flex-col overflow-hidden bg-surface @[40rem]/detail:relative @[40rem]/detail:inset-auto @[40rem]/detail:z-0 @[40rem]/detail:w-[var(--inbox-detail)] @[40rem]/detail:max-w-[calc(100%_-_20rem)] @[40rem]/detail:shrink-0 @[40rem]/detail:border-l @[40rem]/detail:border-border">
    <div class="flex h-11 min-h-11 shrink-0 items-center border-b border-border bg-surface px-4 @[40rem]/detail:hidden">
      <Button size="iconCompact" variant="ghost" class="mr-2 text-neutral-500" aria-label={t("web.alpha.back_to_chat")} onClick={props.onClose}><ArrowLeft size={18}/></Button>
      <h3 class="m-0 text-[0.9rem] font-semibold text-neutral-950">{t("web.alpha.contact_details_title")}</h3>
    </div>
    <section class="flex h-full min-h-0 min-w-0 flex-col gap-3 overflow-y-auto p-4">
      <header class="flex items-start gap-3">
        <ContactAvatar name={contactName(row())} channel={row().channel_name} provider={provider(row())} size="card"/>
        <div class="min-w-0 flex-1">
          <h3 class="m-0 truncate text-[1rem] font-semibold text-neutral-950">{contactName(row())}</h3>
          <Show when={row().channel_name}><span class="text-[0.78rem] text-neutral-500">{row().channel_name}</span></Show>
        </div>
      </header>
      <dl class="m-0 grid gap-1.5 text-[0.82rem]">
        <For each={contactFields(row())}>{field => <div class="flex min-w-0 items-center gap-2 text-neutral-700"><dt class="shrink-0 text-neutral-500">{field.icon}<span class="sr-only">{field.label}</span></dt><dd class="m-0 min-w-0 truncate">{field.value}</dd></div>}</For>
      </dl>
      <dl class="m-0 grid gap-1.5 text-[0.82rem]">
        <div class="flex items-center justify-between gap-2"><dt class="text-neutral-500">{t("web.alpha.channel")}</dt><dd class="m-0 flex min-w-0 items-center gap-1.5 truncate text-neutral-700"><ChannelGlyph provider={provider(row())} size={12}/><span class="truncate">{row().channel_name || '—'}</span></dd></div>
        <div class="flex items-center justify-between gap-2"><dt class="text-neutral-500">{t("web.alpha.ai_assistance")}</dt><dd class="m-0 truncate text-neutral-700">{aiShort(row())}</dd></div>
        <Show when={row().contact_blocked}><div class="flex items-center justify-between gap-2"><dt class="text-neutral-500">{t("web.alpha.contact_status")}</dt><dd class="m-0 truncate text-error-strong">{t("web.alpha.contact_blocked")}</dd></div></Show>
      </dl>
      <ConversationLabels conversation={row()}/>
      <div class="my-1 border-t border-border/60"/>
      <div class="flex flex-col gap-1.5">
        <span class="text-[0.72rem] font-semibold tracking-wider text-neutral-500 uppercase">{t("web.alpha.tags")}</span>
        <p class="m-0 text-[0.8rem] text-neutral-500">{t("web.alpha.tags_unavailable")}</p>
      </div>
      <div class="my-1 border-t border-border/60"/>
      <div class="flex flex-col gap-1.5">
        <span class="text-[0.72rem] font-semibold tracking-wider text-neutral-500 uppercase">{t("web.alpha.notes")}</span>
        <p class="m-0 text-[0.8rem] text-neutral-500">{t("web.alpha.notes_unavailable")}</p>
      </div>
    </section>
  </aside>;
}
