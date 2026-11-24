import { createSignal, For, onMount, Show } from "solid-js";
import { t } from "../../../ui/src/lib/i18n";
import { capabilities } from "../../../host/src/platform";
import { Button } from "../../../ui/src/Button";
import { Dialog, DialogContent, DialogTitle } from "../../../ui/src/Dialog";
import { accountOfEngine, moveDestinations, moveWorkspace, type MoveAccount, type MoveDestination, type MoveGroup, type Send } from "./account-move";

const HARNESS = "https://harness.danil.ai/workspaces";

async function openHarness() {
  if (!capabilities().nativeWindow) {
    window.open(HARNESS, "_blank", "noopener,noreferrer");
    return;
  }
  const { callShellViewEngine } = await import("../../../session/src/shell-view-queries.ts");
  await callShellViewEngine("open_external", { target: HARNESS }).catch(() => {});
}

type Source = { context_id: string; org: string };

/** Lo del riel de sesiones que usa el diálogo: el riel entero lo cumple, y también el puerto de Configuración. */
type MoveSessions = { sessions: { send: Send }; groups: () => readonly MoveGroup[] | null | undefined; refresh: () => void };

/** El contexto donde el catálogo de la organización tiene el workspace, si se llama desde fuera del aviso. */
async function sourceOf(send: Send, groups: readonly Source[], engine: string, known: Source | undefined) {
  if (known) {
    const account = await accountOfEngine(send, known.context_id, engine).catch(() => null);
    return account ? { source: known, account } : null;
  }
  for (const group of groups) {
    const account = await accountOfEngine(send, group.context_id, engine).catch(() => null);
    if (account) return { source: { context_id: group.context_id, org: group.org }, account };
  }
  return null;
}

/** Mover un workspace adoptado: se pide con el contexto de origen y, si aquí se es admin del destino, se acepta con el suyo. */
export default function MoveWorkspaceDialog(props: {
  sessions: MoveSessions;
  workspace: { id: string; name: string };
  source?: Source;
  onClose: () => void;
}) {
  const [destinations, setDestinations] = createSignal<MoveDestination[] | null>(null);
  const [source, setSource] = createSignal<Source | null>(null);
  const [account, setAccount] = createSignal<MoveAccount | null>(null);
  const [target, setTarget] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const [done, setDone] = createSignal<"moved" | "pending" | null>(null);
  const [warning, setWarning] = createSignal<string | null>(null);
  const send = (context: string, method: string, path: string, body?: unknown, key?: string) => props.sessions.sessions.send(context, method, path, body, key);

  onMount(() => {
    void (async () => {
      try {
        const found = await sourceOf(send, props.sessions.groups() ?? [], props.workspace.id, props.source);
        if (!found) {
          setError(t("shell.workspaces.move.no_account"));
          setDestinations([]);
          return;
        }
        setSource(found.source);
        setAccount(found.account);
        const list = await moveDestinations(send, found.source, props.sessions.groups() ?? []);
        setDestinations(list);
        setTarget(list[0]?.org ?? "");
        if (!list.length) setError(t("shell.workspaces.move.no_destinations"));
      } catch (cause) {
        setError(t("shell.workspaces.move.failed", { cause: (cause as { detail?: string } | null)?.detail ?? "unavailable" }));
      }
    })();
  });

  async function submit() {
    const value = account(), from = source();
    const destination = destinations()?.find((d) => d.org === target());
    if (!value || !from || !destination || busy()) return;
    setBusy(true);
    setError("");
    try {
      const result = await moveWorkspace(send, value, from, destination);
      setWarning(result.warning);
      setDone(result.state);
      props.sessions.refresh();
    } catch (cause) {
      setError(t("shell.workspaces.move.failed", { cause: (cause as { detail?: string } | null)?.detail ?? "unavailable" }));
    } finally {
      setBusy(false);
    }
  }

  const destinationName = () => destinations()?.find((d) => d.org === target())?.name ?? target();
  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent class="flex flex-col gap-3" aria-label={t("shell.workspaces.move.title", { name: props.workspace.name })}>
        <DialogTitle class="text-sm font-semibold">{t("shell.workspaces.move.title", { name: props.workspace.name })}</DialogTitle>
        <Show when={!done()} fallback={<>
          <p role="status" class="m-0 text-sm">{t(done() === "moved" ? "shell.workspaces.move.moved" : "shell.workspaces.move.pending", { name: props.workspace.name, org: destinationName() })}</p>
          <Show when={warning()}>{(cause) => <p class="m-0 text-xs text-neutral-500">{t("shell.workspaces.move.pending_warning", { cause: cause() })}</p>}</Show>
          <div class="flex justify-end gap-2">
            <Show when={done() === "pending"}><Button size="sm" variant="secondary" onClick={() => void openHarness()}>{t("shell.workspaces.move.harness")}</Button></Show>
            <Button size="sm" onClick={props.onClose}>{t("shell.workspaces.move.cancel")}</Button>
          </div>
        </>}>
          <p class="m-0 text-xs text-neutral-500">{t("shell.workspaces.move.body", { org: destinationName() || "" })}</p>
          <Show when={destinations() === null}><p role="status" class="m-0 text-sm">{t("shell.workspaces.move.loading")}</p></Show>
          <Show when={destinations()?.length}>
            <fieldset class="grid gap-2" disabled={busy()}>
              <legend class="mb-2 text-xs font-medium">{t("shell.workspaces.move.destination")}</legend>
              <For each={destinations() ?? []}>{(destination) => (
                <label class="flex items-start gap-2 rounded-md border border-border p-2 text-sm">
                  <input type="radio" name="move-target" checked={target() === destination.org} onChange={() => setTarget(destination.org)} />
                  <span class="grid gap-0.5">
                    <span>{destination.name}</span>
                    <span class="text-xs text-neutral-500">{t(destination.immediate ? "shell.workspaces.move.immediate" : "shell.workspaces.move.request", { org: destination.name })}</span>
                  </span>
                </label>
              )}</For>
            </fieldset>
          </Show>
          <Show when={error()}>{(message) => <p role="alert" class="m-0 text-xs text-error-strong">{message()}</p>}</Show>
          <div class="flex justify-end gap-2">
            <Button size="sm" variant="secondary" onClick={props.onClose}>{t("shell.workspaces.move.cancel")}</Button>
            <Button size="sm" disabled={busy() || !target() || !account()} onClick={() => void submit()}>{t("shell.workspaces.move.submit")}</Button>
          </div>
        </Show>
      </DialogContent>
    </Dialog>
  );
}
