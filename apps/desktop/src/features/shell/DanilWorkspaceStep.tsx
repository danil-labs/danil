import { type DirectoryEntry, groupDirectory } from "@terminus/computers";
import ArrowLeft from "lucide-solid/icons/arrow-left";
import ChevronRight from "lucide-solid/icons/chevron-right";
import Link from "lucide-solid/icons/link";
import LogIn from "lucide-solid/icons/log-in";
import Plus from "lucide-solid/icons/plus";
import { createEffect, createSignal, For, on, Show } from "solid-js";
import { t } from "../../lib/i18n";
import { Button } from "../../ui/Button";
import { Dialog, DialogContent, DialogTitle } from "../../ui/Dialog";
import { createWorkspaces } from "../settings/workspaces-store";
import { directoryErrorText } from "./directory-errors";
import {
  createForActiveWorkspace,
  danilWorkspaceStepDismissed,
  directory,
  dismissDanilWorkspaceStep,
  enterable,
  enterDirectoryEntry,
  linkableAccounts,
  linkActiveWorkspace,
  signedInCount,
  unlinkedActive,
} from "./workspace-directory";

const OPTION =
  "flex w-full items-center gap-2.5 rounded-md border border-border px-3 py-2 text-left text-ui outline-none hover:bg-surface-muted focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50";

/**
 * El paso del workspace de Danil al terminar de iniciar sesión en la ventana: si el
 * workspace abierto es de la persona y no está enlazado, ofrece enlazarlo con un
 * workspace de Danil que administra, crear uno con este, entrar a otro o dejarlo.
 * «Ahora no» no vuelve a preguntar por ese workspace. Enlazar o crear lo decide el
 * plano de control; aquí solo se ofrece lo que el directorio dice.
 */
export default function DanilWorkspaceStep(props: { onOpenAgents?: () => void }) {
  const ws = createWorkspaces();
  const [open, setOpen] = createSignal(false);
  const [view, setView] = createSignal<"choose" | "enter">("choose");
  const [busy, setBusy] = createSignal<string | null>(null);
  const [failure, setFailure] = createSignal<string | null>(null);
  // Una sesión recién abierta espera a que el directorio relea antes de decidir.
  const [pending, setPending] = createSignal(false);
  createEffect(on(signedInCount, (n) => n > 0 && setPending(true), { defer: true }));
  createEffect(() => {
    if (!pending() || !directory()) return;
    const active = ws.activo();
    if (!active) return;
    setPending(false);
    if (unlinkedActive(active) && !danilWorkspaceStepDismissed(active)) {
      setView("choose");
      setFailure(null);
      setOpen(true);
    }
  });
  // Enlazado por otro camino (el menú, otra ventana): el paso ya no tiene qué preguntar.
  createEffect(() => {
    if (open() && view() === "choose" && directory() && !busy() && !unlinkedActive(ws.activo())) setOpen(false);
  });

  const name = () => ws.actual()?.name ?? "";
  const run = async (key: string, action: (active: string) => Promise<string | null>) => {
    const active = ws.activo();
    if (!active || busy()) return;
    setBusy(key);
    setFailure(null);
    const code = await action(active);
    setBusy(null);
    if (code) {
      setFailure(code);
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
  const others = () =>
    (directory()?.workspaces ?? []).filter((e) => e.workspace_id !== ws.activo() && enterable(e, ws));
  const enter = (entry: DirectoryEntry) => {
    setOpen(false);
    enterDirectoryEntry(entry, ws, props.onOpenAgents);
  };
  const groupTitle = (group: ReturnType<typeof groupDirectory>[number]) => {
    if (group.kind === "organization") return group.name;
    if (group.kind === "personal") return t("shell.directory.personal");
    return group.kind === "support" ? t("shell.directory.support") : t("shell.directory.unlinked");
  };

  return (
    <Dialog open={open()} onOpenChange={(next) => !next && setOpen(false)}>
      <DialogContent class="max-w-[460px]" data-danil-workspace-step={view()}>
        <Show
          when={view() === "choose"}
          fallback={
            <>
              <div class="flex items-center gap-1.5">
                <button
                  type="button"
                  class="grid size-7 shrink-0 place-items-center rounded-sm text-neutral-500 outline-none hover:bg-neutral-200 hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary"
                  aria-label={t("shell.danilStep.back")}
                  onClick={() => setView("choose")}
                >
                  <ArrowLeft size={15} aria-hidden="true" />
                </button>
                <DialogTitle class="m-0 text-lead font-semibold">{t("shell.danilStep.enterTitle")}</DialogTitle>
              </div>
              <div class="mt-3 max-h-80 overflow-y-auto" data-danil-step-others="">
                <Show when={others().length} fallback={<p class="m-0 text-ui text-neutral-500">{t("shell.danilStep.enterEmpty")}</p>}>
                  <For each={groupDirectory(others())}>
                    {(group) => (
                      <>
                        <p class="m-0 truncate px-1 pt-2 pb-1 text-caption text-neutral-500">{groupTitle(group)}</p>
                        <For each={group.entries}>
                          {(entry) => (
                            <button
                              type="button"
                              class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-ui outline-none hover:bg-surface-muted focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary"
                              data-danil-step-enter={entry.key}
                              onClick={() => enter(entry)}
                            >
                              <span class="min-w-0 flex-1 truncate">{entry.name || t("shell.directory.unnamed")}</span>
                              <Show when={!entry.capabilities.terminus}>
                                <span class="shrink-0 text-caption text-neutral-500">{t("shell.danilStep.agentsOnly")}</span>
                              </Show>
                              <ChevronRight size={14} aria-hidden="true" class="shrink-0 text-neutral-500" />
                            </button>
                          )}
                        </For>
                      </>
                    )}
                  </For>
                </Show>
              </div>
            </>
          }
        >
          <DialogTitle class="m-0 text-lead font-semibold">{t("shell.danilStep.title")}</DialogTitle>
          <p class="m-0 mt-1.5 text-ui text-neutral-500">{t("shell.danilStep.hint", { workspace: name() })}</p>
          <div class="mt-4 flex flex-col gap-2">
            <For each={linkableAccounts(ws.activo())}>
              {(account) => (
                <button
                  type="button"
                  class={OPTION}
                  disabled={busy() !== null}
                  data-danil-step-link={account.key}
                  onClick={() => void run(account.key, (active) => linkActiveWorkspace(active, account))}
                >
                  <Link size={15} aria-hidden="true" class="shrink-0 text-neutral-500" />
                  <span class="min-w-0 flex-1 truncate">{t("shell.danilStep.link", { name: account.name || t("shell.directory.unnamed") })}</span>
                </button>
              )}
            </For>
            <button
              type="button"
              class={OPTION}
              disabled={busy() !== null}
              data-danil-step-create=""
              onClick={() => void run("create", createForActiveWorkspace)}
            >
              <Plus size={15} aria-hidden="true" class="shrink-0 text-neutral-500" />
              <span class="flex min-w-0 flex-1 flex-col">
                <span class="truncate">{t("shell.danilStep.create")}</span>
                <span class="text-caption text-neutral-500">{t("shell.danilStep.createHint", { workspace: name() })}</span>
              </span>
            </button>
            <button
              type="button"
              class={OPTION}
              disabled={busy() !== null}
              data-danil-step-other=""
              onClick={() => setView("enter")}
            >
              <LogIn size={15} aria-hidden="true" class="shrink-0 text-neutral-500" />
              <span class="min-w-0 flex-1 truncate">{t("shell.danilStep.enter")}</span>
              <ChevronRight size={14} aria-hidden="true" class="shrink-0 text-neutral-500" />
            </button>
          </div>
          <Show when={failure()}>
            {(code) => (
              <p class="m-0 mt-3 text-ui text-error-strong" role="alert">
                {directoryErrorText(code())}
              </p>
            )}
          </Show>
          <div class="mt-4 flex justify-end">
            <Button variant="secondary" disabled={busy() !== null} data-danil-step-later="" onClick={later}>
              {t("shell.danilStep.later")}
            </Button>
          </div>
        </Show>
      </DialogContent>
    </Dialog>
  );
}
