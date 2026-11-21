import { For, Show } from "solid-js";
import type { DeleteTaskMemberItem, TaskIntegrationStatus } from "../model.ts";

export interface DeleteTaskMemberProps {
  member: DeleteTaskMemberItem;
  place?: string;
  integration: TaskIntegrationStatus;
  needsReview: boolean;
  disabled?: boolean;
  reviewed?: boolean;
  onReviewed?: (checked: boolean) => void;
}

export function DeleteTaskMember(props: DeleteTaskMemberProps) {
  const memberKey = () => `${props.member.project}:${props.member.id}`;

  return (
    <li class="flex flex-col gap-2 rounded-md border border-neutral-200 bg-neutral-50 p-3 text-ui">
      <div class="flex items-start justify-between gap-2">
        <div class="flex flex-col">
          <span class="font-medium text-neutral-900">
            {props.member.title || props.member.id}
          </span>
          <Show when={props.place}>
            <span class="text-xs text-neutral-500">{props.place}</span>
          </Show>
        </div>
        <Show when={props.needsReview}>
          <label class="flex items-center gap-1.5 text-xs font-medium text-neutral-800">
            <input
              type="checkbox"
              class="accent-primary"
              data-delete-review-member={memberKey()}
              disabled={props.disabled}
              checked={props.reviewed ?? false}
              onChange={(e) => props.onReviewed?.(e.currentTarget.checked)}
            />
            Confirmar pérdida
          </label>
        </Show>
      </div>

      <Show when={props.member.inspection.error}>
        <p class="m-0 text-xs text-red-600">
          Error de inspección: {props.member.inspection.error}
        </p>
      </Show>

      <Show when={props.member.files.length > 0}>
        <div class="flex flex-col gap-1">
          <span class="text-xs font-medium text-amber-700">
            {props.member.files.length} archivo(s) sin guardar o no confirmados:
          </span>
          <ul class="m-0 max-h-24 overflow-y-auto pl-4 text-xs text-neutral-600">
            <For each={props.member.files}>
              {(file) => <li class="truncate">{file}</li>}
            </For>
          </ul>
        </div>
      </Show>

      <Show when={props.integration === "unmerged"}>
        <span class="text-xs text-amber-700">
          Rama git no integrada en la rama principal.
        </span>
      </Show>
    </li>
  );
}
