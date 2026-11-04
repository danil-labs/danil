/**
 * El uso propio (`/v1/usage/me`): totales, serie diaria con ceros medidos,
 * modelos, máquinas y plan. Un dato que el servidor no manda se queda como
 * «sin dato», nunca como cero.
 */
import { createMemo, createResource, createSignal, For, Show } from "solid-js";
import { df, nf } from "../../lib/format";
import { manifiesto, t } from "../../lib/i18n";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { EmptyState } from "../../ui/EmptyState";
import { asFailure, claveDe, prosaDe } from "../../ui/Failure";
import { ProgressBar } from "../../ui/ProgressBar";
import { Skeleton } from "../../ui/Skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "../../ui/Table";
import { SettingsPanel, SettingsSection } from "./layout";
import {
  costCoverage,
  isEmptyUsage,
  originKind,
  peakOf,
  planKind,
  tokensTotal,
  type UsageDay,
  type UsageDays,
  type UsageMe,
  type UsageMeSource,
  type UsagePlan,
} from "./usage-me";

const PERIODS: { id: UsageDays; label: () => string }[] = [
  { id: 7, label: () => t("settings.usage.period_7d") },
  { id: 30, label: () => t("settings.usage.period_30d") },
  { id: 90, label: () => t("settings.usage.period_90d") },
];

const number = (value: number) => nf().format(value);
const compact = (value: number) =>
  new Intl.NumberFormat(manifiesto().formato, { notation: "compact", maximumFractionDigits: 1 }).format(value);
const money = (value: number) =>
  new Intl.NumberFormat(manifiesto().formato, { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
const dayLabel = (date: string) => df({ day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(date));

function Tile(props: { label: string; value: string; note?: string }) {
  return (
    <div class="grid min-w-0 content-start gap-1 rounded-lg border border-border p-3" data-usage-tile="">
      <span class="text-xs text-neutral-500">{props.label}</span>
      <strong class="text-xl font-semibold tabular-nums">{props.value}</strong>
      <Show when={props.note}><span class="text-xs leading-[17px] text-neutral-500">{props.note}</span></Show>
    </div>
  );
}

function PeriodPicker(props: { value: UsageDays; onChange: (value: UsageDays) => void }) {
  return (
    <div role="radiogroup" aria-label={t("settings.usage.period")} class="inline-flex w-fit gap-0.5 rounded-md border border-border bg-surface p-0.5">
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

function Daily(props: { days: UsageDay[] }) {
  const peak = createMemo(() => peakOf(props.days));
  return (
    <div class="grid gap-2 pt-3" data-usage-daily="">
      <div
        class="flex h-28 items-end gap-px"
        role="img"
        aria-label={peak().tokens > 0
          ? t("settings.usage.daily_peak", { day: dayLabel(peak().date), tokens: compact(peak().tokens) })
          : t("settings.usage.daily_zero")}
      >
        <For each={props.days}>
          {(row) => {
            const tokens = tokensTotal(row.tokens);
            const isPeak = peak().tokens > 0 && row.date === peak().date;
            return (
              <div
                class={isPeak ? "min-w-0 flex-1 rounded-t-sm bg-warning-strong" : tokens === 0 ? "min-w-0 flex-1 rounded-t-sm bg-neutral-200" : "min-w-0 flex-1 rounded-t-sm bg-neutral-400"}
                style={{ height: tokens === 0 ? "2px" : `${Math.max(4, (tokens / peak().tokens) * 100)}%` }}
                title={t("settings.usage.daily_bar", { day: dayLabel(row.date), tokens: compact(tokens) })}
              />
            );
          }}
        </For>
      </div>
      <p class="m-0 text-xs text-neutral-500">
        {peak().tokens > 0
          ? t("settings.usage.daily_peak", { day: dayLabel(peak().date), tokens: compact(peak().tokens) })
          : t("settings.usage.daily_zero")}
      </p>
    </div>
  );
}

function planLabel(plan: UsagePlan): string {
  const kind = planKind(plan);
  if (kind === "personal") return t("settings.usage.plan_personal");
  if (kind === "teams") return t("settings.usage.plan_teams");
  if (kind === "enterprise") return t("settings.usage.plan_enterprise");
  if (kind === "none") return t("settings.usage.plan_none");
  return plan.key ?? t("settings.usage.plan_none");
}

function sourceLabel(source: string): string {
  if (source === "subscription") return t("settings.usage.source_subscription");
  if (source === "manual") return t("settings.usage.source_manual");
  if (source === "grandfathered") return t("settings.usage.source_grandfathered");
  if (source === "none") return t("settings.usage.source_none");
  return t("settings.usage.source_unknown");
}

function originLabel(origin: string): string {
  const kind = originKind(origin);
  if (kind === "local") return t("settings.usage.origin_local");
  if (kind === "vm") return t("settings.usage.origin_vm");
  if (kind === "shared") return t("settings.usage.origin_shared");
  return t("settings.usage.origin_other");
}

function messageOf(error: unknown): string {
  const key = claveDe(error);
  if (key === "settings.usage.no_session") return t("settings.usage.no_session");
  if (key === "settings.usage.forbidden") return t("settings.usage.forbidden");
  if (key === "settings.usage.no_account") return t("settings.usage.no_account");
  if (key === "settings.usage.unavailable") return t("settings.usage.unavailable");
  if (key === "settings.usage.failed") return t("settings.usage.failed");
  return key ? prosaDe(error) : t("settings.usage.failed");
}

function ErrorNote(props: { error: unknown; retry: () => void }) {
  const failure = () => asFailure(props.error);
  return (
    <div class="grid gap-2 py-3">
      <p role="alert" class="m-0 text-sm text-error-strong">{messageOf(props.error)}</p>
      <Show when={failure().detail}>
        <details>
          <summary class="cursor-pointer text-caption text-neutral-500">{t("common.failure.detail")}</summary>
          <p class="m-0 mt-1 font-mono text-caption break-all whitespace-pre-wrap text-neutral-500">{failure().detail}</p>
        </details>
      </Show>
      <div>
        <Button size="sm" variant="secondary" onClick={() => props.retry()}>{t("settings.usage.retry")}</Button>
      </div>
    </div>
  );
}

function PlanRow(props: { plan: UsagePlan }) {
  return (
    <div class="flex flex-wrap items-center gap-2 pt-3 text-ui" data-usage-plan="">
      <span class="text-neutral-500">{t("settings.usage.plan")}</span>
      <Badge forma="dato">{planLabel(props.plan)}</Badge>
      <span class="text-neutral-500">{sourceLabel(props.plan.source)}</span>
      <Badge tone={props.plan.paid ? "success" : "neutral"}>
        {props.plan.paid ? t("settings.usage.plan_paid") : t("settings.usage.plan_free")}
      </Badge>
    </div>
  );
}

function Totals(props: { data: UsageMe }) {
  const coverage = () => costCoverage(props.data.totals);
  const input = () => props.data.totals.tokens.input_uncached + props.data.totals.tokens.cache_read + props.data.totals.tokens.cache_write;
  const output = () => props.data.totals.tokens.output + props.data.totals.tokens.reasoning;
  return (
    <div class="grid gap-3 pt-3">
      <Show when={props.data.truncated}>
        <p role="status" class="m-0 text-sm text-warning-strong">{t("settings.usage.truncated")}</p>
      </Show>
      <div class="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2.5">
        <div class="grid min-w-0 content-start gap-1.5 rounded-lg border border-border p-3" data-usage-cost="">
          <span class="text-xs text-neutral-500">{t("settings.usage.cost")}</span>
          <strong class="text-xl font-semibold tabular-nums">
            {props.data.totals.cost_usd === null ? t("settings.usage.no_cost") : money(props.data.totals.cost_usd)}
          </strong>
          <ProgressBar value={coverage().measured} max={coverage().turns} label={t("settings.usage.coverage_label")} />
          <span class="text-xs leading-[17px] text-neutral-500">
            {t("settings.usage.coverage", { measured: number(coverage().measured), turns: number(coverage().turns) })}
          </span>
          <Show when={coverage().withoutCost > 0}>
            <span class="text-xs leading-[17px] text-warning-strong">
              {t("settings.usage.without_cost", { count: number(coverage().withoutCost) })}
            </span>
          </Show>
        </div>
        <Tile
          label={t("settings.usage.tokens")}
          value={compact(tokensTotal(props.data.totals.tokens))}
          note={t("settings.usage.tokens_breakdown", { input: compact(input()), output: compact(output()) })}
        />
        <Tile label={t("settings.usage.turns")} value={number(props.data.totals.turns)} />
        <Tile label={t("settings.usage.sessions")} value={number(props.data.totals.sessions)} note={t("settings.usage.sessions_scope")} />
      </div>
    </div>
  );
}

export default function UsageView(props: { source: UsageMeSource }) {
  const [period, setPeriod] = createSignal<UsageDays>(30);
  const [report, { refetch }] = createResource(period, (days) => props.source.get(days));
  const shown = () => {
    const data = report();
    return data && !isEmptyUsage(data) ? data : undefined;
  };
  return (
    <SettingsPanel data-usage-me="">
      <SettingsSection
        title={t("settings.usage.title")}
        description={t("settings.usage.estimate")}
        aside={<PeriodPicker value={period()} onChange={setPeriod} />}
      >
        <Show when={!report.loading} fallback={<div class="pt-3"><Skeleton filas={3} /></div>}>
          <Show when={report.error}>
            {(error) => <ErrorNote error={error()} retry={() => void refetch()} />}
          </Show>
          <Show when={report()}>
            {(data) => (
              <Show
                when={!isEmptyUsage(data())}
                fallback={
                  <EmptyState
                    class="mt-3"
                    title={t("settings.usage.empty")}
                    description={t("settings.usage.empty_detail", { days: period() })}
                  />
                }
              >
                <Totals data={data()} />
              </Show>
            )}
          </Show>
          <Show when={report()}>
            {(data) => <PlanRow plan={data().plan} />}
          </Show>
        </Show>
      </SettingsSection>
      <Show when={shown()}>
        {(data) => (
          <>
            <SettingsSection title={t("settings.usage.daily")} description={t("settings.usage.daily_zeros")}>
              <Daily days={data().daily} />
            </SettingsSection>
            <SettingsSection title={t("settings.usage.models")}>
              <Show when={data().models.length > 0} fallback={<p class="m-0 pt-3 text-sm text-neutral-500">{t("settings.usage.no_models")}</p>}>
                <div class="overflow-x-auto pt-2">
                  <Table class="min-w-[560px]">
                    <TableHead>
                      <TableRow>
                        <TableHeaderCell>{t("settings.usage.model")}</TableHeaderCell>
                        <TableHeaderCell class="text-right">{t("settings.usage.turns")}</TableHeaderCell>
                        <TableHeaderCell class="text-right">{t("settings.usage.sessions")}</TableHeaderCell>
                        <TableHeaderCell class="text-right">{t("settings.usage.tokens")}</TableHeaderCell>
                        <TableHeaderCell class="text-right">{t("settings.usage.cost")}</TableHeaderCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      <For each={data().models}>
                        {(row) => (
                          <TableRow>
                            <TableCell>
                              {row.model ? t("settings.usage.agent_model", { agent: row.agent, model: row.model }) : row.agent}
                            </TableCell>
                            <TableCell class="text-right tabular-nums">{number(row.turns)}</TableCell>
                            <TableCell class="text-right tabular-nums">{number(row.sessions)}</TableCell>
                            <TableCell class="text-right tabular-nums">{compact(tokensTotal(row.tokens))}</TableCell>
                            <TableCell class="text-right tabular-nums">
                              {row.cost_usd === null ? t("settings.usage.no_cost") : money(row.cost_usd)}
                            </TableCell>
                          </TableRow>
                        )}
                      </For>
                    </TableBody>
                  </Table>
                </div>
              </Show>
            </SettingsSection>
            <SettingsSection title={t("settings.usage.machines")}>
              <Show when={data().machines.length > 0} fallback={<p class="m-0 pt-3 text-sm text-neutral-500">{t("settings.usage.no_machines")}</p>}>
                <div class="overflow-x-auto pt-2">
                  <Table class="min-w-[640px]">
                    <TableHead>
                      <TableRow>
                        <TableHeaderCell>{t("settings.usage.machine")}</TableHeaderCell>
                        <TableHeaderCell>{t("settings.usage.origin")}</TableHeaderCell>
                        <TableHeaderCell class="text-right">{t("settings.usage.turns")}</TableHeaderCell>
                        <TableHeaderCell class="text-right">{t("settings.usage.sessions")}</TableHeaderCell>
                        <TableHeaderCell class="text-right">{t("settings.usage.tokens")}</TableHeaderCell>
                        <TableHeaderCell class="text-right">{t("settings.usage.cost")}</TableHeaderCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      <For each={data().machines}>
                        {(row) => (
                          <TableRow>
                            <TableCell class="max-w-[18rem]">
                              <span class="block truncate font-mono text-caption" title={row.machine_id}>{row.machine_id}</span>
                            </TableCell>
                            <TableCell class="text-neutral-500">{originLabel(row.origin)}</TableCell>
                            <TableCell class="text-right tabular-nums">{number(row.turns)}</TableCell>
                            <TableCell class="text-right tabular-nums">{number(row.sessions)}</TableCell>
                            <TableCell class="text-right tabular-nums">{compact(tokensTotal(row.tokens))}</TableCell>
                            <TableCell class="text-right tabular-nums">
                              {row.cost_usd === null ? t("settings.usage.no_cost") : money(row.cost_usd)}
                            </TableCell>
                          </TableRow>
                        )}
                      </For>
                    </TableBody>
                  </Table>
                </div>
              </Show>
            </SettingsSection>
          </>
        )}
      </Show>
    </SettingsPanel>
  );
}
