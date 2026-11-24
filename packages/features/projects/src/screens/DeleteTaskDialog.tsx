import { For, Show, createEffect, createMemo, createSignal, onMount } from "solid-js";
import { errorCode } from "../../../../ui/src/lib/errorCode.ts";
import { t } from "../../../../ui/src/lib/i18n";
import { Button } from "../../../../ui/src/Button";
import { Dialog, DialogContent, DialogTitle } from "../../../../ui/src/Dialog";
import { Toast, ToastPortal } from "../../../../ui/src/Toast";
import DeleteTaskMember from "../components/DeleteTaskMember";
import {
  type DeleteMember,
  type DeletePreview,
  type DeleteTarget,
  failureText,
  type Integration,
  integrationChecks,
  memberKey as key,
  previewTaskLifecycle,
  applyTaskLifecycle,
} from "../queries";

export type { DeleteTarget };

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
  const dirty = (member: DeleteMember) => props.dirty(props.target.panelId(member.id));
  // Whether each member's branch is integrated: the preview's `integration`, or the fallback check below.
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
      const seen = await previewTaskLifecycle(args(), props.target.options);
      setIntegration(await integrationChecks(seen.members, props.target.options));
      setPreview(seen);
    } catch (failure) { setError([message, failureText(failure)].filter(Boolean).join("\n")); setShown(true); }
    finally { setBusy(false); }
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
      const result = await applyTaskLifecycle({ ...args(), consent: seen.consent, discard }, props.target.options);
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
        <For each={members()}>{member => <DeleteTaskMember member={member} place={`${props.target.folderName(member.project)} · ${props.target.machineName}`}
          integration={integrationOf(member)} needsReview={needsReview(member)} dirty={dirty(member)} disabled={busy() || invalid()} reviewed={reviewed().has(key(member))}
          onReviewed={checked => setReviewed(current => {
            const next = new Set(current);
            if (checked) next.add(key(member)); else next.delete(key(member));
            return next;
          })} />}</For>
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
