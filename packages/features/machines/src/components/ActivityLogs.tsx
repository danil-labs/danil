import { For, Show, createEffect, createMemo, createSignal, on, onCleanup, onMount } from "solid-js";
import type { Activity, ActivityLog, ActivityRow } from "@terminus/protocol";
import { listActivity, readActivity, readActivityLog } from "../queries/engine-activity";
import { listen } from "../../../../../apps/desktop/src/lib/serviceEvents";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { Button } from "../../../../ui/src/Button";
import { Select } from "../../../../ui/src/Select";
import { machineName, machines, refetchMachines } from "../queries/store";
import { SettingsPanel, SettingsSection } from "../../../../ui/src/SettingsLayout";

export default function ActivityLogs(props: { workspace: string | null; machine?: string | null }) {
  const [chosen, setChosen] = createSignal(props.machine ?? "");
  const eligible = createMemo(() => machines().filter(m => m.hosts !== false));
  const machine = createMemo(() => eligible().find(m => m.id === chosen()) ?? eligible().find(m => m.active) ?? eligible()[0]);
  const scope = createMemo(() => JSON.stringify([props.workspace, machine()?.id ?? "", machine()?.local ?? true]));
  const [rows, setRows] = createSignal<ActivityRow[]>([]);
  const [detail, setDetail] = createSignal<Activity | null>(null);
  const [step, setStep] = createSignal("");
  const [log, setLog] = createSignal<ActivityLog | null>(null);
  const [offsets, setOffsets] = createSignal<number[]>([0]);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal(false);
  let generation = 0;
  let logRequest = 0;
  const online = () => machine()?.on !== false;
  const options = () => ({ headers: { ...(props.workspace ? { "x-terminus-workspace": props.workspace } : {}), ...(machine() && !machine()?.local ? { "x-terminus-machine": machine()!.id } : {}) } });
  const date = (at: number) => new Date(at).toLocaleString();
  const state = (value: string) => t(`activity.state.${value}`);
  const load = async (id?: string) => {
    if (!props.workspace || !online() || busy()) return;
    const key = generation;
    const route = options();
    setBusy(true); setError(false);
    try {
      const answer = await listActivity<ActivityRow[]>({ project: null }, route);
      const record = id ? await readActivity<Activity>({ id }, route) : null;
      if (key !== generation) return;
      setRows(answer.map(row => rows().find(old => old.id === row.id && JSON.stringify(old) === JSON.stringify(row)) ?? row));
      if (record) record.steps = record.steps.map(part => detail()?.steps.find(old => old.id === part.id && JSON.stringify(old) === JSON.stringify(part)) ?? part);
      setDetail(record);
      if (!record?.steps.some(s => s.id === step())) { setStep(""); setLog(null); setOffsets([0]); }
    } catch { if (key === generation) setError(true); }
    finally { if (key === generation) setBusy(false); }
  };
  const read = async (id: string, part: string, history: number[]) => {
    if (!online()) return;
    const key = generation;
    const route = options();
    const request = ++logRequest;
    if (step() !== part || offsets().at(-1) !== history.at(-1)) setLog(null);
    setStep(part); setOffsets(history); setError(false);
    try {
      const page = await readActivityLog<ActivityLog>({ id, step: part, offset: history.at(-1) ?? 0 }, route);
      if (key === generation && request === logRequest && step() === part) setLog(page);
    } catch { if (key === generation && request === logRequest && step() === part) setError(true); }
  };
  createEffect(on(() => props.machine, value => { if (value) setChosen(value); }));
  createEffect(on(scope, () => { generation++; setRows([]); setDetail(null); setStep(""); setLog(null); setBusy(false); void load(); }));
  createEffect(on(online, value => { if (value) void load(detail()?.id); }, { defer: true }));
  onMount(() => {
    void refetchMachines();
    const events = listen<{ workspace: string; machine?: string }>("activity", e => {
      if (e.payload.workspace === props.workspace && (e.payload.machine ?? "") === (machine()?.local ? "" : machine()?.id ?? "")) void load(detail()?.id);
    });
    onCleanup(() => { void events.then(off => off()); });
    const timer = setInterval(() => { if (document.hidden) return; void refetchMachines(); if (rows().some(r => r.state === "running")) { void load(detail()?.id); if (detail() && step()) void read(detail()!.id, step(), offsets()); } }, 5_000);
    onCleanup(() => clearInterval(timer));
  });
  onCleanup(() => { generation++; });
  return <SettingsPanel data-activity-logs>
    <SettingsSection title={t("activity.title")} description={t("activity.description")} aside={<Button size="compact" variant="ghost" disabled={busy() || !online()} onClick={() => void load(detail()?.id)}>{t("activity.refresh")}</Button>}>
      <label class="my-3 flex items-center gap-3 text-sm"><span>{t("activity.machine")}</span><Select aria-label={t("activity.machine")} value={machine()?.id ?? ""} onChange={e => setChosen(e.currentTarget.value)}>
        <Show when={eligible().length} fallback={<option value="">{t("activity.this_machine")}</option>}><For each={eligible()}>{m => <option value={m.id} selected={machine()?.id === m.id}>{machineName(m.id, m.local)}</option>}</For></Show>
      </Select></label>
      <Show when={!online()}><p role="status" class="text-sm text-neutral-500">{t("activity.offline")}</p></Show>
      <Show when={error()}><p role="alert" class="text-sm text-error-strong">{t("activity.unavailable")}</p></Show>
      <Show when={detail()} fallback={<>
        <Show when={online() && !rows().length && !error()}><p class="py-5 text-sm text-neutral-500">{busy() ? t("activity.loading") : t("activity.empty")}</p></Show>
        <ul class="m-0 list-none p-0"><For each={rows()}>{row => <li class="border-b border-border"><button type="button" class="flex w-full items-start justify-between gap-4 px-1 py-3 text-left hover:bg-neutral-100 focus-visible:outline-primary" onClick={() => void load(row.id)} disabled={!online() || busy()}>
          <span class="min-w-0"><span class="block break-words text-sm font-medium">{row.title}</span><span class="text-xs text-neutral-500">{date(row.updated_at)}</span></span><span class="shrink-0 text-xs text-neutral-500">{state(row.state)}</span>
        </button></li>}</For></ul>
      </>}>{record => <div class="grid min-w-0 gap-3 py-2">
        <Button variant="ghost" size="compact" class="justify-self-start" onClick={() => { generation++; setBusy(false); setDetail(null); setStep(""); setLog(null); }}>{t("activity.back")}</Button>
        <h3 class="m-0 break-words text-sm font-semibold">{record().title}</h3><p class="m-0 text-xs text-neutral-500">{state(record().state)} · {date(record().updated_at)}</p>
        <p class="m-0 text-xs text-neutral-500">{t("activity.technical")}</p>
        <For each={record().steps}>{part => <div class="min-w-0 border-t border-border py-3">
          <button type="button" class="flex w-full justify-between gap-3 text-left text-sm font-medium focus-visible:outline-primary" aria-expanded={step() === part.id} onClick={() => step() === part.id ? setStep("") : void read(record().id, part.id, [0])}>
            <span>{date(part.started_at)}</span><span>{state(part.state)}</span>
          </button>
          <Show when={step() === part.id}><div class="mt-3 grid min-w-0 gap-2">
            <pre class="m-0 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-sm bg-neutral-100 p-3 font-mono text-xs">{part.command}</pre>
            <p class="m-0 break-all text-xs text-neutral-500">{part.cwd}</p>
            <Show when={part.exit_code !== null}><p class="m-0 text-xs text-neutral-500">{t("activity.exit", { code: part.exit_code ?? "" })}</p></Show>
            <Show when={part.error}><pre class="m-0 whitespace-pre-wrap break-words text-xs text-error-strong">{part.error}</pre></Show>
            <pre tabIndex={0} aria-label={t("activity.output")} class="m-0 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-sm bg-neutral-100 p-3 font-mono text-xs">{log()?.text || (log() ? t("activity.no_output") : t("activity.loading"))}</pre>
            <div class="flex gap-2"><Button variant="ghost" size="compact" disabled={offsets().length < 2} onClick={() => void read(record().id, part.id, offsets().slice(0,-1))}>{t("activity.previous")}</Button><Button variant="ghost" size="compact" disabled={!log()?.has_more} onClick={() => void read(record().id, part.id, [...offsets(), log()!.next_offset])}>{t("activity.next")}</Button><Button variant="ghost" size="compact" disabled={!online()} onClick={() => void read(record().id, part.id, offsets())}>{t("activity.refresh")}</Button></div>
          </div></Show>
        </div>}</For>
      </div>}</Show>
    </SettingsSection>
  </SettingsPanel>;
}
