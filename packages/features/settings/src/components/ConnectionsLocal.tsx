import { PERMISSION_MODES } from "@terminus/computers";
import { createResource, createSignal, For, Show } from "solid-js";
import { createCopied } from "../../../../host/src/clipboard";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { localOrchestratorConnect, localOrchestratorDisconnect } from "../queries/engine-connections";
import { listLocalOrchestrators } from "../queries/engine-misc";
import { Badge } from "../../../../ui/src/Badge";
import { Button } from "../../../../ui/src/Button";
import { Dialog, DialogContent, DialogTitle } from "../../../../ui/src/Dialog";
import { Input } from "../../../../ui/src/Input";
import { Select } from "../../../../ui/src/Select";
import { SettingsRow, SettingsSection } from "../../../../ui/src/SettingsLayout";
import { snippets } from "../model/orchestratorSnippets.ts";

/** Un orquestador de esta máquina (`list_local_orchestrators`, extensión del motor). */
type LocalOrchestrator = {
  id: string;
  label: string;
  task_id: string;
  permission_mode: string | null;
  created_at: number;
  active: boolean;
  credential_file: string;
  credential_env?: string;
  cli: string | null;
};

async function loadLocal(workspace: string | null): Promise<LocalOrchestrator[] | null> {
  if (!workspace) return null;
  try {
    return await listLocalOrchestrators<LocalOrchestrator[]>({ workspace });
  } catch {
    // Un motor sin la extensión no conoce la orden: el apartado no aparece.
    return null;
  }
}

/** «En esta máquina»: orquestadores que corren aquí, sin cuenta de Danil. */
export function LocalSection(props: { workspace: string | null }) {
  const [rows, { refetch }] = createResource(() => props.workspace, loadLocal);
  const [label, setLabel] = createSignal("");
  const [mode, setMode] = createSignal<string>("manual");
  const [busy, setBusy] = createSignal(false);
  const [failed, setFailed] = createSignal(false);
  const [open, setOpen] = createSignal<string | null>(null);
  const { copied, copy } = createCopied<string>(2_000);
  const [removing, setRemoving] = createSignal<LocalOrchestrator | null>(null);

  async function connect() {
    setBusy(true);
    setFailed(false);
    try {
      const made = await localOrchestratorConnect<LocalOrchestrator>({
        workspace: props.workspace,
        label: label().trim(),
        permissionMode: mode(),
      });
      setLabel("");
      await refetch();
      setOpen(made.id);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  async function disconnect(o: LocalOrchestrator) {
    setBusy(true);
    setFailed(false);
    try {
      await localOrchestratorDisconnect({ workspace: props.workspace, id: o.id });
      await refetch();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
      setRemoving(null);
    }
  }

  return (
    <Show when={rows() !== null && rows() !== undefined}>
      <SettingsSection title={t("settings.connections.local.title")} description={t("settings.connections.local.description")}>
        <Show when={failed()}>
          <p class="m-0 py-2 text-ui text-error-strong" role="alert">
            {t("settings.connections.failed")}
          </p>
        </Show>
        <For each={rows() ?? []}>
          {(o) => (
            <div class="border-b border-border last:border-b-0">
              <SettingsRow
                class="border-b-0"
                label={
                  <span class="flex items-center gap-2">
                    {o.label}
                    <Badge tone={o.active ? "success" : "neutral"}>
                      {o.active ? t("settings.connections.state.active") : t("settings.connections.local.inactive")}
                    </Badge>
                  </span>
                }
                description={t(`settings.connections.mode.${o.permission_mode ?? "manual"}`)}
              >
                <div class="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setOpen(open() === o.id ? null : o.id)}>
                    {t("settings.connections.local.setup")}
                  </Button>
                  <Button variant="outline" size="sm" disabled={busy()} onClick={() => setRemoving(o)}>
                    {t("settings.connections.local.disconnect")}
                  </Button>
                </div>
              </SettingsRow>
              <Show when={open() === o.id}>
                <div class="grid gap-3 pb-4">
                  <p class="m-0 text-xs text-neutral-500">{t("settings.connections.local.setup_hint")}</p>
                  <For each={snippets(o)}>
                    {(snippet) => (
                      <div class="grid gap-1">
                        <div class="flex items-center justify-between">
                          <span class="text-xs font-semibold text-neutral-700">{t(`settings.connections.local.snippet.${snippet.id}`)}</span>
                          <Button
                            variant="ghost"
                            size="compact"
                            onClick={() => void copy(snippet.text, `${o.id}:${snippet.id}`)}
                          >
                            {copied() === `${o.id}:${snippet.id}` ? t("settings.connections.copied") : t("settings.connections.local.copy")}
                          </Button>
                        </div>
                        <pre class="m-0 overflow-x-auto rounded-md border border-border bg-surface-muted px-3 py-2 font-mono text-xs text-neutral-950">{snippet.text}</pre>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </div>
          )}
        </For>
        <div class="grid gap-3 pt-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label class="grid gap-1 text-xs text-neutral-500">
            {t("settings.connections.local.name")}
            <Input
              value={label()}
              maxLength={80}
              placeholder={t("settings.connections.local.name_placeholder")}
              onInput={(e) => setLabel(e.currentTarget.value)}
            />
          </label>
          <label class="grid gap-1 text-xs text-neutral-500">
            {t("settings.connections.permissions")}
            <Select value={mode()} onChange={(e) => setMode(e.currentTarget.value)}>
              <For each={PERMISSION_MODES}>{(m) => <option value={m}>{t(`settings.connections.mode.${m}`)}</option>}</For>
            </Select>
          </label>
          <Button size="sm" disabled={busy() || !label().trim()} onClick={connect}>
            {t("settings.connections.local.connect")}
          </Button>
        </div>
      </SettingsSection>
      <Dialog open={removing() !== null} onOpenChange={(open) => { if (!open) setRemoving(null); }}>
        <DialogContent>
          <DialogTitle>{t("settings.connections.local.disconnect_title", { name: removing()?.label ?? "" })}</DialogTitle>
          <p class="m-0 text-sm text-neutral-700">{t("settings.connections.local.disconnect_body")}</p>
          <div class="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRemoving(null)}>
              {t("settings.connections.cancel")}
            </Button>
            <Button variant="danger" disabled={busy()} onClick={() => { const o = removing(); if (o) void disconnect(o); }}>
              {t("settings.connections.local.disconnect")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Show>
  );
}
