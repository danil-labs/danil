import type { AccountWorkspace, Computer } from "../../../../platform-client/src/api.ts";
import type { Connection, ConnectionCapabilities } from "../../../../platform-client/src/connections.ts";
import { MCP_URL } from "../model/connections.ts";
import { createResource, createSignal, For, Show } from "solid-js";
import { createCopied } from "../../../../host/src/clipboard";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { accountRelayToken, connectionCapabilities, listComputers, listConnections, revokeConnection, updateConnection } from "../queries/engine-connections";
import { Button } from "../../../../ui/src/Button";
import { Dialog, DialogContent, DialogTitle } from "../../../../ui/src/Dialog";
import { EmptyState } from "../../../../ui/src/EmptyState";
import { SettingsPanel, SettingsSection } from "../../../../ui/src/SettingsLayout";
import { ConnectionRow } from "./ConnectionsRow";

/** `account_relay_token` (`proxy.rs`): el token de cliente de la cuenta y el plano de control. */
type ClientToken = { token: string; expires_at: number; endpoint: string };

type Loaded = { connections: Connection[]; computers: Computer[]; workspaces: AccountWorkspace[]; capabilities: ConnectionCapabilities | null } | { failed: string };

async function token(): Promise<ClientToken> {
  return (await accountRelayToken({})) as ClientToken;
}

async function load(): Promise<Loaded> {
  try {
    const { token: tok, endpoint } = await token();
    const [connections, computers, capabilities] = await Promise.all([listConnections(endpoint, tok), listComputers(endpoint, tok), connectionCapabilities(endpoint, tok)]);
    if (connections.kind !== "ok") return { failed: connections.kind };
    if (computers.kind !== "ok") return { failed: computers.kind };
    if (capabilities.kind !== "ok" && capabilities.kind !== "missing") return { failed: capabilities.kind };
    return { capabilities: capabilities.kind === "ok" ? capabilities.value : null, connections: connections.value, computers: computers.value, workspaces: [] };
  } catch {
    return { failed: "no_account" };
  }
}

export default function Connections() {
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
      <SettingsSection
        title={t("settings.connections.title")}
        description={t("settings.connections.description")}
        aside={
          <Show when={ready()}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void copy(MCP_URL)}
            >
              {copied() ? t("settings.connections.copied") : t("settings.connections.copy_url")}
            </Button>
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
                  description={t("settings.connections.empty_hint", { url: MCP_URL })}
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
