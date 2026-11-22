import Check from "lucide-solid/icons/check";
import CircleAlert from "lucide-solid/icons/circle-alert";
import { createSignal, For, Show } from "solid-js";
import { t } from "../../../../apps/desktop/src/lib/i18n";
import { Button } from "../../../ui/src/Button";
import { Toast, ToastPortal } from "../../../ui/src/Toast";
import type { AdoptionClaimed, AdoptionFailure } from "./account-adoption";
import type { AdoptionReport } from "./session-account-workspaces";
import MoveWorkspaceDialog from "./MoveWorkspaceDialog";
import type { sessionRail } from "./session-groups";
import { Pressable } from "../../../ui/src/Pressable";

const CAUSES: Record<string, string> = {
  adoption_disabled: "shell.workspaces.adoption.cause.disabled",
  adoption_route_missing: "shell.workspaces.adoption.cause.not_available",
  adoption_requires_personal: "shell.workspaces.adoption.cause.personal_pending",
  adoption_requires_free: "shell.workspaces.adoption.cause.free_pending",
  no_person: "shell.workspaces.adoption.cause.sign_in",
  engine: "shell.workspaces.adoption.cause.engine",
};
const REASONS: Record<string, string> = {
  id_taken: "shell.workspaces.adoption.reason.id_taken",
  id_format: "shell.workspaces.adoption.reason.id_format",
  seal: "shell.workspaces.adoption.reason.seal",
  proof: "shell.workspaces.adoption.reason.proof",
  network: "shell.workspaces.adoption.reason.network",
};

const causeText = (cause: string) => t(CAUSES[cause] ?? "shell.workspaces.adoption.cause.generic", { cause });
const reasonText = (failure: AdoptionFailure) => t(REASONS[failure.reason] ?? "shell.workspaces.adoption.reason.generic", { cause: failure.reason });

/**
 * El aviso de la adopción al entrar: lo que se trajo (`adoption_report`), lo
 * que no y la causa, y el reintento. No es un diálogo: no pide confirmación y
 * no tapa la app. Si no se trajo nada y no hubo fallos, no se monta.
 */
export function AdoptionFeedback(props: { sessions: ReturnType<typeof sessionRail>; onOpen: (id: string, context?: string) => void }) {
  // Un montaje de prueba o una ventana anterior puede no traer el aviso: sin él no se pinta nada.
  const report = () => props.sessions.adoptionReport?.() ?? null;
  const [moving, setMoving] = createSignal<AdoptionClaimed | null>(null);
  const failed = (value: AdoptionReport) => value.refused.length + value.failed.length;
  return <>
    <ToastPortal>
      <Show when={report()}>{(value) => (
        <Toast tone={value().adopted.length ? "status" : "error"} onDismiss={() => props.sessions.clearAdoptionReport?.()} data-adoption-report={value().org}>
          <Show when={value().adopted.length} fallback={
            <p class="m-0 flex items-center gap-2 text-sm font-medium"><CircleAlert size={14} aria-hidden="true" class="shrink-0 text-error-strong" />{t("shell.workspaces.adoption.failed_title")}</p>
          }>
            <p class="m-0 flex items-center gap-2 text-sm font-medium"><Check size={14} aria-hidden="true" class="shrink-0 text-success-strong" />{t("shell.workspaces.adoption.title", { n: value().adopted.length, count: value().adopted.length, org: value().org_name ?? value().org })}</p>
          </Show>
          <Show when={value().adopted.length}>
            <ul class="m-0 grid max-h-48 list-none gap-1 overflow-y-auto p-0">
              <For each={value().adopted}>{(claimed) => (
                <li class="flex items-center justify-between gap-2 text-xs">
                  <span class="truncate">{claimed.name}</span>
                  <span class="flex shrink-0 items-center gap-1">
                    <Pressable class="underline" onClick={() => props.onOpen(claimed.id, value().context)}>{t("shell.workspaces.adoption.view")}</Pressable>
                    <Pressable class="underline" onClick={() => setMoving(claimed)}>{t("shell.workspaces.adoption.move")}</Pressable>
                  </span>
                </li>
              )}</For>
            </ul>
          </Show>
          <Show when={failed(value())}>
            <ul class="m-0 grid list-none gap-1 p-0 text-xs text-neutral-500">
              <For each={[...value().refused, ...value().failed]}>{(failure) => (
                <li>{t("shell.workspaces.adoption.not_brought", { name: failure.name, cause: reasonText(failure) })}</li>
              )}</For>
            </ul>
          </Show>
          <Show when={value().unavailable || value().cause}>
            <p role="alert" class="m-0 text-xs text-neutral-500">{causeText(value().cause ?? "unavailable")}</p>
            <div><Button size="sm" variant="secondary" onClick={() => props.sessions.retryAdoption?.()}>{t("shell.workspaces.adoption.retry")}</Button></div>
          </Show>
        </Toast>
      )}</Show>
    </ToastPortal>
    <Show when={moving()}>{(claimed) => {
      const value = report();
      return value ? <MoveWorkspaceDialog sessions={props.sessions} workspace={claimed()} source={{ context_id: value.context, org: value.org }} onClose={() => setMoving(null)} /> : null;
    }}</Show>
  </>;
}
