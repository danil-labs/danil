import { createEffect, createSignal, For, on, Show } from "solid-js";
import { t } from "../../lib/i18n";
import { cn } from "../../lib/utils";
import { Button } from "../../ui/Button";
import { Dialog, DialogContent, DialogTitle } from "../../ui/Dialog";
import { Select } from "../../ui/Select";
import { createWorkspaces } from "../settings/workspaces-store";
import { directoryErrorText } from "./directory-errors";
import {
  createForActiveWorkspace,
  danilWorkspaceStepDismissed,
  directory,
  dismissDanilWorkspaceStep,
  linkableAccounts,
  linkActiveWorkspace,
  signedInCount,
  unlinkedActive,
} from "./workspace-directory";

const OPTION =
  "flex w-full items-start gap-2.5 rounded-md border border-border px-3 py-2.5 text-left text-ui outline-none hover:bg-surface-muted focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent aria-checked:border-primary aria-checked:shadow-[inset_0_0_0_1px_var(--color-primary)]";
const RADIO =
  "mt-0.5 size-3.5 shrink-0 rounded-full border-[1.5px] border-neutral-500 group-aria-checked:border-primary group-aria-checked:bg-[radial-gradient(var(--color-primary)_42%,transparent_48%)]";

type Choice = "upload" | "sync";

/**
 * El paso del workspace al terminar de iniciar sesión en la ventana: si el workspace
 * abierto es de la persona y no está en la nube, ofrece subirlo o sincronizarlo con uno
 * que ya tiene (los que administra y no están sincronizados con otro). «Ahora no» no
 * vuelve a preguntar por ese workspace. Subir o sincronizar lo decide el plano de
 * control; aquí solo se ofrece lo que el directorio dice.
 */
export default function DanilWorkspaceStep() {
  const ws = createWorkspaces();
  const [open, setOpen] = createSignal(false);
  const [choice, setChoice] = createSignal<Choice>("upload");
  const [picked, setPicked] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [failure, setFailure] = createSignal<string | null>(null);
  // Se monta con la primera sesión abierta; cada una espera a que el directorio relea antes de decidir.
  const [pending, setPending] = createSignal(false);
  createEffect(on(signedInCount, (n) => n > 0 && setPending(true)));
  createEffect(() => {
    if (!pending() || !directory()) return;
    const active = ws.activo();
    if (!active) return;
    setPending(false);
    if (unlinkedActive(active) && !danilWorkspaceStepDismissed(active)) {
      const first = linkableAccounts(active)[0];
      setChoice(first ? "sync" : "upload");
      setPicked(first?.key ?? null);
      setFailure(null);
      setOpen(true);
    }
  });
  // Sincronizado por otro camino (el menú, otra ventana): el paso ya no tiene qué preguntar.
  createEffect(() => {
    if (open() && directory() && !busy() && !unlinkedActive(ws.activo())) setOpen(false);
  });

  const name = () => ws.actual()?.name ?? "";
  const accounts = () => linkableAccounts(ws.activo());
  const target = () => accounts().find((a) => a.key === picked()) ?? accounts()[0];
  const targetName = () => target()?.name || t("shell.directory.unnamed");

  const submit = async () => {
    const active = ws.activo();
    if (!active || busy()) return;
    const account = target();
    if (choice() === "sync" && !account) return;
    setBusy(true);
    setFailure(null);
    const code = choice() === "sync" && account ? await linkActiveWorkspace(active, account) : await createForActiveWorkspace(active);
    setBusy(false);
    if (code) {
      setFailure(code);
      // Ya tiene uno propio en la nube: lo natural es sincronizar con ese.
      if (code === "personal_workspace_exists" && accounts().length) setChoice("sync");
      return;
    }
    void ws.cargar();
    setOpen(false);
  };
  const later = () => {
    const active = ws.activo();
    if (active) dismissDanilWorkspaceStep(active);
    setOpen(false);
  };

  return (
    <Dialog open={open()} onOpenChange={(next) => !next && setOpen(false)}>
      <DialogContent class="max-w-[460px]" data-danil-workspace-step={choice()}>
        <DialogTitle class="m-0 text-lead font-semibold">{t("shell.danilStep.title", { workspace: name() })}</DialogTitle>
        <p class="m-0 mt-1.5 text-ui text-neutral-500">{t("shell.danilStep.hint")}</p>
        <div
          class="mt-4 flex flex-col gap-2"
          role="radiogroup"
          aria-label={t("shell.danilStep.title", { workspace: name() })}
          onKeyDown={(event) => {
            // Como un grupo de radios: las flechas cambian la opción y el foco la sigue.
            if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key) || !accounts().length) return;
            event.preventDefault();
            const next: Choice = choice() === "upload" ? "sync" : "upload";
            setChoice(next);
            event.currentTarget.querySelector<HTMLElement>(next === "upload" ? "[data-danil-step-upload]" : "[data-danil-step-sync]")?.focus();
          }}
        >
          <button
            type="button"
            role="radio"
            aria-checked={choice() === "upload"}
            tabIndex={choice() === "upload" ? 0 : -1}
            class={cn(OPTION, "group")}
            disabled={busy()}
            data-danil-step-upload=""
            onClick={() => setChoice("upload")}
          >
            <span class={RADIO} aria-hidden="true" />
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="font-medium">{t("shell.danilStep.upload")}</span>
              <span class="text-caption text-neutral-500">{t("shell.danilStep.uploadHint", { workspace: name() })}</span>
            </span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={choice() === "sync"}
            tabIndex={choice() === "sync" ? 0 : -1}
            class={cn(OPTION, "group")}
            disabled={busy() || !accounts().length}
            data-danil-step-sync=""
            onClick={() => setChoice("sync")}
          >
            <span class={RADIO} aria-hidden="true" />
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="font-medium">{t("shell.danilStep.sync")}</span>
              <span class="text-caption text-neutral-500">
                {accounts().length ? t("shell.danilStep.syncHint", { workspace: name() }) : t("shell.danilStep.syncEmpty")}
              </span>
            </span>
          </button>
          <Show when={choice() === "sync" && accounts().length}>
            <label class="ml-6 flex flex-col gap-1">
              <span class="text-caption text-neutral-500">{t("shell.danilStep.syncLabel")}</span>
              <Select
                value={target()?.key ?? ""}
                disabled={busy()}
                data-danil-step-pick=""
                onChange={(event) => setPicked(event.currentTarget.value)}
              >
                <For each={accounts()}>
                  {(account) => <option value={account.key}>{account.name || t("shell.directory.unnamed")}</option>}
                </For>
              </Select>
            </label>
          </Show>
        </div>
        <Show when={failure()}>
          {(code) => (
            <p class="m-0 mt-3 text-ui text-error-strong" role="alert">
              {directoryErrorText(code())}
            </p>
          )}
        </Show>
        <div class="mt-4 flex justify-end gap-2">
          <Button variant="secondary" disabled={busy()} data-danil-step-later="" onClick={later}>
            {t("shell.danilStep.later")}
          </Button>
          <Button disabled={busy() || (choice() === "sync" && !target())} data-danil-step-submit="" onClick={() => void submit()}>
            {choice() === "sync" ? t("shell.danilStep.doSync", { name: targetName() }) : t("shell.danilStep.doUpload", { workspace: name() })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
