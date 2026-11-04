import { createEffect, createSignal, For, lazy, on, Show, Suspense } from "solid-js";
import { t } from "../../lib/i18n";
import { Button } from "../../ui/Button";
import { Dialog, DialogContent, DialogTitle } from "../../ui/Dialog";
import { Select } from "../../ui/Select";
import { createWorkspaces } from "../settings/workspaces-store";
import { directoryErrorText } from "./directory-errors";
import {
  danilWorkspaceStepDismissed,
  directory,
  dismissDanilWorkspaceStep,
  linkableAccounts,
  linkActiveWorkspace,
  signedInCount,
  unlinkedActive,
} from "./workspace-directory";

const WorkspaceDirectoryMenu = lazy(() => import("./WorkspaceDirectoryMenu"));

/**
 * Al abrirse la sesión de la ventana, si el workspace abierto es de la persona, no está
 * sincronizado y hay uno de Danil que administra y que no está en otro workspace:
 * sincronizarlo con ese, entrar a otro o «Ahora no», que no vuelve a preguntar por ese
 * workspace. Decide el plano de control.
 */
export default function DanilWorkspaceStep() {
  const ws = createWorkspaces();
  const [open, setOpen] = createSignal(false);
  const [browsing, setBrowsing] = createSignal(false);
  const [picked, setPicked] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [failure, setFailure] = createSignal<string | null>(null);
  // Cada sesión nueva espera a que el directorio relea antes de decidir.
  const [pending, setPending] = createSignal(false);
  createEffect(on(signedInCount, (n) => n > 0 && setPending(true)));
  createEffect(() => {
    if (!pending() || !directory()) return;
    const active = ws.activo();
    if (!active) return;
    setPending(false);
    const first = linkableAccounts(active)[0];
    if (first && unlinkedActive(active) && !danilWorkspaceStepDismissed(active)) {
      setPicked(first.key);
      setFailure(null);
      setBrowsing(false);
      setOpen(true);
    }
  });
  // Sincronizado por otro camino (el menú, Configuración): ya no hay qué preguntar.
  createEffect(() => {
    if (open() && !browsing() && directory() && !busy() && !unlinkedActive(ws.activo())) setOpen(false);
  });

  const name = () => ws.actual()?.name ?? "";
  const accounts = () => linkableAccounts(ws.activo());
  const target = () => accounts().find((a) => a.key === picked()) ?? accounts()[0];
  const targetName = () => target()?.name || t("shell.directory.unnamed");

  const submit = async () => {
    const active = ws.activo();
    const account = target();
    if (!active || !account || busy()) return;
    setBusy(true);
    setFailure(null);
    const code = await linkActiveWorkspace(active, account);
    setBusy(false);
    if (code) return setFailure(code);
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
      <DialogContent class="max-w-[460px]" data-danil-workspace-step={browsing() ? "browse" : "sync"}>
        <DialogTitle class="m-0 text-lead font-semibold">{t("shell.danilStep.title", { workspace: name() })}</DialogTitle>
        <Show
          when={!browsing()}
          fallback={
            <div class="mt-3 rounded-md border border-border p-1" data-danil-step-directory="">
              <Suspense fallback={null}>
                <WorkspaceDirectoryMenu localOnly onClose={() => setOpen(false)} />
              </Suspense>
              <Button size="sm" variant="ghost" class="mt-1" onClick={() => setBrowsing(false)}>
                {t("shell.danilStep.back")}
              </Button>
            </div>
          }
        >
          <label class="mt-4 flex flex-col gap-1">
            <span class="text-caption text-neutral-500">{t("shell.danilStep.syncLabel")}</span>
            <Select value={target()?.key ?? ""} disabled={busy()} data-danil-step-pick="" onChange={(event) => setPicked(event.currentTarget.value)}>
              <For each={accounts()}>{(account) => <option value={account.key}>{account.name || t("shell.directory.unnamed")}</option>}</For>
            </Select>
            <span class="text-caption text-neutral-500">{t("shell.danilStep.syncHint", { workspace: name() })}</span>
          </label>
          <Show when={failure()}>
            {(code) => (
              <p class="m-0 mt-3 text-ui text-error-strong" role="alert">
                {directoryErrorText(code())}
              </p>
            )}
          </Show>
          <div class="mt-4 flex flex-wrap items-center justify-end gap-2">
            <Button variant="ghost" class="mr-auto" disabled={busy()} data-danil-step-browse="" onClick={() => setBrowsing(true)}>
              {t("shell.danilStep.browse")}
            </Button>
            <Button variant="secondary" disabled={busy()} data-danil-step-later="" onClick={later}>
              {t("shell.danilStep.later")}
            </Button>
            <Button disabled={busy() || !target()} data-danil-step-submit="" onClick={() => void submit()}>
              {t("shell.danilStep.doSync", { name: targetName() })}
            </Button>
          </div>
        </Show>
      </DialogContent>
    </Dialog>
  );
}
