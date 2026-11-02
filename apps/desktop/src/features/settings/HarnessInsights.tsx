/**
 * Lo que el servidor de la organización reporta del Harness: consumo real de IA
 * y bitácora de actividad, incluidas las llamadas MCP de agentes externos.
 * Nada de esto se inventa: un dato que el servidor no manda queda como «sin
 * dato», y un rol sin permiso lo dice en vez de mostrar una tabla vacía.
 */
import { createResource, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { invoke } from "../../lib/invoke.ts";
import { listen } from "../../lib/serviceEvents";
import { df } from "../../lib/format";
import { manifiesto, sumarFrases, t } from "../../lib/i18n";
import en from "../../locales/en/harness.insights.json";
import es from "../../locales/es/harness.insights.json";
import { asFailure, FailureNote } from "../../ui/Failure";
import {
  type Activity,
  type ActivityFilter,
  actionOf,
  type AdminUsage,
  aggregateTools,
  clientOf,
  filterActivity,
  type GovernancePayload,
  type HarnessIdentity,
  type HarnessMembers,
  isForbidden,
  isUnsupported,
  type OwnUsage,
  personName,
  tokens,
} from "./harness-insights";

sumarFrases("en", en);
sumarFrases("es", es);

type Period = "7d" | "30d" | "month";
type UsageResult = AdminUsage | OwnUsage;

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
const at = (seconds: number) => df({ dateStyle: "short", timeStyle: "short" }).format(new Date(seconds * 1000));

const currentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

const rangeOf = (period: Period) => (period === "month" ? { month: currentMonth() } : { days: period === "7d" ? 7 : 30 });

const isAdminUsage = (value: UsageResult): value is AdminUsage => "people" in value;

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

function UsageTable(props: { usage: UsageResult }) {
  const people = () => (isAdminUsage(props.usage) ? props.usage.people : []);
  const models = () => props.usage.models ?? [];
  const tools = () => aggregateTools(props.usage.tools ?? []);
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

      <Show when={isAdminUsage(props.usage) && props.usage.resources_truncated}>
        <p class="m-0 text-xs text-neutral-500">{t("harness.insights.truncated")}</p>
      </Show>

      <Show when={models().length > 0} fallback={<p class="m-0 text-sm text-neutral-500">{t("harness.insights.empty_usage")}</p>}>
        <div class="grid gap-1">
          <span class="text-sm font-semibold text-neutral-950">{t("harness.insights.models")}</span>
          <For each={models()}>
            {(row) => (
              <div class="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span class="text-neutral-700">{row.model ? `${row.agent} · ${row.model}` : row.agent}</span>
                <span class="tabular-nums text-neutral-950">
                  {compact(tokens(row.tokens))} · {number(row.turns)} {t("harness.insights.turns_short")}
                </span>
              </div>
            )}
          </For>
        </div>
      </Show>

      <Show when={people().length > 0}>
        <div class="grid gap-1">
          <span class="text-sm font-semibold text-neutral-950">{t("harness.insights.people")}</span>
          <div class="overflow-x-auto">
            <table class="w-full min-w-[520px] text-sm">
              <thead>
                <tr class="text-left text-xs text-neutral-500">
                  <th class="py-1 pr-2 font-medium">{t("harness.insights.person")}</th>
                  <th class="py-1 pr-2 font-medium">{t("harness.insights.status")}</th>
                  <th class="py-1 pr-2 text-right font-medium">{t("harness.insights.turns")}</th>
                  <th class="py-1 pr-2 text-right font-medium">{t("harness.insights.tokens")}</th>
                  <th class="py-1 text-right font-medium">{t("harness.insights.cost")}</th>
                </tr>
              </thead>
              <tbody>
                <For each={people()}>
                  {(row) => (
                    <tr class="border-t border-border">
                      <td class="py-1.5 pr-2 text-neutral-950">{personName(row)}</td>
                      <td class="py-1.5 pr-2 text-xs text-neutral-500">{t(`harness.insights.state_${row.status}`)}</td>
                      <td class="py-1.5 pr-2 text-right tabular-nums">{number(row.totals.turns)}</td>
                      <td class="py-1.5 pr-2 text-right tabular-nums">{compact(tokens(row.totals.tokens))}</td>
                      <td class="py-1.5 text-right tabular-nums">
                        {row.totals.cost_usd === null ? t("harness.insights.no_cost") : money(row.totals.cost_usd)}
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </div>
      </Show>

      <Show when={tools().length > 0}>
        <div class="grid gap-1">
          <span class="text-sm font-semibold text-neutral-950">{t("harness.insights.tools")}</span>
          <For each={tools()}>
            {(row) => (
              <div class="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span class="font-mono text-xs text-neutral-700">{row.name}</span>
                <span class="tabular-nums text-neutral-950">
                  {number(row.calls)} {t("harness.insights.calls")} · {number(row.failed + row.unknown)} {t("harness.insights.errors")}
                </span>
              </div>
            )}
          </For>
        </div>
      </Show>

      <Show when={isAdminUsage(props.usage) && props.usage.workspaces?.length > 0}>
        <div class="grid gap-1">
          <span class="text-sm font-semibold text-neutral-950">{t("harness.insights.workspaces")}</span>
          <For each={props.usage.workspaces}>
            {(row) => (
              <div class="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span class="text-neutral-700">{row.name}</span>
                <span class="text-xs text-neutral-500">{t(`harness.insights.reporting_${row.usage_reporting}`)}</span>
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
                  <td class="py-1.5 pr-2">
                    <span class="font-mono text-xs text-neutral-950">{actionOf(event)}</span>
                  </td>
                  <td class="py-1.5 pr-2 font-mono text-xs text-neutral-500">{clientOf(event) || "—"}</td>
                  <td class={event.decision === "allow" ? "py-1.5 text-xs text-success-strong" : "py-1.5 text-xs text-error-strong"}>
                    {event.decision === "allow" ? t("harness.insights.allow") : t("harness.insights.deny")}
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

export default function HarnessInsights() {
  const [tick, setTick] = createSignal(0);
  const [period, setPeriod] = createSignal<Period>("30d");
  const [filter, setFilter] = createSignal<ActivityFilter>("all");
  const reload = () => setTick((value) => value + 1);
  onMount(() => {
    const changed = () => reload();
    window.addEventListener("harness:workspace", changed);
    const events = listen("radiant", changed);
    onCleanup(() => {
      window.removeEventListener("harness:workspace", changed);
      void events.then((stop) => stop());
    });
  });

  const [identity] = createResource(
    () => tick(),
    () => invoke<HarnessIdentity>("harness_admin_identity"),
  );
  const admin = () => identity.latest?.admin === true;

  const [usage] = createResource(
    () => (identity.latest ? { tick: tick(), period: period(), admin: admin() } : null),
    (source): Promise<UsageResult> => {
      const range = rangeOf(source.period);
      return source.admin
        ? invoke<AdminUsage>("harness_admin_usage", range)
        : invoke<OwnUsage>("harness_admin_own_usage", range);
    },
  );

  const [activity] = createResource(
    () => (identity.latest && admin() ? { tick: tick(), period: period() } : null),
    (source) => invoke<Activity>("harness_admin_activity", { ...rangeOf(source.period), limit: 500 }),
  );

  const [governance] = createResource(
    () => (identity.latest ? tick() : null),
    () => invoke<GovernancePayload>("harness_admin_governance"),
  );

  const [members] = createResource(
    () => (identity.latest && admin() ? tick() : null),
    () => invoke<HarnessMembers>("harness_admin_members"),
  );

  return (
    <div class="grid gap-3 rounded-lg border border-border bg-surface-raised p-4" data-harness-insights="">
      <header class="grid gap-1">
        <h3 class="m-0 text-sm font-semibold text-neutral-950">{t("harness.insights.title")}</h3>
        <p class="m-0 text-xs text-neutral-500">{t("harness.insights.description")}</p>
      </header>

      <Show when={identity.error}>
        {(error) => (
          <Show
            when={isForbidden(error())}
            fallback={
              <Show when={isUnsupported(error())} fallback={<FailureNote f={asFailure(error())} />}>
                <p role="status" class="m-0 text-sm text-warning-strong">{t("harness.insights.unsupported")}</p>
              </Show>
            }
          >
            <p role="status" class="m-0 text-sm text-warning-strong">{t("harness.insights.forbidden")}</p>
          </Show>
        )}
      </Show>

      <Show when={identity()}>
        {(who) => (
          <div class="grid gap-1 text-sm">
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <span class="text-neutral-500">{t("harness.insights.identity")}</span>
              <span class="text-neutral-950">{who().organization?.name || t("harness.insights.no_org")}</span>
            </div>
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <span class="text-neutral-500">{t("harness.insights.roles")}</span>
              <span class="text-right text-neutral-950">{who().roles?.join(" · ") || "—"}</span>
            </div>
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <span class="text-neutral-500">{t("harness.insights.access")}</span>
              <span class={who().admin ? "text-neutral-950" : "text-warning-strong"}>
                {who().admin ? t("harness.insights.admin") : t("harness.insights.member")}
              </span>
            </div>
          </div>
        )}
      </Show>

      <Show when={members.error}>
        {(error) => (
          <Show when={isForbidden(error())} fallback={<FailureNote f={asFailure(error())} />}>
            <p role="status" class="m-0 text-sm text-warning-strong">{t("harness.insights.forbidden")}</p>
          </Show>
        )}
      </Show>
      <Show when={members()}>
        {(data) => (
          <section class="grid gap-2 border-0 border-t border-solid border-border pt-3">
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <h4 class="m-0 text-sm font-semibold text-neutral-950">{t("harness.insights.members")}</h4>
              <span class="text-xs text-neutral-500">{t("harness.insights.members_admin_only")}</span>
            </div>
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
                  <For each={data().members} fallback={<tr><td colSpan={4} class="py-2 text-neutral-500">{t("harness.insights.no_members")}</td></tr>}>
                    {(row) => (
                      <tr class="border-t border-border">
                        <td class="py-1.5 pr-2 text-neutral-950">{row.name || row.email || row.user_id}</td>
                        <td class="py-1.5 pr-2 text-xs text-neutral-500">{row.roles.join(" · ") || "—"}</td>
                        <td class="py-1.5 pr-2 text-xs text-neutral-500">{t(`harness.insights.member_${row.status}`)}</td>
                        <td class="py-1.5 text-xs text-neutral-500">{row.last_activity_at ? at(row.last_activity_at) : "—"}</td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
            <Show when={data().invitations.length > 0}>
              <div class="grid gap-1">
                <span class="text-sm font-semibold text-neutral-950">{t("harness.insights.invitations")}</span>
                <For each={data().invitations}>
                  {(row) => (
                    <div class="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                      <span class="text-neutral-700">{row.email}</span>
                      <span class="text-xs text-neutral-500">{row.state || t("harness.insights.invitation_pending")}{row.role ? ` · ${row.role}` : ""}</span>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </section>
        )}
      </Show>

      <Show when={governance()}>
        {(payload) => (
          <Show when={payload().document} fallback={<p class="m-0 border-0 border-t border-solid border-border pt-3 text-sm text-neutral-500">{t("harness.insights.no_governance")}</p>}>
            {(doc) => (
              <section class="grid gap-2 border-0 border-t border-solid border-border pt-3">
                <div class="flex flex-wrap items-baseline justify-between gap-2">
                  <h4 class="m-0 text-sm font-semibold text-neutral-950">{t("harness.insights.shared")}</h4>
                  <span class="font-mono text-xs text-neutral-500">
                    {t("harness.insights.policy_revision", { revision: doc().policy_revision.slice(0, 12) })}
                  </span>
                </div>
                <div class="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span class="text-neutral-500">{t("harness.insights.enforcement")}</span>
                  <span class="text-neutral-950">
                    {doc().enforcement.mode === "managed" ? t("harness.insights.enforcement_managed") : t("harness.insights.enforcement_advisory")}
                    <Show when={doc().enforcement.locked.length > 0}>
                      {" · "}{t("harness.insights.locked", { sections: doc().enforcement.locked.join(", ") })}
                    </Show>
                  </span>
                </div>
                <div class="grid gap-1">
                  <span class="text-sm font-semibold text-neutral-950">{t("harness.insights.sources")}</span>
                  <For each={doc().sources} fallback={<span class="text-sm text-neutral-500">{t("harness.insights.none")}</span>}>
                    {(row) => (
                      <div class="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                        <span class="text-neutral-700">{row.remote.replace(/\.git$/, "").split("/").slice(-2).join("/")}</span>
                        <span class="font-mono text-xs text-neutral-500">{row.commit.slice(0, 8)}</span>
                      </div>
                    )}
                  </For>
                </div>
                <div class="grid gap-1">
                  <span class="text-sm font-semibold text-neutral-950">{t("harness.insights.skills")}</span>
                  <For each={doc().skills} fallback={<span class="text-sm text-neutral-500">{t("harness.insights.none")}</span>}>
                    {(row) => (
                      <div class="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                        <span class="text-neutral-700">{row.id}</span>
                        <span class="font-mono text-xs text-neutral-500">{row.repo}/{row.path} · {row.commit.slice(0, 8)}</span>
                      </div>
                    )}
                  </For>
                </div>
                <div class="grid gap-1">
                  <span class="text-sm font-semibold text-neutral-950">{t("harness.insights.agents")}</span>
                  <For each={doc().agents} fallback={<span class="text-sm text-neutral-500">{t("harness.insights.none")}</span>}>
                    {(row) => (
                      <div class="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                        <span class="text-neutral-700">{row.id}</span>
                        <span class="font-mono text-xs text-neutral-500">{row.repo}/{row.path} · {row.commit.slice(0, 8)}</span>
                      </div>
                    )}
                  </For>
                </div>
                <div class="grid gap-1">
                  <span class="text-sm font-semibold text-neutral-950">{t("harness.insights.mcp_servers")}</span>
                  <For each={doc().mcp_servers} fallback={<span class="text-sm text-neutral-500">{t("harness.insights.none")}</span>}>
                    {(row) => (
                      <div class="grid gap-0.5 text-sm">
                        <div class="flex flex-wrap items-baseline justify-between gap-2">
                          <span class="text-neutral-700">{row.name}</span>
                          <span class="text-xs text-neutral-500">{row.auth}{row.network === "tailnet" ? ` · ${t("harness.insights.tailnet")}` : ""}</span>
                        </div>
                        <span class="truncate font-mono text-xs text-neutral-500">{row.url}</span>
                      </div>
                    )}
                  </For>
                </div>
                <div class="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span class="text-neutral-500">{t("harness.insights.models_allowed")}</span>
                  <span class="text-right text-neutral-950">
                    {doc().models.allowed.map((row) => row.name || `${row.provider}/${row.id}`).join(" · ") || t("harness.insights.none")}
                    <Show when={doc().models.default}>
                      {(row) => <> · {t("harness.insights.default_model", { model: row().name || `${row().provider}/${row().id}` })}</>}
                    </Show>
                  </span>
                </div>
                <div class="grid gap-1">
                  <span class="text-sm font-semibold text-neutral-950">{t("harness.insights.connections")}</span>
                  <For each={doc().connections} fallback={<span class="text-sm text-neutral-500">{t("harness.insights.none")}</span>}>
                    {(row) => (
                      <div class="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                        <span class="text-neutral-700">{row.name}</span>
                        <span class="text-xs text-neutral-500">{t(`harness.insights.connection_${row.status}`)}</span>
                      </div>
                    )}
                  </For>
                </div>
              </section>
            )}
          </Show>
        )}
      </Show>

      <section class="grid gap-2 border-0 border-t border-solid border-border pt-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h4 class="m-0 text-sm font-semibold text-neutral-950">{t("harness.insights.usage")}</h4>
          <PeriodPicker value={period()} onChange={setPeriod} />
        </div>
        <Show when={usage.error}>
          {(error) => (
            <Show
              when={isForbidden(error())}
              fallback={
                <Show when={isUnsupported(error())} fallback={<FailureNote f={asFailure(error())} />}>
                  <p role="status" class="m-0 text-sm text-warning-strong">{t("harness.insights.unsupported")}</p>
                </Show>
              }
            >
              <p role="status" class="m-0 text-sm text-warning-strong">{t("harness.insights.forbidden")}</p>
            </Show>
          )}
        </Show>
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
        <Show when={!admin()}>
          <p class="m-0 text-sm text-neutral-500">{t("harness.insights.activity_admin_only")}</p>
        </Show>
        <Show when={activity.error}>
          {(error) => (
            <Show
              when={isForbidden(error())}
              fallback={
                <Show when={isUnsupported(error())} fallback={<FailureNote f={asFailure(error())} />}>
                  <p role="status" class="m-0 text-sm text-warning-strong">{t("harness.insights.unsupported")}</p>
                </Show>
              }
            >
              <p role="status" class="m-0 text-sm text-warning-strong">{t("harness.insights.forbidden")}</p>
            </Show>
          )}
        </Show>
        <Show when={admin() && activity()}>
          {(data) => <ActivityTable activity={data()} filter={filter()} />}
        </Show>
      </section>
    </div>
  );
}
