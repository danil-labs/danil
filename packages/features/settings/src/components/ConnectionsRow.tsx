import { type AccountWorkspace, type Computer, type ConnectionPatch, type ConnectionCapabilities, type Connection, webhookUrlOk } from "@terminus/computers";
import { createSignal, Show } from "solid-js";
import { createCopied } from "../../../../host/src/clipboard";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { Badge } from "../../../../ui/src/Badge";
import { Button } from "../../../../ui/src/Button";
import { Input } from "../../../../ui/src/Input";
import { SettingsRow } from "../../../../ui/src/SettingsLayout";
import { ConnectionAccess } from "./ConnectionAccess";

const stateTone = (state: Connection["state"]) =>
  state === "active" ? "success" : state === "pending" ? "warning" : "neutral";

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

export function ConnectionRow(props: {
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
