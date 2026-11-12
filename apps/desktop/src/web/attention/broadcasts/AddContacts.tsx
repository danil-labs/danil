import { createEffect, createMemo, createSignal, For, on, Show } from 'solid-js';
import X from 'lucide-solid/icons/x';
import { ACTIVITY_WINDOWS, contactsInWindow, summarizeRejections, type ActivityWindow, type Contact, type Rejection } from '../../../../../../packages/attention/src/broadcast-panel.ts';
import { t } from '../../../lib/i18n';
import { Button } from '../../../ui/Button';
import { Select } from '../../../ui/Select';
import { Skeleton } from '../../../ui/Skeleton';
import { Note, errorText, type Context } from './parts';
import { createQuery } from './query';

const WINDOWS = Object.keys(ACTIVITY_WINDOWS) as ActivityWindow[];

/** Los filtros son la selección: al cambiarlos, queda elegido todo lo visible. */
export function AddContacts(props: { context: Context; campaignId: number; canAdd: boolean; onAdded: () => void; onFinished: () => void; onClose: () => void }) {
  const api = props.context.api;
  const contacts = createQuery(() => api.contacts());
  const [tag, setTag] = createSignal<string | null>(null);
  const [activity, setActivity] = createSignal<ActivityWindow>('all');
  const [selected, setSelected] = createSignal<Set<number>>(new Set());
  const [result, setResult] = createSignal('');
  const [rejected, setRejected] = createSignal<Rejection[]>([]);
  const [error, setError] = createSignal('');
  const [busy, setBusy] = createSignal(false);

  const all = () => contacts.data() ?? [];
  const sendable = createMemo(() => all().filter(row => row.sendable));
  const hidden = () => all().length - sendable().length;
  const tags = createMemo(() => [...new Set(sendable().flatMap(row => row.tags))].sort((a, b) => a.localeCompare(b)));
  const visible = createMemo(() => contactsInWindow(sendable(), activity()).filter(row => !tag() || row.tags.includes(tag()!)));
  const allSelected = () => visible().length > 0 && visible().every(row => selected().has(row.id));
  const someSelected = () => visible().some(row => selected().has(row.id));

  createEffect(on(() => [sendable().length > 0, activity(), tag()] as const, ([ready]) => {
    if (ready) setSelected(new Set(visible().map(row => row.id)));
  }));

  function toggle(id: number) {
    const next = new Set(selected());
    if (!next.delete(id)) next.add(id);
    setSelected(next);
  }
  function toggleAll() {
    const next = new Set(selected());
    for (const row of visible()) { if (allSelected()) next.delete(row.id); else next.add(row.id); }
    setSelected(next);
  }
  async function submit() {
    setBusy(true); setError('');
    try {
      const value = await api.addContacts(props.campaignId, [...selected()]);
      setResult(t("broadcasts.added_result", { added: value.added, requested: value.requested }));
      setRejected(value.rejected);
      setSelected(new Set<number>());
      props.onAdded();
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }
  const label = (row: Contact) => row.name || row.email || row.phone || t("broadcasts.contact_fallback", { id: row.id });

  return <div class="grid gap-2 rounded-md border border-border bg-surface-muted p-3">
    <div class="flex items-center justify-between gap-2">
      <strong class="text-body">{t("broadcasts.add_contacts")}</strong>
      <Button size="iconCompact" variant="ghost" type="button" aria-label={t("broadcasts.close")} onClick={props.onClose}><X size={15}/></Button>
    </div>
    <p class="m-0 text-label text-neutral-500">{t("broadcasts.import_elsewhere")}</p>
    <Show when={contacts.error()}><Note tone="danger">{t("broadcasts.contacts_error")} {contacts.error()}</Note></Show>
    <Show when={!contacts.data() && !contacts.error()}><Skeleton class="h-24"/></Show>
    <Show when={contacts.data()}>
      <Show when={sendable().length > 0} fallback={<p class="m-0 text-ui text-neutral-500">{(all().length === 0 ? t("broadcasts.no_contacts") : t("broadcasts.no_sendable"))}</p>}>
        <div class="flex flex-wrap items-center gap-1" role="group" aria-label={t("broadcasts.filter_activity")}>
          <For each={WINDOWS}>{value => <Button type="button" size="sm" variant={activity() === value ? 'primary' : 'secondary'} aria-pressed={activity() === value} onClick={() => setActivity(value)}>{t(`broadcasts.activity_${value}`)}</Button>}</For>
        </div>
        <Show when={tags().length > 0}>
          <div class="flex flex-wrap items-center gap-1.5">
            <Select class="w-auto max-w-56" aria-label={t("broadcasts.filter_tag")} value={tag() ?? ''} onChange={event => setTag(event.currentTarget.value || null)}>
              <option value="">{t("broadcasts.all_tags")}</option>
              <For each={tags()}>{value => <option value={value}>{value}</option>}</For>
            </Select>
          </div>
        </Show>
        <Show when={hidden() > 0}><p class="m-0 px-1 text-label text-neutral-500">{(hidden() === 1 ? t("broadcasts.hidden_no_phone_one", { count: hidden() }) : t("broadcasts.hidden_no_phone_other", { count: hidden() }))}</p></Show>
        <label class={`flex items-center gap-2 px-1 text-ui text-neutral-500 ${visible().length === 0 ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
          <input type="checkbox" checked={allSelected()} ref={element => createEffect(() => { element.indeterminate = !allSelected() && someSelected(); })} disabled={visible().length === 0} onChange={toggleAll}/>
          <span>{t("broadcasts.select_all")} <Show when={visible().length > 0}><span class="tabular-nums">({visible().length})</span></Show></span>
        </label>
        <Show when={visible().length > 0} fallback={<p class="m-0 text-ui text-neutral-500">{t("broadcasts.no_filter_match")}</p>}>
          <ul class="m-0 grid max-h-56 list-none content-start gap-0.5 overflow-auto rounded-md border border-border bg-surface p-0">
            <For each={visible()}>{row => <li><label class="flex cursor-pointer items-center gap-2 px-3 py-2 text-body hover:bg-surface-muted">
              <input type="checkbox" checked={selected().has(row.id)} onChange={() => toggle(row.id)}/>
              <span class="truncate">{label(row)}<Show when={(row.name || row.email) && row.phone}><span class="text-neutral-500"> · {row.phone}</span></Show></span>
            </label></li>}</For>
          </ul>
        </Show>
      </Show>
    </Show>
    <Show when={result()}><p role="status" class="m-0 text-ui text-success-strong">{result()}</p></Show>
    <Show when={rejected().length > 0}>
      <Note tone="warning">
        <strong>{(rejected().length === 1 ? t("broadcasts.rejected_one", { count: rejected().length }) : t("broadcasts.rejected_other", { count: rejected().length }))}</strong>
        <ul class="m-0 grid list-none gap-0.5 p-0"><For each={summarizeRejections(rejected())}>{row => <li class="flex gap-2"><span class="shrink-0 font-mono tabular-nums">{row.count}×</span><span>{t(`broadcasts.reject_${row.reason}`)}</span></li>}</For></ul>
        <span>{t("broadcasts.rejected_hint")}</span>
      </Note>
    </Show>
    <Show when={error()}><p role="alert" class="m-0 text-ui font-medium text-error-strong">{error()}</p></Show>
    <div class="flex justify-end"><Button size="sm" type="button" disabled={selected().size === 0 || busy() || !props.canAdd} onClick={() => void submit()}>{busy() ? t("broadcasts.adding") : t("broadcasts.add_count", { count: selected().size })}</Button></div>
  </div>;
}
