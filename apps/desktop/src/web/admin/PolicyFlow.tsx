/** Cambiar una política: ver la vigente, proponer, validar y seguir su revisión. Git es el camino principal; sin repositorio, Danil versiona la política con el mismo flujo. */
import { createResource, createSignal, For, Show } from "solid-js";
import { SettingsPanel, SettingsRow, SettingsSection } from "../../features/settings/layout";
import { t } from "../../lib/i18n";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { ENLACE } from "../../ui/ExternalLink";
import { Textarea } from "../../ui/Textarea";

export type PolicyArea = "rules" | "skills" | "mcp" | "agents";
/** `repository: null`: política interna, versionada en Danil. */
export type PolicyCurrent = { revision: string; repository: { name: string; path: string } | null; content: string };
export type PolicyProposal = { valid: boolean; errors: { path: string; message: string }[]; changed: boolean; added: string[]; modified: string[]; removed: string[]; proposedRevision: string | null };
export type PullState = "checks" | "review" | "approved" | "merged" | "closed";
/** `url: null`: propuesta interna, sin PR que abrir. */
export type PolicyPull = { id: string; number: number; title: string; url: string | null; author: string; state: PullState; proposedRevision: string };
export type PolicySource = {
  current: (area: PolicyArea) => Promise<PolicyCurrent>;
  /** Comprueba la candidata; no escribe nada. */
  validate: (area: PolicyArea, candidate: string) => Promise<PolicyProposal>;
  pulls: (area: PolicyArea) => Promise<PolicyPull[]>;
  open: (area: PolicyArea, candidate: string, proposal: PolicyProposal) => Promise<void>;
};

const TONE: Record<PullState, "active" | "warning" | "success" | "neutral"> = { checks: "active", review: "warning", approved: "success", merged: "neutral", closed: "neutral" };

function Changes(props: { title: string; items: string[] }) {
  return (
    <div class="grid content-start gap-1">
      <span class="text-xs text-neutral-500">{props.title} · {props.items.length}</span>
      <For each={props.items}>{(item) => <span class="font-mono text-caption break-all">{item}</span>}</For>
    </div>
  );
}

/** `canPropose: false`: quien solo lee ve la política y sus PR, sin proponer. */
export function PolicyFlow(props: { area: PolicyArea; source: PolicySource; canPropose: boolean }) {
  const [current] = createResource(() => props.source.current(props.area));
  const [pulls, { refetch }] = createResource(() => props.source.pulls(props.area));
  const [draft, setDraft] = createSignal<string | null>(null);
  const [proposal, setProposal] = createSignal<PolicyProposal | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [failed, setFailed] = createSignal(false);
  const internal = () => current()?.repository === null;
  const text = () => draft() ?? current()?.content ?? "";
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setFailed(false);
    await work().catch(() => setFailed(true));
    setBusy(false);
  };
  const validate = () => run(async () => void setProposal(await props.source.validate(props.area, text())));
  const open = (value: PolicyProposal) => run(async () => {
    await props.source.open(props.area, text(), value);
    setProposal(null);
    setDraft(null);
    await refetch();
  });
  return (
    <SettingsPanel data-policy-flow={props.area}>
      <SettingsSection title={t("web.admin.policy_current")} description={internal() ? t("web.admin.policy_by_review") : t("web.admin.policy_by_pr")}>
        <Show when={current()}>
          {(value) => <SettingsRow label={value().repository ? `${value().repository!.name} · ${value().repository!.path}` : t("web.admin.policy_internal")} description={t("web.admin.policy_revision", { revision: value().revision.slice(0, 12) })} />}
        </Show>
      </SettingsSection>
      <Show when={props.canPropose}>
        <SettingsSection title={t("web.admin.policy_propose")} description={t("web.admin.policy_propose_hint")}>
          <div class="grid gap-2 pt-3">
            <Textarea class="min-h-40 font-mono text-caption" spellcheck={false} aria-label={t("web.admin.policy_candidate")} value={text()} onInput={(event) => { setDraft(event.currentTarget.value); setProposal(null); }} />
            <Button class="justify-self-start" size="sm" variant="secondary" disabled={busy()} onClick={() => void validate()}>{t("web.admin.policy_validate")}</Button>
          </div>
        </SettingsSection>
        <Show when={proposal()}>
          {(value) => (
            <SettingsSection title={t("web.admin.policy_result")} data-policy-result={value().valid ? "valid" : "invalid"}>
              <Show when={value().valid} fallback={
                <ul class="m-0 grid list-none gap-2 p-0 pt-3 text-sm">
                  <For each={value().errors}>{(error) => <li class="grid gap-0.5"><span class="text-error-strong">{error.message}</span><span class="font-mono text-caption text-neutral-500">{error.path}</span></li>}</For>
                </ul>
              }>
                <Show when={value().changed} fallback={<p class="m-0 py-3 text-sm text-neutral-500">{t("web.admin.policy_unchanged")}</p>}>
                  <div class="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-3 pt-3">
                    <Changes title={t("web.admin.policy_added")} items={value().added} />
                    <Changes title={t("web.admin.policy_modified")} items={value().modified} />
                    <Changes title={t("web.admin.policy_removed")} items={value().removed} />
                  </div>
                  <Button class="mt-3 justify-self-start" size="sm" disabled={busy()} onClick={() => void open(value())}>{internal() ? t("web.admin.policy_send_review") : t("web.admin.policy_open_pr")}</Button>
                </Show>
              </Show>
            </SettingsSection>
          )}
        </Show>
      </Show>
      <Show when={failed()}><p role="alert" class="m-0 text-sm text-error-strong">{t("web.admin.policy_failed")}</p></Show>
      <SettingsSection title={internal() ? t("web.admin.policy_proposals") : t("web.admin.policy_pulls")}>
        <For each={pulls()} fallback={<p class="m-0 py-3 text-sm text-neutral-500">{internal() ? t("web.admin.policy_no_proposals") : t("web.admin.policy_no_pulls")}</p>}>
          {(row) => (
            <SettingsRow data-policy-pull={row.state} label={<Show when={row.url} fallback={`#${row.number} · ${row.title}`}>{(url) => <a class={ENLACE} href={url()} target="_blank" rel="noopener noreferrer">{`#${row.number} · ${row.title}`}</a>}</Show>} description={t("web.admin.policy_pull_detail", { author: row.author, revision: row.proposedRevision.slice(0, 12) })}>
              <Badge tone={TONE[row.state]}>{t(`web.admin.pull_state.${row.state}`)}</Badge>
            </SettingsRow>
          )}
        </For>
      </SettingsSection>
    </SettingsPanel>
  );
}
