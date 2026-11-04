/**
 * Consumo y actividad del Harness desde Danil Machines (`/v1/org/*`).
 * En el escritorio la lectura la hace la ventana con la sesión de persona; en
 * la web `/admin`, la página con su sesión de Supabase. Un dato que el servidor
 * no manda se queda como «sin dato», nunca como cero.
 */
import { createResource, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { listen } from "../../lib/serviceEvents";
import { df } from "../../lib/format";
import { manifiesto, t } from "../../lib/i18n";
import { asFailure, FailureNote } from "../../ui/Failure";
import { desktopHarnessOrg, type HarnessOrgSource } from "./harness-org";
import {
  type Activity,
  type ActivityFilter,
  actionOf,
  type AdminUsage,
  aggregateTools,
  clientOf,
  filterActivity,
  type HarnessIdentity,
  type HarnessMembers,
  isForbidden,
  personName,
  tokens,
} from "./harness-insights";

type Period = "7d" | "30d" | "month";

const PERIODS: { id: Period; label: () => string }[] = [
  { id: "7d", label: () => t("harness.insights.period_7d") },
  { id: "30d", label: () => t("harness.insights.period_30d") },
  { id: "month", label: () => t("harness.insights.period_month") },
];

const FILTERS: { id: ActivityFilter; label: () => string }[] = [
  { id: "all", label: () => t("harness.insights.filter_all") },
  { id: "mcp", label: () => t("harness.insights.filter_mcp") },
  { id: "denied", label: () => t("harness.insights.filter_denied") },
];

const number = (value: number) => new Intl.NumberFormat(manifiesto().formato).format(value);
const compact = (value: number) => new Intl.NumberFormat(manifiesto().formato, { notation: "compact", maximumFractionDigits: 1 }).format(value);
const money = (value: number) => new Intl.NumberFormat(manifiesto().formato, { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
const at = (value: string) => df({ dateStyle: "short", timeStyle: "short" }).format(new Date(value));

const currentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

const rangeQuery = (period: Period) => (period === "month" ? `month=${currentMonth()}` : `days=${period === "7d" ? 7 : 30}`);

function Tile(props: { label: string; value: string; note?: string }) {
  return (
    <div class="grid min-w-0 content-start gap-1 rounded-lg border border-border p-3">
      <span class="text-xs text-neutral-500">{props.label}</span>
      <strong class="text-xl font-semibold tabular-nums">{props.value}</strong>
      <Show when={props.note}><span class="text-xs leading-[17px] text-neutral-500">{props.note}</span></Show>
    </div>
  );
}

function PeriodPicker(props: { value: Period; onChange: (value: Period) => void }) {
  return (
    <div role="radiogroup" aria-label={t("harness.insights.period")} class="inline-flex w-fit gap-0.5 rounded-md border border-border bg-surface p-0.5">
      <For each={PERIODS}>
        {(row) => (
          <button
            type="button"
            role="radio"
            aria-checked={props.value === row.id}
            class={props.value === row.id
              ? "rounded px-2.5 py-1 text-xs font-semibold text-neutral-950"
              : "rounded px-2.5 py-1 text-xs text-neutral-500 hover:text-neutral-950"}
            onClick={() => props.onChange(row.id)}
          >
            {row.label()}
          </button>
        )}
      </For>
    </div>
  );
}

function UsageTable(props: { usage: AdminUsage }) {
  return (
    <div class="grid gap-4">
      <div class="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2.5">
        <Tile
          label={t("harness.insights.cost")}
          value={props.usage.totals.cost_usd === null ? t("harness.insights.no_cost") : money(props.usage.totals.cost_usd)}
          note={t("harness.insights.without_cost", { count: number(props.usage.totals.turns_without_cost) })}
        />
        <Tile label={t("harness.insights.tokens")} value={compact(tokens(props.usage.totals.tokens))} />
        <Tile label={t("harness.insights.turns")} value={number(props.usage.totals.turns)} />
        <Tile label={t("harness.insights.workspaces")} value={number(props.usage.workspaces?.length ?? 0)} />
      </div>

      <Show when={props.usage.truncated}>
        <p class="m-0 text-xs text-neutral-500">{t("harness.insights.truncated")}</p>
      </Show>

      <Show when={props.usage.models.length > 0} fallback={<p class="m-0 text-sm text-neutral-500">{t("harness.insights.empty_usage")}</p>}>
        <div class="grid gap-1">
          <span class="text-sm font-semibold text-neutral-950">{t("harness.insights.models")}</span>
          <For each={props.usage.models}>
            {(row) => (
              <div class="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span class="text-neutral-700">{row.model ? `${row.agent} · ${row.model}` : row.agent}</span>
                <span class="tabular-nums text-neutral-950">{compact(tokens(row.tokens))} · {number(row.turns)} {t("harness.insights.turns_short")}</span>
              </div>
            )}
          </For>
        </div>
      </Show>

      <Show when={props.usage.people.length > 0}>
        <div class="grid gap-1">
          <span class="text-sm font-semibold text-neutral-950">{t("harness.insights.people")}</span>
          <div class="overflow-x-auto">
            <table class="w-full min-w-[520px] text-sm">
              <thead>
                <tr class="text-left text-xs text-neutral-500">
                  <th class="py-1 pr-2 font-medium">{t("harness.insights.person")}</th>
                  <th class="py-1 pr-2 text-right font-medium">{t("harness.insights.turns")}</th>
                  <th class="py-1 pr-2 text-right font-medium">{t("harness.insights.tokens")}</th>
                  <th class="py-1 text-right font-medium">{t("harness.insights.cost")}</th>
                </tr>
              </thead>
              <tbody>
                <For each={props.usage.people}>
                  {(row) => (
                    <tr class="border-t border-border">
                      <td class="py-1.5 pr-2 text-neutral-950">{personName(row)}</td>
                      <td class="py-1.5 pr-2 text-right tabular-nums">{number(row.totals.turns)}</td>
                      <td class="py-1.5 pr-2 text-right tabular-nums">{compact(tokens(row.totals.tokens))}</td>
                      <td class="py-1.5 text-right tabular-nums">{row.totals.cost_usd === null ? t("harness.insights.no_cost") : money(row.totals.cost_usd)}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </div>
      </Show>

      <Show when={aggregateTools(props.usage.tools ?? []).length > 0}>
        <div class="grid gap-1">
          <span class="text-sm font-semibold text-neutral-950">{t("harness.insights.tools")}</span>
          <For each={aggregateTools(props.usage.tools ?? [])}>
            {(row) => (
              <div class="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span class="font-mono text-xs text-neutral-700">{row.name}</span>
                <span class="tabular-nums text-neutral-950">{number(row.calls)} {t("harness.insights.calls")} · {number(row.failed + row.unknown)} {t("harness.insights.errors")}</span>
              </div>
            )}
          </For>
        </div>
      </Show>

      <Show when={props.usage.machines?.length}>
        <div class="grid gap-1">
          <span class="text-sm font-semibold text-neutral-950">{t("harness.insights.machines")}</span>
          <For each={props.usage.machines}>
            {(row) => (
              <div class="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span class="text-neutral-700">{row.name || row.id}</span>
                <span class="text-xs text-neutral-500">{t(`harness.insights.origin_${row.origin}`)} · {number(row.turns)} {t("harness.insights.turns_short")}</span>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

function ActivityTable(props: { activity: Activity; filter: ActivityFilter }) {
  const events = () => filterActivity(props.activity.events ?? [], props.filter).slice(0, 200);
  return (
    <Show when={events().length > 0} fallback={<p class="m-0 text-sm text-neutral-500">{t("harness.insights.empty_activity")}</p>}>
      <div class="overflow-x-auto">
        <table class="w-full min-w-[720px] text-sm">
          <thead>
            <tr class="text-left text-xs text-neutral-500">
              <th class="py-1 pr-2 font-medium">{t("harness.insights.time")}</th>
              <th class="py-1 pr-2 font-medium">{t("harness.insights.actor")}</th>
              <th class="py-1 pr-2 font-medium">{t("harness.insights.workspace")}</th>
              <th class="py-1 pr-2 font-medium">{t("harness.insights.action")}</th>
              <th class="py-1 pr-2 font-medium">{t("harness.insights.client")}</th>
              <th class="py-1 font-medium">{t("harness.insights.decision")}</th>
            </tr>
          </thead>
          <tbody>
            <For each={events()}>
              {(event) => (
                <tr class="border-t border-border">
                  <td class="py-1.5 pr-2 font-mono text-xs text-neutral-500">{at(event.at)}</td>
                  <td class="py-1.5 pr-2 text-neutral-700">{event.actor || "—"}</td>
                  <td class="py-1.5 pr-2 text-neutral-500">{event.workspace || "—"}</td>
                  <td class="py-1.5 pr-2"><span class="font-mono text-xs text-neutral-950">{actionOf(event)}</span></td>
                  <td class="py-1.5 pr-2 font-mono text-xs text-neutral-500">{clientOf(event) || "—"}</td>
                  <td class={event.result === "ok" ? "py-1.5 text-xs text-success-strong" : event.result === "denied" ? "py-1.5 text-xs text-error-strong" : "py-1.5 text-xs text-warning-strong"}>
                    {t(`harness.insights.result_${event.result}`)}
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </Show>
  );
}

function MembersTable(props: { members: HarnessMembers }) {
  return (
    <div class="grid gap-2">
      <div class="overflow-x-auto">
        <table class="w-full min-w-[560px] text-sm">
          <thead>
            <tr class="text-left text-xs text-neutral-500">
              <th class="py-1 pr-2 font-medium">{t("harness.insights.person")}</th>
              <th class="py-1 pr-2 font-medium">{t("harness.insights.member_roles")}</th>
              <th class="py-1 pr-2 font-medium">{t("harness.insights.status")}</th>
              <th class="py-1 font-medium">{t("harness.insights.last_activity")}</th>
            </tr>
          </thead>
          <tbody>
            <For each={props.members.members} fallback={<tr><td colSpan={4} class="py-2 text-neutral-500">{t("harness.insights.no_members")}</td></tr>}>
              {(row) => (
                <tr class="border-t border-border">
                  <td class="py-1.5 pr-2 text-neutral-950">{row.name || row.email || row.user_id}</td>
                  <td class="py-1.5 pr-2 text-xs text-neutral-500">{row.role || "—"}</td>
                  <td class="py-1.5 pr-2 text-xs text-neutral-500">{t(`harness.insights.member_${row.status}`)}</td>
                  <td class="py-1.5 text-xs text-neutral-500">{row.last_activity_at ? at(row.last_activity_at) : "—"}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
      <Show when={props.members.invitations.length > 0}>
        <div class="grid gap-1">
          <span class="text-sm font-semibold text-neutral-950">{t("harness.insights.invitations")}</span>
          <For each={props.members.invitations}>
            {(row) => (
              <div class="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span class="text-neutral-700">{row.email}</span>
                <span class="text-xs text-neutral-500">{row.state || t("harness.insights.invitation_pending")}{row.role ? ` · ${row.role}` : ""}</span>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

export default function HarnessInsights(props: { source?: HarnessOrgSource }) {
  const source = props.source ?? desktopHarnessOrg();
  const [tick, setTick] = createSignal(0);
  const [period, setPeriod] = createSignal<Period>("30d");
  const [filter, setFilter] = createSignal<ActivityFilter>("all");
  const reload = () => setTick((value) => value + 1);
  onMount(() => {
    const changed = () => reload();
    window.addEventListener("harness:workspace", changed);
    const events = listen("radiant", changed).catch(() => () => {});
    onCleanup(() => {
      window.removeEventListener("harness:workspace", changed);
      void events.then((stop) => stop());
    });
  });

  const [identity] = createResource(() => tick(), () => source.get<HarnessIdentity>("/v1/org/me"));
  const admin = () => identity()?.admin === true;
  const [usage] = createResource(
    () => (identity() ? { tick: tick(), period: period() } : null),
    (value) => source.get<AdminUsage>("/v1/org/usage", rangeQuery(value.period)),
  );
  const [activity] = createResource(
    () => (identity() ? { tick: tick(), period: period() } : null),
    (value) => source.get<Activity>("/v1/org/activity", `${rangeQuery(value.period)}&limit=200`),
  );
  const [members] = createResource(
    () => (identity() && admin() ? tick() : null),
    () => source.get<HarnessMembers>("/v1/org/members"),
  );

  const failure = (error: unknown) => (
    <Show when={isForbidden(error)} fallback={<FailureNote f={asFailure(error)} />}>
      <p role="status" class="m-0 text-sm text-warning-strong">{t("harness.insights.forbidden")}</p>
    </Show>
  );

  return (
    <div class="grid gap-3 rounded-lg border border-border bg-surface-raised p-4" data-harness-insights="">
      <header class="grid gap-1">
        <h3 class="m-0 text-sm font-semibold text-neutral-950">{t("harness.insights.title")}</h3>
        <p class="m-0 text-xs text-neutral-500">{t("harness.insights.description")}</p>
      </header>

      <Show when={identity.error}>{(error) => failure(error())}</Show>

      <Show when={identity()}>
        {(who) => (
          <div class="grid gap-1 text-sm">
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <span class="text-neutral-500">{t("harness.insights.identity")}</span>
              <span class="text-neutral-950">{who().organization?.name || t("harness.insights.no_org")}</span>
            </div>
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <span class="text-neutral-500">{t("harness.insights.roles")}</span>
              <span class="text-right text-neutral-950">{who().role || "—"}</span>
            </div>
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <span class="text-neutral-500">{t("harness.insights.access")}</span>
              <span class={who().admin ? "text-neutral-950" : "text-warning-strong"}>{who().admin ? t("harness.insights.admin") : t("harness.insights.member")}</span>
            </div>
          </div>
        )}
      </Show>

      <section class="grid gap-2 border-0 border-t border-solid border-border pt-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h4 class="m-0 text-sm font-semibold text-neutral-950">{t("harness.insights.usage")}</h4>
          <PeriodPicker value={period()} onChange={setPeriod} />
        </div>
        <Show when={usage.error}>{(error) => failure(error())}</Show>
        <Show when={usage()} fallback={<p class="m-0 text-sm text-neutral-500">{t("harness.insights.loading")}</p>}>
          {(data) => <UsageTable usage={data()} />}
        </Show>
      </section>

      <section class="grid gap-2 border-0 border-t border-solid border-border pt-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h4 class="m-0 text-sm font-semibold text-neutral-950">{t("harness.insights.activity")}</h4>
          <div role="radiogroup" aria-label={t("harness.insights.filter")} class="inline-flex w-fit gap-0.5 rounded-md border border-border bg-surface p-0.5">
            <For each={FILTERS}>
              {(row) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={filter() === row.id}
                  class={filter() === row.id
                    ? "rounded px-2.5 py-1 text-xs font-semibold text-neutral-950"
                    : "rounded px-2.5 py-1 text-xs text-neutral-500 hover:text-neutral-950"}
                  onClick={() => setFilter(row.id)}
                >
                  {row.label()}
                </button>
              )}
            </For>
          </div>
        </div>
        <Show when={activity.error}>{(error) => failure(error())}</Show>
        <Show when={activity()}>{(data) => <ActivityTable activity={data()} filter={filter()} />}</Show>
      </section>

      <Show when={members.error}>{(error) => failure(error())}</Show>
      <Show when={members()}>
        {(data) => (
          <section class="grid gap-2 border-0 border-t border-solid border-border pt-3">
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <h4 class="m-0 text-sm font-semibold text-neutral-950">{t("harness.insights.members")}</h4>
              <span class="text-xs text-neutral-500">{t("harness.insights.members_admin_only")}</span>
            </div>
            <MembersTable members={data()} />
          </section>
        )}
      </Show>

      <p class="m-0 border-0 border-t border-solid border-border pt-3 text-xs text-neutral-500">{t("harness.insights.governance_unavailable")}</p>
    </div>
  );
}
