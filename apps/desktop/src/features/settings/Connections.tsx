import {
  type AccountWorkspace,
  type Computer,
  type ConnectionPatch,
  type ConnectionCapabilities,
  type Connection,
  PERMISSION_MODES,
  listComputers,
  listConnections,
  listWorkspaces,
  connectionCapabilities,
  mcpUrl,
  revokeConnection,
  updateConnection,
  webhookUrlOk,
} from "@terminus/computers";
import { createResource, createSignal, For, Show } from "solid-js";
import { createCopied } from "../../lib/clipboard";
import { t } from "../../lib/i18n";
import { invoke } from "../../lib/invoke.ts";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Dialog, DialogContent, DialogTitle } from "../../ui/Dialog";
import { EmptyState } from "../../ui/EmptyState";
import { Input } from "../../ui/Input";
import { Select } from "../../ui/Select";
import { SettingsPanel, SettingsRow, SettingsSection } from "./layout";
import { ConnectionAccess } from "./ConnectionAccess";
import { snippets } from "./orchestratorSnippets.ts";

/** `account_relay_token` (`proxy.rs`): el token de cliente de la cuenta y el plano de control. */
type ClientToken = { token: string; expires_at: number; endpoint: string };

type Loaded = { endpoint: string; connections: Connection[]; computers: Computer[]; workspaces: AccountWorkspace[]; capabilities: ConnectionCapabilities | null } | { failed: string };

async function token(): Promise<ClientToken> {
  return (await invoke("account_relay_token", {})) as ClientToken;
}

async function load(): Promise<Loaded> {
  try {
    const { token: tok, endpoint } = await token();
    const [connections, computers, workspaces, capabilities] = await Promise.all([listConnections(endpoint, tok), listComputers(endpoint, tok), listWorkspaces(endpoint, tok), connectionCapabilities(endpoint, tok)]);
    if (connections.kind !== "ok") return { failed: connections.kind };
    if (computers.kind !== "ok") return { failed: computers.kind };
    if (capabilities.kind !== "ok" && capabilities.kind !== "missing") return { failed: capabilities.kind };
    return { endpoint, capabilities: capabilities.kind === "ok" ? capabilities.value : null, connections: connections.value, computers: computers.value, workspaces: workspaces.kind === "ok" ? workspaces.value : [] };
  } catch {
    return { failed: "no_account" };
  }
}

const stateTone = (state: Connection["state"]) =>
  state === "active" ? "success" : state === "pending" ? "warning" : "neutral";

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
    return await invoke<LocalOrchestrator[]>("list_local_orchestrators", { workspace });
  } catch {
    // Un motor sin la extensión no conoce la orden: el apartado no aparece.
    return null;
  }
}

/** «En esta máquina»: orquestadores que corren aquí, sin cuenta de Danil. */
function LocalSection(props: { workspace: string | null }) {
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
      const made = await invoke<LocalOrchestrator>("local_orchestrator_connect", {
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
      await invoke("local_orchestrator_disconnect", { workspace: props.workspace, id: o.id });
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

export default function Connections(props: { workspace?: string | null }) {
  const [data, { refetch }] = createResource(load);
  const [busy, setBusy] = createSignal<string | null>(null);
  const [failure, setFailure] = createSignal<string | null>(null);
  const [revoking, setRevoking] = createSignal<Connection | null>(null);
  const { copied, copy } = createCopied(2_000);

  const ready = () => {
    const d = data();
    return d && !("failed" in d) ? d : null;
  };

  async function act<A extends { kind: string }>(id: string, run: (endpoint: string, tok: string) => Promise<A>): Promise<A | null> {
    setBusy(id);
    setFailure(null);
    try {
      const { token: tok, endpoint } = await token();
      const answer = await run(endpoint, tok);
      if (answer.kind !== "ok") setFailure(answer.kind);
      if (answer.kind === "ok") await refetch();
      return answer;
    } catch {
      setFailure("error");
      return null;
    } finally {
      setBusy(null);
    }
  }

  const machineName = (computers: Computer[], id: string) =>
    computers.find((c) => c.computer_id === id)?.name ?? id;

  return (
    <SettingsPanel>
      <LocalSection workspace={props.workspace ?? null} />
      <SettingsSection
        title={t("settings.connections.title")}
        description={t("settings.connections.description")}
        aside={
          <Show when={ready()}>
            {(d) => (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void copy(mcpUrl(d().endpoint))}
              >
                {copied() ? t("settings.connections.copied") : t("settings.connections.copy_url")}
              </Button>
            )}
          </Show>
        }
      >
        <Show when={failure()}>
          <p class="m-0 py-2 text-ui text-error-strong" role="alert">
            {t("settings.connections.failed")}
          </p>
        </Show>
        <Show when={data.loading}>
          <p class="m-0 py-3 text-sm text-neutral-500">{t("settings.connections.loading")}</p>
        </Show>
        <Show when={(() => { const d = data(); return d && "failed" in d ? d : null; })()}>
          {(d) => (
            <div class="grid gap-3">
              <EmptyState title={d().failed === "no_account" ? t("settings.connections.unavailable") : t("settings.connections.failed")}
                description={t("settings.connections.unavailable_hint")} />
              <Button variant="secondary" class="justify-self-start" onClick={() => void refetch()}>{t("settings.connections.retry")}</Button>
            </div>
          )}
        </Show>
        <Show when={ready()}>
          {(d) => (
            <Show
              when={d().connections.length > 0}
              fallback={
                <EmptyState
                  title={t("settings.connections.empty")}
                  description={t("settings.connections.empty_hint", { url: mcpUrl(d().endpoint) })}
                />
              }
            >
              <For each={d().connections.map(c => c.id)}>
                {(id) => {
                  const connection = () => d().connections.find(c => c.id === id)!;
                  return (
                  <ConnectionRow
                    connection={connection()}
                    computers={d().computers}
                    workspaces={d().workspaces}
                    capabilities={d().capabilities}
                    busy={busy() === id}
                    machineName={(id) => machineName(d().computers, id)}
                    onSave={async (patch) => {
                      const answer = await act(id, (e, tok) => updateConnection(e, tok, id, patch));
                      return answer?.kind === "ok" && answer.value?.id === id;
                    }}
                    onPause={() => act(id, (e, tok) => updateConnection(e, tok, id, { state: "paused" }))}
                    onResume={() => act(id, (e, tok) => updateConnection(e, tok, id, { state: "active" }))}
                    onRevoke={() => setRevoking(connection())}
                    onWebhook={async (webhook) => {
                      const answer = await act(id, (e, tok) => updateConnection(e, tok, id, { webhook }));
                      return answer?.kind === "ok" ? (answer.value?.webhook_secret ?? null) : null;
                    }}
                  />
                );
                }}
              </For>
            </Show>
          )}
        </Show>
      </SettingsSection>

      <Dialog open={revoking() !== null} onOpenChange={(open) => { if (!open) setRevoking(null); }}>
        <DialogContent>
          <DialogTitle>{t("settings.connections.revoke_title", { name: revoking()?.client_name ?? "" })}</DialogTitle>
          <p class="m-0 text-sm text-neutral-700">{t("settings.connections.revoke_body")}</p>
          <div class="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRevoking(null)}>
              {t("settings.connections.cancel")}
            </Button>
            <Button
              variant="danger"
              disabled={busy() !== null}
              onClick={async () => {
                const c = revoking();
                if (!c) return;
                await act(c.id, (e, tok) => revokeConnection(e, tok, c.id));
                setRevoking(null);
              }}
            >
              {t("settings.connections.revoke")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </SettingsPanel>
  );
}

/** El aviso firmado de respuestas de una conexión (`task.replied`); el secreto se ve una vez. */
function WebhookBlock(props: {
  connection: Connection;
  busy: boolean;
  onChange: (webhook: { url: string; rotate?: boolean } | null) => Promise<string | null>;
}) {
  const current = () => props.connection.webhook;
  const [editing, setEditing] = createSignal(false);
  const [url, setUrl] = createSignal("");
  const [secret, setSecret] = createSignal<string | null>(null);
  const { copied, copy } = createCopied(2_000);
  const valid = () => webhookUrlOk(url().trim());

  async function save(webhook: { url: string; rotate?: boolean } | null) {
    const made = await props.onChange(webhook);
    if (made) setSecret(made);
    setEditing(false);
    setUrl("");
  }

  return (
    <div class="grid gap-2 pb-4">
      <div class="flex min-w-0 items-center gap-3">
        <span class="text-xs font-semibold text-neutral-700">{t("settings.connections.webhook.title")}</span>
        <span class="min-w-0 flex-1 truncate font-mono text-xs text-neutral-500">
          {current()?.url ?? t("settings.connections.webhook.none")}
        </span>
        <Show when={!editing()}>
          <Button variant="ghost" size="compact" disabled={props.busy} onClick={() => (setUrl(current()?.url ?? ""), setEditing(true))}>
            {current() ? t("settings.connections.webhook.change") : t("settings.connections.webhook.add")}
          </Button>
          <Show when={current()}>
            {(hook) => (
              <>
                <Button variant="ghost" size="compact" disabled={props.busy} onClick={() => save({ url: hook().url, rotate: true })}>
                  {t("settings.connections.webhook.rotate")}
                </Button>
                <Button variant="ghost" size="compact" disabled={props.busy} onClick={() => save(null)}>
                  {t("settings.connections.webhook.remove")}
                </Button>
              </>
            )}
          </Show>
        </Show>
      </div>
      <Show when={editing()}>
        <div class="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-start">
          <div class="grid gap-1">
            <Input
              value={url()}
              placeholder="https://"
              aria-label={t("settings.connections.webhook.title")}
              onInput={(e) => setUrl(e.currentTarget.value)}
            />
            <Show when={url().trim() && !valid()}>
              <span class="text-xs text-error-strong">{t("settings.connections.webhook.invalid")}</span>
            </Show>
          </div>
          <Button size="sm" disabled={props.busy || !valid()} onClick={() => save({ url: url().trim() })}>
            {t("settings.connections.webhook.save")}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setEditing(false)}>
            {t("settings.connections.cancel")}
          </Button>
        </div>
        <p class="m-0 text-xs text-neutral-500">{t("settings.connections.webhook.hint")}</p>
      </Show>
      <Show when={secret()}>
        {(value) => (
          <div class="grid gap-1 rounded-md border border-border bg-surface-muted px-3 py-2" role="status">
            <span class="text-xs font-semibold text-neutral-950">{t("settings.connections.webhook.secret_title")}</span>
            <div class="flex items-center gap-2">
              <code class="min-w-0 flex-1 truncate font-mono text-xs text-neutral-950">{value()}</code>
              <Button
                variant="ghost"
                size="compact"
                onClick={() => void copy(value())}
              >
                {copied() ? t("settings.connections.copied") : t("settings.connections.local.copy")}
              </Button>
              <Button variant="ghost" size="compact" onClick={() => setSecret(null)}>
                {t("settings.connections.webhook.done")}
              </Button>
            </div>
            <span class="text-xs text-neutral-500">{t("settings.connections.webhook.secret_hint")}</span>
          </div>
        )}
      </Show>
    </div>
  );
}

function ConnectionRow(props: {
  connection: Connection;
  computers: Computer[];
  workspaces: AccountWorkspace[];
  capabilities: ConnectionCapabilities | null;
  busy: boolean;
  machineName: (id: string) => string;
  onSave: (patch: ConnectionPatch) => Promise<boolean>;
  onPause: () => void;
  onResume: () => void;
  onRevoke: () => void;
  /** Cambia el webhook; devuelve el secreto si se creó o se rotó. */
  onWebhook: (webhook: { url: string; rotate?: boolean } | null) => Promise<string | null>;
}) {
  const c = () => props.connection;

  const summary = () => {
    if (c().state === "pending") return t("settings.connections.pending_hint");
    const where = c().machines.map((m) => `${props.machineName(m.computer_id)} / ${props.workspaces.find(w => w.id === m.workspace)?.name ?? m.workspace}`).join(", ");
    return t("settings.connections.summary", {
      machines: where || "—",
      mode: t(`settings.connections.mode.${c().permission_mode ?? "manual"}`),
      today: String(c().usage.tasks_created),
    });
  };

  return (
    <div class="border-b border-border last:border-b-0">
      <SettingsRow
        class="border-b-0"
        label={
          <span class="flex items-center gap-2">
            {c().client_name}
            <Badge tone={stateTone(c().state)}>{t(`settings.connections.state.${c().state}`)}</Badge>
          </span>
        }
        description={summary()}
      >
        <div class="flex gap-2">
          <Show when={c().state === "active"}>
            <Button variant="secondary" size="sm" disabled={props.busy} onClick={props.onPause}>
              {t("settings.connections.pause")}
            </Button>
          </Show>
          <Show when={c().state === "paused"}>
            <Button variant="secondary" size="sm" disabled={props.busy} onClick={props.onResume}>
              {t("settings.connections.resume")}
            </Button>
          </Show>
          <Button variant="outline" size="sm" disabled={props.busy} onClick={props.onRevoke}>
            {t("settings.connections.revoke")}
          </Button>
        </div>
      </SettingsRow>
      <Show when={c().state === "active" || c().state === "paused"}>
        <WebhookBlock connection={c()} busy={props.busy} onChange={props.onWebhook} />
      </Show>
      <Show when={c().state !== "revoked"}>
        <ConnectionAccess connection={c()} computers={props.computers} workspaces={props.workspaces}
          busy={props.busy} capabilities={props.capabilities} onSave={props.onSave} />
      </Show>
    </div>
  );
}
