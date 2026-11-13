import { For, Show, createEffect, createMemo, createSignal, onMount } from "solid-js";
import type { InvokeOptions } from "@tauri-apps/api/core";
import { errorCode } from "../../lib/errorCode";
import { invoke } from "../../lib/invoke";
import { t } from "../../lib/i18n";
import { Button } from "../../ui/Button";
import { Dialog, DialogContent, DialogTitle } from "../../ui/Dialog";
import { detalleDe, prosaDe } from "../../ui/Failure";
import { Toast, ToastPortal } from "../../ui/Toast";

export type DeleteMember = {
  workspace: string;
  project: string;
  id: string;
  title: string;
  working: boolean;
  files: { path: string; hash: string }[];
  inspection: { status: "complete" | "failed"; error?: unknown };
  /** Engines with per-member integration in the preview; older ones omit it. */
  integration?: "none" | "merged" | "unmerged" | "unchecked";
};
type DeletePreview = { members: DeleteMember[]; consent?: string | null; expires_at?: number };
type Integration = "merged" | "unmerged" | "unconfirmed";
type DeleteResult = {
  status: "complete" | "partial";
  applied: { project: string; id: string }[];
  failures: { project: string; id: string; error: unknown }[];
};
export type DeleteTarget = { project: string; id: string; workspace: string | null; members?: number; supported: boolean; machineName: string; folderName: (project: string) => string; options: InvokeOptions; panelId: (id: string) => string };

function failureText(failure: unknown): string {
  if (errorCode(failure) === "task_family_busy") return t("projects.sessions.delete_busy");
  const message = prosaDe(failure);
  const detail = detalleDe(failure);
  return detail && detail !== message ? `${message}\n${detail}` : message;
}

export default function DeleteTaskDialog(props: {
  target: DeleteTarget;
  dirty: (id: string) => string[];
  prepare: (ids: string[]) => Promise<void>;
  lock: (ids: string[]) => void;
  isCurrent: () => boolean;
  onDeleted: (members: { project: string; id: string }[]) => void;
  onClose: () => void;
}) {
  const [preview, setPreview] = createSignal<DeletePreview | null>(null);
  const [reviewed, setReviewed] = createSignal<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const [invalid, setInvalid] = createSignal(false);
  // The dialog only opens when the family has losses, the inspection failed or the engine refused.
  const [shown, setShown] = createSignal(false);
  const members = () => preview()?.members ?? [];
  const key = (member: DeleteMember) => JSON.stringify([member.project, member.id]);
  const dirty = (member: DeleteMember) => props.dirty(props.target.panelId(member.id));
  // The engine's finish check (`task_blockers` → `not_finished`) says whether a member's branch is integrated.
  const [integration, setIntegration] = createSignal<ReadonlyMap<string, Integration>>(new Map());
  const integrationOf = (member: DeleteMember) => integration().get(key(member)) ?? "unconfirmed";
  // Only a completed inspection with nothing listed and an integrated branch counts as losing nothing.
  const needsReview = (member: DeleteMember) => member.inspection.status !== "complete" || !!member.inspection.error || member.files.length > 0
    || integrationOf(member) !== "merged";
  const accepted = (member: DeleteMember) => !needsReview(member) || reviewed().has(key(member));
  const reviewable = () => members().filter(member => needsReview(member) && member.inspection.status === "complete" && dirty(member).length === 0);
  const allReviewed = () => reviewable().length > 0 && reviewable().every(member => reviewed().has(key(member)));
  const ready = createMemo(() => !busy() && props.isCurrent() && !invalid() && !!preview()?.consent && members().length > 0
    && members().every(member => member.inspection.status === "complete" && accepted(member) && dirty(member).length === 0));
  createEffect(() => {
    if (members().some(member => dirty(member).length > 0)) {
      setInvalid(true);
      setReviewed(new Set<string>());
    }
  });
  const args = () => ({ project: props.target.project, id: props.target.id, action: "delete" });
  async function inspect(message = "") {
    setPreview(null);
    setIntegration(new Map());
    setReviewed(new Set<string>());
    setInvalid(false);
    setError(message);
    if (!props.target.supported) { setError(t("projects.sessions.delete_unsupported")); setShown(true); return; }
    setBusy(true);
    try {
      const seen = await invoke<DeletePreview>("task_lifecycle_preview", args(), props.target.options);
      setIntegration(await integrationChecks(seen.members));
      setPreview(seen);
    } catch (failure) { setError([message, failureText(failure)].filter(Boolean).join("\n")); setShown(true); }
    finally { setBusy(false); }
  }
  // The preview's `integration` decides. Older engines fall back to the finish check, whose `not_finished` also
  // flags a worktree without commits of its own and does not tell unmerged from unchecked: those stay unconfirmed.
  async function integrationChecks(list: DeleteMember[]): Promise<ReadonlyMap<string, Integration>> {
    const result = new Map<string, Integration>();
    for (const member of list) {
      if (member.integration === "none" || member.integration === "merged") result.set(key(member), "merged");
      else if (member.integration === "unmerged") result.set(key(member), "unmerged");
    }
    const deadline = Date.now() + 20_000;
    const queue = list.filter(member => member.inspection.status === "complete" && member.integration === undefined);
    const worker = async () => {
      for (let member = queue.shift(); member && Date.now() < deadline; member = queue.shift()) {
        const blockers = await invoke<{ not_finished: boolean }>("task_blockers", { project: member.project, id: member.id, finish: true }, props.target.options).catch(() => null);
        if (blockers && !blockers.not_finished) result.set(key(member), "merged");
      }
    };
    await Promise.race([Promise.all(Array.from({ length: 4 }, worker)), new Promise(resolve => setTimeout(resolve, Math.max(0, deadline - Date.now())))]);
    return new Map(result);
  }
  async function apply() {
    if (!ready()) return;
    const seen = preview()!;
    setBusy(true);
    setError("");
    props.lock(seen.members.map(member => props.target.panelId(member.id)));
    try {
      await props.prepare(seen.members.map(member => props.target.panelId(member.id)));
      // Preparing native viewers yields; editors may have changed in the meantime.
      if (preview() !== seen || invalid() || !props.isCurrent() || seen.members.some(member => !accepted(member) || dirty(member).length > 0)) {
        setError(t("projects.sessions.delete_buffers"));
        setShown(true);
        return;
      }
      const discard = seen.members.some(member => member.files.length > 0);
      const result = await invoke<DeleteResult>("task_lifecycle_apply", { ...args(), consent: seen.consent, discard }, props.target.options);
      props.onDeleted(result.applied.map(member => ({ ...member, id: props.target.panelId(member.id) })));
      if (result.status === "complete" && result.failures.length === 0) props.onClose();
      else { setInvalid(true); setShown(true); setError([t("projects.sessions.delete_partial"), ...result.failures.map(failure => `${props.target.folderName(failure.project)} / ${members().find(member => member.id === failure.id && member.project === failure.project)?.title || failure.id}: ${failureText(failure.error)}`)].join("\n")); }
    } catch (failure) {
      setShown(true);
      if (errorCode(failure) !== "task_family_busy") setInvalid(true);
      if (errorCode(failure) === "task_family_consent_changed") await inspect(t("projects.sessions.delete_changed"));
      else setError(failureText(failure));
    } finally { props.lock([]); setBusy(false); }
  }
  onMount(async () => {
    await inspect();
    if (shown()) return;
    if (ready() && members().length === (props.target.members ?? 1) && members().every(member => !needsReview(member))) await apply();
    else setShown(true);
  });
  return <Show when={shown()} fallback={<ToastPortal><Toast tone="status"><p class="m-0 text-ui text-neutral-700">{t("projects.sessions.deleting")}</p></Toast></ToastPortal>}><Dialog open onOpenChange={open => { if (!open && !busy()) props.onClose(); }}>
    <DialogContent class="flex flex-col gap-3">
      <DialogTitle class="text-body font-semibold">{t("projects.sessions.delete_work_title")}</DialogTitle>
      <p class="m-0 text-ui text-neutral-700">{t("projects.sessions.delete_work")}</p>
      <Show when={busy()}><p role="status" class="m-0 text-ui text-neutral-500">{t("projects.sessions.delete_inspecting")}</p></Show>
      <Show when={members().filter(needsReview).length > 1}>
        <label class="flex items-center gap-2 text-ui font-medium text-neutral-950">
          <input type="checkbox" class="accent-primary" data-delete-review-all disabled={busy() || invalid() || reviewable().length === 0}
            checked={allReviewed()} onChange={event => {
              const checked = event.currentTarget.checked;
              setReviewed(current => {
                const next = new Set(current);
                for (const member of reviewable()) if (checked) next.add(key(member)); else next.delete(key(member));
                return next;
              });
            }} />
          {t("projects.sessions.delete_reviewed_all")}
        </label>
      </Show>
      <ul class="m-0 flex max-h-[40vh] list-none flex-col gap-3 overflow-y-auto p-0">
        <For each={members()}>{member => <li class="min-w-0">
          <p class="m-0 text-ui font-medium text-neutral-950">{member.title || member.id}</p>
          <p class="m-0 text-caption text-neutral-500">{props.target.folderName(member.project)} · {props.target.machineName}</p>
          <p class="m-0 text-caption text-neutral-700">{member.inspection.status === "complete" ? t("projects.sessions.delete_inspected") : t("projects.sessions.delete_inspection_failed")}</p>
          <Show when={member.inspection.error}><p class="m-0 break-all text-caption text-error-strong">{failureText(member.inspection.error)}</p></Show>
          <Show when={member.working}><p class="m-0 text-caption text-warning-strong">{t("projects.sessions.delete_working")}</p></Show>
          <ul class="m-0 list-none p-0"><For each={member.files}>{file => <li class="break-all font-mono text-caption text-neutral-500">{file.path}</li>}</For></ul>
          <Show when={member.inspection.status === "complete" && integrationOf(member) !== "merged"}><p class="m-0 text-caption text-warning-strong">{t(integrationOf(member) === "unmerged" ? "projects.sessions.delete_unmerged" : "projects.sessions.delete_unconfirmed")}</p></Show>
          <Show when={member.inspection.status === "complete" && member.files.length === 0}><p class="m-0 text-caption text-neutral-500">{t("projects.sessions.delete_no_files")}</p></Show>
          <Show when={dirty(member).length > 0}>
            <p class="m-0 text-caption text-warning-strong">{t("projects.sessions.delete_buffers")}</p>
            <ul class="m-0 list-none p-0"><For each={dirty(member)}>{path => <li class="break-all font-mono text-caption text-warning-strong">{path}</li>}</For></ul>
          </Show>
          <Show when={needsReview(member)}><label class="flex items-center gap-2 text-ui text-neutral-700">
            <input type="checkbox" class="accent-primary" disabled={busy() || invalid() || member.inspection.status !== "complete" || dirty(member).length > 0}
              checked={reviewed().has(key(member))} onChange={event => setReviewed(current => {
                const next = new Set(current);
                if (event.currentTarget.checked) next.add(key(member)); else next.delete(key(member));
                return next;
              })} />
            {t("projects.sessions.delete_reviewed")}
          </label></Show>
        </li>}</For>
      </ul>
      <Show when={error()}><p role="alert" class="m-0 whitespace-pre-wrap break-all text-ui text-error-strong">{error()}</p></Show>
      <div class="flex flex-wrap justify-end gap-2">
        <Button variant="outline" size="sm" disabled={busy()} onClick={props.onClose}>{t("projects.sessions.keep")}</Button>
        <Button variant="secondary" size="sm" disabled={busy() || !props.target.supported} onClick={() => void inspect()}>{t("projects.sessions.delete_inspect_again")}</Button>
        <Button variant="danger" size="sm" disabled={!ready()} onClick={() => void apply()}>{t("projects.sessions.delete")}</Button>
      </div>
    </DialogContent>
  </Dialog></Show>;
}
