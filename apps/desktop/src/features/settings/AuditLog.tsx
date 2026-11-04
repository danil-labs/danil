import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { manifiesto, t } from "../../lib/i18n";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Select } from "../../ui/Select";
import { Skeleton } from "../../ui/Skeleton";
import type { AuditActorType, AuditEntry, AuditLogSource } from "../../web/audit-log";
import { SettingsPanel, SettingsSection } from "./layout";

const FILTERS: AuditActorType[] = ["ai", "user", "member", "danil_support", "system"];
const TONE: Record<AuditActorType, "info" | "active" | "neutral" | "warning"> = { ai: "info", user: "active", member: "neutral", danil_support: "warning", system: "neutral" };

/** Qué tocó el cambio. Cada tipo sale en el filtro cuando la bitácora ya trae eventos suyos. */
type EventKind = "machines" | "tasks" | "mcp" | "credentials" | "sessions" | "support" | "workspace";
const EVENT_KINDS: EventKind[] = ["machines", "tasks", "mcp", "credentials", "sessions", "support", "workspace"];
const PREFIX: [string, EventKind][] = [["machine.", "machines"], ["task.", "tasks"], ["mcp.", "mcp"], ["credential.", "credentials"], ["session.", "sessions"], ["support_access.", "support"]];
const kindOf = (e: AuditEntry): EventKind => PREFIX.find(([prefix]) => e.event_type.startsWith(prefix))?.[1] ?? "workspace";

type State = "loading" | "ready" | "no_account" | "forbidden" | "unavailable";

export default function AuditLog(props: { source: AuditLogSource }) {
  const [entries, setEntries] = createSignal<AuditEntry[]>([]);
  const [state, setState] = createSignal<State>("loading");
  const [more, setMore] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [filter, setFilter] = createSignal<AuditActorType | null>(null);
  const [eventKind, setEventKind] = createSignal<EventKind | null>(null);
  const [moreFailed, setMoreFailed] = createSignal(false);
  let generation = 0;

  const load = async (append: boolean) => {
    if (busy()) return;
    const key = ++generation;
    setBusy(true);
    setMoreFailed(false);
    if (!append) setState("loading");
    const before = append ? entries().at(-1)?.id ?? null : null;
    const page = await props.source.list(before);
    if (key !== generation) return;
    setBusy(false);
    if (page.kind !== "ok") {
      if (append) setMoreFailed(true);
      else setState(page.kind);
      return;
    }
    const known = new Set(append ? entries().map((e) => e.id) : []);
    setEntries([...(append ? entries() : []), ...page.entries.filter((e) => !known.has(e.id))]);
    setMore(page.more);
    setState("ready");
  };
  onMount(() => void load(false));
  onCleanup(() => { generation++; });

  const shown = createMemo(() => entries().filter((e) => (!filter() || e.actor_type === filter()) && (!eventKind() || kindOf(e) === eventKind())));
  const present = createMemo(() => EVENT_KINDS.filter((kind) => entries().some((e) => kindOf(e) === kind)));
  const when = (at: string) => new Intl.DateTimeFormat(manifiesto().formato, { dateStyle: "medium", timeStyle: "short" }).format(new Date(at));
  const person = (name: string | null, email: string | null) => (name && email ? `${name} (${email})` : name ?? email ?? "");
  const what = (e: AuditEntry) =>
    e.event_type.startsWith("support_access.")
      ? t(`audit.support.${e.event_type.slice("support_access.".length)}`)
      : kindOf(e) !== "workspace"
        ? t(`audit.event.${e.event_type.replace(".", "_")}`)
      : t("audit.change", { entity: t(`audit.entity.${e.entity_type ?? "other"}`), action: t(`audit.action.${e.action ?? "update"}`) });
  const who = (e: AuditEntry) => {
    if (e.actor_type === "ai") return e.on_behalf_of_name || e.on_behalf_of_email ? t("audit.on_behalf", { person: person(e.on_behalf_of_name, e.on_behalf_of_email) }) : null;
    if (e.actor_type === "system" || e.actor_type === "user") return null;
    const by = person(e.actor_name, e.actor_email);
    return by ? t("audit.by", { person: by }) : null;
  };

  return (
    <SettingsPanel data-audit-log>
      <SettingsSection
        title={t("audit.title")}
        description={t("audit.description")}
        aside={<Button size="compact" variant="ghost" disabled={busy()} onClick={() => void load(false)}>{t("audit.refresh")}</Button>}
      >
        <div class="my-3 flex flex-wrap gap-1.5" role="group" aria-label={t("audit.filter")}>
          <Button size="compact" variant={filter() === null ? "secondary" : "ghost"} aria-pressed={filter() === null} onClick={() => setFilter(null)}>{t("audit.actor.all")}</Button>
          <For each={FILTERS}>
            {(kind) => <Button size="compact" variant={filter() === kind ? "secondary" : "ghost"} aria-pressed={filter() === kind} onClick={() => setFilter(kind)}>{t(`audit.actor.${kind}`)}</Button>}
          </For>
          <Show when={present().length > 1}>
            <Select class="ml-auto w-40" aria-label={t("audit.kind_filter")} value={eventKind() ?? ""} onChange={(event) => setEventKind((event.currentTarget.value || null) as EventKind | null)}>
              <option value="">{t("audit.kind_all")}</option>
              <For each={present()}>{(kind) => <option value={kind}>{t(`audit.kind.${kind}`)}</option>}</For>
            </Select>
          </Show>
        </div>
        <Show when={state() === "loading"}><Skeleton filas={4} /></Show>
        <Show when={state() === "no_account"}><p role="status" class="py-5 text-sm text-neutral-500">{t("audit.no_account")}</p></Show>
        <Show when={state() === "forbidden"}><p role="status" class="py-5 text-sm text-neutral-500">{t("audit.forbidden")}</p></Show>
        <Show when={state() === "unavailable"}><p role="alert" class="py-5 text-sm text-error-strong">{t("audit.unavailable")}</p></Show>
        <Show when={state() === "ready"}>
          <Show when={shown().length} fallback={<p class="py-5 text-sm text-neutral-500">{filter() || eventKind() ? t("audit.empty_filter") : t("audit.empty")}</p>}>
            <ul class="m-0 list-none p-0">
              <For each={shown()}>
                {(e) => (
                  <li class="grid min-w-0 gap-1 border-b border-border px-1 py-3" data-audit-entry={e.id}>
                    <div class="flex min-w-0 flex-wrap items-center gap-2">
                      <Badge tone={TONE[e.actor_type]}>{t(`audit.actor.${e.actor_type}`)}</Badge>
                      <span class="min-w-0 break-words text-sm font-medium">{what(e)}</span>
                      <span class="ml-auto shrink-0 text-xs text-neutral-500">{when(e.created_at)}</span>
                    </div>
                    <Show when={who(e)}>{(line) => <p class="m-0 break-words text-xs text-neutral-500">{line()}</p>}</Show>
                    <Show when={e.changed_fields.length}>
                      <div class="flex flex-wrap gap-1" aria-label={t("audit.fields")}>
                        <For each={e.changed_fields}>{(field) => <Badge forma="dato">{field}</Badge>}</For>
                      </div>
                    </Show>
                  </li>
                )}
              </For>
            </ul>
          </Show>
          <Show when={(filter() || eventKind()) && more()}><p class="m-0 pt-2 text-xs text-neutral-500">{t("audit.filter_partial")}</p></Show>
          <Show when={moreFailed()}><p role="alert" class="m-0 pt-2 text-xs text-error-strong">{t("audit.unavailable")}</p></Show>
          <Show when={more()}>
            <Button class="mt-3 justify-self-start" size="compact" variant="ghost" disabled={busy()} onClick={() => void load(true)}>{t("audit.more")}</Button>
          </Show>
        </Show>
      </SettingsSection>
    </SettingsPanel>
  );
}
