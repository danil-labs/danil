import { For, Show, createMemo, createSignal, onMount, onCleanup } from "solid-js";
import type { MachineConnection } from "@danil/engine-client";
import type {
  DeleteTaskTarget,
  DeleteTaskPreview,
  DeleteTaskMemberItem,
  TaskIntegrationStatus,
  DeleteTaskResult,
} from "../model.ts";
import { DeleteTaskMember } from "./DeleteTaskMember.tsx";

export interface DeleteTaskDialogProps {
  conn?: MachineConnection;
  target: DeleteTaskTarget;
  isCurrent?: () => boolean;
  onDeleted?: (members: { project: string; id: string }[]) => void;
  onClose: () => void;
  onInspect?: (target: DeleteTaskTarget) => Promise<DeleteTaskPreview>;
  onApply?: (
    target: DeleteTaskTarget,
    preview: DeleteTaskPreview,
    options: { discard: boolean }
  ) => Promise<DeleteTaskResult>;
}

export function DeleteTaskDialog(props: DeleteTaskDialogProps) {
  const [preview, setPreview] = createSignal<DeleteTaskPreview | null>(null);
  const [reviewed, setReviewed] = createSignal<ReadonlySet<string>>(new Set());
  const [confirmDiscard, setConfirmDiscard] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const [invalid, setInvalid] = createSignal(false);
  const [shown, setShown] = createSignal(false);

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(debounceTimer));

  const memberKey = (member: DeleteTaskMemberItem) => `${member.project}:${member.id}`;
  const members = () => preview()?.members ?? [];

  const integrationOf = (member: DeleteTaskMemberItem): TaskIntegrationStatus =>
    member.integration || "unconfirmed";

  const needsReview = (member: DeleteTaskMemberItem) =>
    member.inspection.status !== "complete" ||
    !!member.inspection.error ||
    member.files.length > 0 ||
    integrationOf(member) !== "merged";

  const hasDiscardableChanges = createMemo(() =>
    members().some((m) => m.files.length > 0 || integrationOf(m) !== "merged")
  );

  const accepted = (member: DeleteTaskMemberItem) =>
    !needsReview(member) || reviewed().has(memberKey(member));

  const reviewable = () =>
    members().filter((m) => needsReview(m) && m.inspection.status === "complete");

  const allReviewed = () =>
    reviewable().length > 0 && reviewable().every((m) => reviewed().has(memberKey(m)));

  const ready = createMemo(() => {
    const isCur = props.isCurrent ? props.isCurrent() : true;
    const discardConfirmed = !hasDiscardableChanges() || confirmDiscard();
    return (
      !busy() &&
      isCur &&
      !invalid() &&
      !!preview()?.consent &&
      members().length > 0 &&
      members().every((m) => m.inspection.status === "complete" && accepted(m)) &&
      discardConfirmed
    );
  });

  async function inspect(message = "") {
    setPreview(null);
    setReviewed(new Set<string>());
    setConfirmDiscard(false);
    setInvalid(false);
    setError(message);
    setBusy(true);

    try {
      if (!props.onInspect) {
        throw new Error("No se ha configurado la acción de inspección");
      }
      const seen = await props.onInspect(props.target);
      setPreview(seen);
      setShown(true);
    } catch (failure) {
      const failMsg = failure instanceof Error ? failure.message : String(failure);
      setError([message, failMsg].filter(Boolean).join("\n"));
      setShown(true);
    } finally {
      setBusy(false);
    }
  }

  // B-011: Reinspección automática con debounce si cambia el consentimiento
  function scheduleDebouncedInspect(msg: string) {
    setInvalid(true);
    setShown(true);
    setError(msg);
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      void inspect("Actualizando inspección por cambio de estado...");
    }, 400);
  }

  async function apply() {
    if (!ready()) return;
    const seen = preview();
    if (!seen) return;

    setBusy(true);
    setError("");

    try {
      const isCur = props.isCurrent ? props.isCurrent() : true;
      if (invalid() || !isCur || seen.members.some((m) => !accepted(m))) {
        setError("El estado ha cambiado durante la revisión. Vuelva a inspeccionar.");
        setShown(true);
        return;
      }

      if (!props.onApply) {
        throw new Error("No se ha configurado la acción de aplicación");
      }

      const discard = hasDiscardableChanges() ? confirmDiscard() : false;
      const result = await props.onApply(props.target, seen, { discard });
      props.onDeleted?.(result.applied);

      if (result.status === "complete" && result.failures.length === 0) {
        props.onClose();
      } else {
        setInvalid(true);
        setShown(true);
        const failMsgs = result.failures.map(
          (f) => `${f.project}/${f.id}: ${String(f.error)}`
        );
        setError(["Eliminación parcial:", ...failMsgs].join("\n"));
      }
    } catch (failure) {
      setShown(true);
      const code = failure && typeof failure === "object" && "code" in failure ? (failure as { code: string }).code : "";
      const text = failure instanceof Error ? failure.message : String(failure);

      if (code === "task_family_consent_changed" || text.includes("consent")) {
        scheduleDebouncedInspect("El consentimiento de la tarea cambió; reinspeccionando...");
      } else {
        setInvalid(true);
        setError(text);
      }
    } finally {
      setBusy(false);
    }
  }

  onMount(async () => {
    await inspect();
    setShown(true);
  });

  return (
    <Show
      when={shown()}
      fallback={
        <div class="fixed bottom-4 right-4 z-50 rounded-md border border-neutral-300 bg-white p-3 shadow-md" role="status">
          <p class="m-0 text-sm text-neutral-700">Eliminando tarea...</p>
        </div>
      }
    >
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div class="flex max-h-[90vh] w-full max-w-lg flex-col gap-3 overflow-hidden rounded-lg border border-neutral-200 bg-white p-6 shadow-xl">
          <h2 class="m-0 text-base font-semibold text-neutral-900">
            Eliminar tarea y su trabajo
          </h2>
          <p class="m-0 text-sm text-neutral-700">
            Se eliminarán los archivos y worktrees de esta tarea y sus miembros asociados.
          </p>

          <Show when={busy()}>
            <p role="status" class="m-0 text-xs text-neutral-500">
              Inspeccionando trabajo en curso...
            </p>
          </Show>

          <Show when={members().filter(needsReview).length > 1}>
            <label class="flex items-center gap-2 text-sm font-medium text-neutral-950">
              <input
                type="checkbox"
                class="accent-primary"
                data-delete-review-all
                disabled={busy() || invalid() || reviewable().length === 0}
                checked={allReviewed()}
                onChange={(event) => {
                  const checked = event.currentTarget.checked;
                  setReviewed((current) => {
                    const next = new Set(current);
                    for (const member of reviewable()) {
                      const k = memberKey(member);
                      if (checked) next.add(k);
                      else next.delete(k);
                    }
                    return next;
                  });
                }}
              />
              He revisado todos los cambios
            </label>
          </Show>

          <ul class="m-0 flex max-h-[40vh] list-none flex-col gap-2 overflow-y-auto p-0">
            <For each={members()}>
              {(member) => (
                <DeleteTaskMember
                  member={member}
                  place={`${member.project} · ${props.target.machineName ?? "Máquina"}`}
                  integration={integrationOf(member)}
                  needsReview={needsReview(member)}
                  disabled={busy() || invalid()}
                  reviewed={reviewed().has(memberKey(member))}
                  onReviewed={(checked) => {
                    setReviewed((current) => {
                      const next = new Set(current);
                      const k = memberKey(member);
                      if (checked) next.add(k);
                      else next.delete(k);
                      return next;
                    });
                  }}
                />
              )}
            </For>
          </ul>

          <Show when={hasDiscardableChanges()}>
            <label class="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs font-medium text-amber-900">
              <input
                type="checkbox"
                class="accent-primary"
                data-delete-confirm-discard
                disabled={busy() || invalid()}
                checked={confirmDiscard()}
                onChange={(e) => setConfirmDiscard(e.currentTarget.checked)}
              />
              Confirmar descarte explícito de archivos sin guardar o cambios no integrados
            </label>
          </Show>

          <Show when={error()}>
            <p role="alert" class="m-0 whitespace-pre-wrap break-all text-xs text-red-600">
              {error()}
            </p>
          </Show>

          <div class="mt-2 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              class="rounded border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
              disabled={busy()}
              onClick={props.onClose}
            >
              Conservar
            </button>
            <button
              type="button"
              class="rounded border border-neutral-300 bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-800 hover:bg-neutral-200 disabled:opacity-50"
              disabled={busy()}
              onClick={() => void inspect()}
            >
              Inspeccionar de nuevo
            </button>
            <button
              type="button"
              class="rounded bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
              disabled={!ready()}
              onClick={() => void apply()}
            >
              Eliminar
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
}
