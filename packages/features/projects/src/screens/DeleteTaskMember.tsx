import { For, Show } from "solid-js";
import { t } from "../../../../ui/src/lib/i18n";
import { type DeleteMember, failureText, type Integration } from "../queries/deleteTask";

/** One task of the family in the delete review: what is lost, and its own acceptance when there is a loss. */
export default function DeleteTaskMember(props: {
  member: DeleteMember;
  place: string;
  integration: Integration;
  needsReview: boolean;
  dirty: string[];
  disabled: boolean;
  reviewed: boolean;
  onReviewed: (checked: boolean) => void;
}) {
  const complete = () => props.member.inspection.status === "complete";
  return <li class="min-w-0">
    <p class="m-0 text-ui font-medium text-neutral-950">{props.member.title || props.member.id}</p>
    <p class="m-0 text-caption text-neutral-500">{props.place}</p>
    <p class="m-0 text-caption text-neutral-700">{complete() ? t("projects.sessions.delete_inspected") : t("projects.sessions.delete_inspection_failed")}</p>
    <Show when={props.member.inspection.error}><p class="m-0 break-all text-caption text-error-strong">{failureText(props.member.inspection.error)}</p></Show>
    <Show when={props.member.working}><p class="m-0 text-caption text-warning-strong">{t("projects.sessions.delete_working")}</p></Show>
    <ul class="m-0 list-none p-0"><For each={props.member.files}>{file => <li class="break-all font-mono text-caption text-neutral-500">{file.path}</li>}</For></ul>
    <Show when={complete() && props.integration !== "merged"}><p class="m-0 text-caption text-warning-strong">{t(props.integration === "unmerged" ? "projects.sessions.delete_unmerged" : "projects.sessions.delete_unconfirmed")}</p></Show>
    <Show when={complete() && props.member.files.length === 0}><p class="m-0 text-caption text-neutral-500">{t("projects.sessions.delete_no_files")}</p></Show>
    <Show when={props.dirty.length > 0}>
      <p class="m-0 text-caption text-warning-strong">{t("projects.sessions.delete_buffers")}</p>
      <ul class="m-0 list-none p-0"><For each={props.dirty}>{path => <li class="break-all font-mono text-caption text-warning-strong">{path}</li>}</For></ul>
    </Show>
    <Show when={props.needsReview}><label class="flex items-center gap-2 text-ui text-neutral-700">
      <input type="checkbox" class="accent-primary" disabled={props.disabled || !complete() || props.dirty.length > 0}
        checked={props.reviewed} onChange={event => props.onReviewed(event.currentTarget.checked)} />
      {t("projects.sessions.delete_reviewed")}
    </label></Show>
  </li>;
}
