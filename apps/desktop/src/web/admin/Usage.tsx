/** Consumo de IA. El tiempo de agentes y las horas encendida no se suman: miden cosas distintas. */
import { createMemo, createResource, createSignal, For, Show } from "solid-js";
import { SettingsPanel, SettingsSection } from "../../features/settings/layout";
import { manifiesto, t } from "../../lib/i18n";
import { ProgressBar } from "../../ui/ProgressBar";
import { Select } from "../../ui/Select";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "../../ui/Table";

export type UsagePeriod = "7d" | "30d" | "month";
export type UsagePerson = { id: string; name: string };
export type UsagePersonRow = UsagePerson & { tasks: number; turns: number; tokens: number; agentHours: number; machineHours: number | null; costUsd: number | null };
export type UsageReport = {
  /** `null`: el periodo no trae ese dato; un cero sería falso. */
  costUsd: number | null;
  /** Turnos con importe frente al total, y los proveedores sin ese dato. */
  coverage: { reported: number; total: number; missing: string[] };
  tokens: number;
  turns: number;
  tasks: number;
  agentHours: number;
  /** `null`: sin registro de horas de máquina. */
  machineHours: number | null;
  daily: { date: string; tokens: number }[];
  models: { name: string; tokens: number }[];
  people: UsagePersonRow[];
  tools: { name: string; calls: number; errors: number }[];
};
export type UsageSource = {
  people: () => Promise<UsagePerson[]>;
  report: (filter: { period: UsagePeriod; person: string | null }) => Promise<UsageReport>;
};

const number = (value: number) => new Intl.NumberFormat(manifiesto().formato).format(value);
const compact = (value: number) => new Intl.NumberFormat(manifiesto().formato, { notation: "compact", maximumFractionDigits: 1 }).format(value);
const money = (value: number) => new Intl.NumberFormat(manifiesto().formato, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
const hours = (value: number) => t("web.admin.usage_hours", { count: number(Math.round(value)) });
const day = (date: string) => new Intl.DateTimeFormat(manifiesto().formato, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(date));

function Tile(props: { label: string; value: string; note?: string }) {
  return (
    <div class="grid min-w-0 content-start gap-1 rounded-lg border border-border p-3" data-usage-tile="">
      <span class="text-xs text-neutral-500">{props.label}</span>
      <strong class="text-xl font-semibold tabular-nums">{props.value}</strong>
      <Show when={props.note}><span class="text-xs leading-[17px] text-neutral-500">{props.note}</span></Show>
    </div>
  );
}

function Daily(props: { days: UsageReport["daily"] }) {
  const peak = createMemo(() => props.days.reduce((top, row) => (row.tokens > top.tokens ? row : top), props.days[0]));
  const usual = createMemo(() => {
    const rows = props.days.map((row) => row.tokens).sort((a, b) => a - b);
    return rows[Math.floor(rows.length / 2)] ?? 0;
  });
  return (
    <div class="grid gap-2 pt-2" data-usage-daily="">
      <div class="flex h-24 items-end gap-px" role="img" aria-label={t("web.admin.usage_peak", { day: day(peak().date), tokens: compact(peak().tokens) })}>
        <For each={props.days}>
          {(row) => (
            <div
              class={row.date === peak().date ? "min-w-0 flex-1 rounded-t-sm bg-warning-strong" : "min-w-0 flex-1 rounded-t-sm bg-neutral-300"}
              style={{ height: `${Math.max(3, (row.tokens / Math.max(1, peak().tokens)) * 100)}%` }}
              title={`${day(row.date)}: ${compact(row.tokens)}`}
            />
          )}
        </For>
      </div>
      <p class="m-0 text-xs text-neutral-500">
        {t("web.admin.usage_peak", { day: day(peak().date), tokens: compact(peak().tokens) })}
        <Show when={usual() > 0}> · {t("web.admin.usage_usual", { tokens: compact(usual()) })}</Show>
      </p>
    </div>
  );
}

/** `own`: quien ve solo lo suyo, sin filtro de persona ni tabla del equipo. */
export function Usage(props: { source: UsageSource; own: boolean }) {
  const [period, setPeriod] = createSignal<UsagePeriod>("30d");
  const [person, setPerson] = createSignal<string | null>(null);
  const [people] = createResource(() => (props.own ? [] : props.source.people()));
  const [report] = createResource(() => ({ period: period(), person: person() }), (filter) => props.source.report(filter));
  return (
    <SettingsPanel data-admin-usage="">
      <SettingsSection
        title={props.own ? t("web.admin.usage_own") : t("web.admin.usage")}
        aside={
          <div class="flex flex-wrap gap-2">
            <Select class="w-40" aria-label={t("web.admin.usage_period")} value={period()} onChange={(event) => setPeriod(event.currentTarget.value as UsagePeriod)}>
              <option value="7d">{t("web.admin.usage_period_7d")}</option>
              <option value="30d">{t("web.admin.usage_period_30d")}</option>
              <option value="month">{t("web.admin.usage_period_month")}</option>
            </Select>
            <Show when={!props.own}>
              <Select class="w-44" aria-label={t("web.admin.usage_person")} value={person() ?? ""} onChange={(event) => setPerson(event.currentTarget.value || null)}>
                <option value="">{t("web.admin.usage_everyone")}</option>
                <For each={people()}>{(row) => <option value={row.id}>{row.name}</option>}</For>
              </Select>
            </Show>
          </div>
        }
      >
        <Show when={report.error}><p role="alert" class="py-3 text-sm text-error-strong">{t("web.admin.usage_failed")}</p></Show>
        <Show when={report.latest}>
          {(data) => (
            <div class="grid gap-3 pt-3">
              <div class="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2.5">
                <div class="grid min-w-0 content-start gap-1.5 rounded-lg border border-border p-3" data-usage-cost="">
                  <span class="text-xs text-neutral-500">{t("web.admin.usage_cost")}</span>
                  <strong class="text-xl font-semibold tabular-nums">{data().costUsd === null ? t("web.admin.usage_no_cost") : money(data().costUsd!)}</strong>
                  <ProgressBar value={data().coverage.reported} max={data().coverage.total} label={t("web.admin.usage_coverage_label")} />
                  <span class="text-xs leading-[17px] text-neutral-500">
                    {t("web.admin.usage_coverage", { reported: number(data().coverage.reported), total: number(data().coverage.total) })}
                    <Show when={data().coverage.missing.length}> {t("web.admin.usage_coverage_missing", { providers: data().coverage.missing.join(", ") })}</Show>
                  </span>
                </div>
                <Tile label={t("web.admin.usage_tokens")} value={compact(data().tokens)} />
                <Tile label={t("web.admin.usage_turns")} value={number(data().turns)} />
                <Tile label={t("web.admin.usage_tasks")} value={number(data().tasks)} note={t("web.admin.usage_tasks_limit")} />
              </div>
              <Daily days={data().daily} />
            </div>
          )}
        </Show>
      </SettingsSection>
      <Show when={report.latest}>
        {(data) => (
          <>
            <SettingsSection title={t("web.admin.usage_time")} description={t("web.admin.usage_time_hint")}>
              <div class="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-2.5 pt-3">
                <Tile label={t("web.admin.usage_agent_time")} value={hours(data().agentHours)} note={t("web.admin.usage_agent_time_hint")} />
                <Tile label={t("web.admin.usage_machine_time")} value={data().machineHours === null ? t("web.admin.usage_no_machine_time") : hours(data().machineHours!)} note={t("web.admin.usage_machine_time_hint")} />
              </div>
            </SettingsSection>
            <SettingsSection title={t("web.admin.usage_models")}>
              <div class="grid gap-2.5 pt-3">
                <For each={data().models}>
                  {(row) => (
                    <div class="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)_3.5rem] items-center gap-3 text-ui">
                      <span class="truncate text-neutral-500">{row.name}</span>
                      <ProgressBar value={row.tokens} max={Math.max(...data().models.map((m) => m.tokens))} label={row.name} barClass="bg-neutral-500" />
                      <span class="text-right tabular-nums">{compact(row.tokens)}</span>
                    </div>
                  )}
                </For>
              </div>
            </SettingsSection>
            <Show when={!props.own}>
              <SettingsSection title={t("web.admin.usage_by_person")}>
                <div class="overflow-x-auto pt-2">
                  <Table class="min-w-[640px]">
                    <TableHead>
                      <TableRow>
                        <TableHeaderCell>{t("web.admin.usage_person_column")}</TableHeaderCell>
                        <For each={[t("web.admin.usage_tasks"), t("web.admin.usage_turns"), t("web.admin.usage_tokens"), t("web.admin.usage_agent_time"), t("web.admin.usage_machine_time"), t("web.admin.usage_cost")]}>
                          {(name) => <TableHeaderCell class="text-right">{name}</TableHeaderCell>}
                        </For>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      <For each={data().people}>
                        {(row) => (
                          <TableRow>
                            <TableCell>{row.name}</TableCell>
                            <TableCell class="text-right tabular-nums">{number(row.tasks)}</TableCell>
                            <TableCell class="text-right tabular-nums">{number(row.turns)}</TableCell>
                            <TableCell class="text-right tabular-nums">{compact(row.tokens)}</TableCell>
                            <TableCell class="text-right tabular-nums">{hours(row.agentHours)}</TableCell>
                            <TableCell class="text-right tabular-nums">{row.machineHours === null ? "—" : hours(row.machineHours)}</TableCell>
                            <TableCell class="text-right tabular-nums">{row.costUsd === null ? t("web.admin.usage_no_cost") : money(row.costUsd)}</TableCell>
                          </TableRow>
                        )}
                      </For>
                    </TableBody>
                  </Table>
                </div>
              </SettingsSection>
            </Show>
            <SettingsSection title={t("web.admin.usage_tools")}>
              <div class="overflow-x-auto pt-2">
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell>{t("web.admin.usage_tool")}</TableHeaderCell>
                      <TableHeaderCell class="text-right">{t("web.admin.usage_calls")}</TableHeaderCell>
                      <TableHeaderCell class="text-right">{t("web.admin.usage_errors")}</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    <For each={data().tools}>
                      {(row) => (
                        <TableRow>
                          <TableCell>{row.name}</TableCell>
                          <TableCell class="text-right tabular-nums">{number(row.calls)}</TableCell>
                          <TableCell class="text-right tabular-nums">{number(row.errors)}</TableCell>
                        </TableRow>
                      )}
                    </For>
                  </TableBody>
                </Table>
              </div>
            </SettingsSection>
          </>
        )}
      </Show>
    </SettingsPanel>
  );
}
