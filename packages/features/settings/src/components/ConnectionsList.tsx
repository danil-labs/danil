import type { McpConnection } from "../../../../platform-client/src/connections.ts";
import { MCP_URL } from "../model/connections.ts";
import { createResource, createSignal, For, Show } from "solid-js";
import { createCopied } from "../../../../host/src/clipboard";
import { t } from "../../../../ui/src/lib/i18n";
import {
  listConnectionAuditN1,
  loadConnectionsData,
  patchConnectionN1,
  revokeConnectionN1,
} from "../queries/engine-connections";
import { Button } from "../../../../ui/src/Button";
import { Dialog, DialogContent, DialogTitle } from "../../../../ui/src/Dialog";
import { EmptyState } from "../../../../ui/src/EmptyState";
import { SettingsPanel, SettingsSection } from "../../../../ui/src/SettingsLayout";
import { ConnectionRow } from "./ConnectionsRow";

const DOMAIN_ERROR_KEYS = new Set([
  "organization_unavailable",
  "relay_unavailable",
  "connection_revoked",
  "connection_needs_setup",
  "organization_mismatch",
  "organization_access_denied",
]);

function errorMessage(code: string | null): string {
  if (code && DOMAIN_ERROR_KEYS.has(code)) {
    return t(`settings.connections.error.${code}`);
  }
  return t("settings.connections.failed");
}

export default function Connections() {
  const [data, { refetch }] = createResource(loadConnectionsData);
  const [busy, setBusy] = createSignal<string | null>(null);
  const [failure, setFailure] = createSignal<string | null>(null);
  const [revoking, setRevoking] = createSignal<McpConnection | null>(null);
  const { copied, copy } = createCopied(2_000);

  const ready = () => {
    const d = data();
    return d?.ok ? d.data : null;
  };

  async function act<A extends { kind: string; code?: string }>(
    id: string,
    run: () => Promise<A>,
  ): Promise<A | null> {
    setBusy(id);
    setFailure(null);
    try {
      const answer = await run();
      if (answer.kind !== "ok") {
        setFailure(answer.code ?? answer.kind);
      } else {
        await refetch();
      }
      return answer;
    } catch {
      setFailure("error");
      return null;
    } finally {
      setBusy(null);
    }
  }

  return (
    <SettingsPanel>
      <SettingsSection
        title={t("settings.connections.title")}
        description={t("settings.connections.description")}
        aside={
          <Show when={ready()}>
            <Button variant="secondary" size="sm" onClick={() => void copy(MCP_URL)}>
              {copied() ? t("settings.connections.copied") : t("settings.connections.copy_url")}
            </Button>
          </Show>
        }
      >
        <Show when={failure()}>
          {(code) => (
            <p class="m-0 py-2 text-ui text-error-strong" role="alert">
              {errorMessage(code())}
            </p>
          )}
        </Show>
        <Show when={data.loading}>
          <p class="m-0 py-3 text-sm text-neutral-500">{t("settings.connections.loading")}</p>
        </Show>
        <Show
          when={(() => {
            const d = data();
            return d && !d.ok ? d : null;
          })()}
        >
          {(d) => (
            <div class="grid gap-3">
              <EmptyState
                title={
                  d().reason === "no_account"
                    ? t("settings.connections.unavailable")
                    : errorMessage(d().reason)
                }
                description={t("settings.connections.unavailable_hint")}
              />
              <Button variant="secondary" class="justify-self-start" onClick={() => void refetch()}>
                {t("settings.connections.retry")}
              </Button>
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
              <For each={d().connections.map((c) => c.id)}>
                {(id) => {
                  const connection = () => d().connections.find((c) => c.id === id)!;
                  return (
                    <ConnectionRow
                      connection={connection()}
                      organizations={d().organizations}
                      activeOrganizationId={d().activeOrganizationId}
                      workspaces={d().workspaces}
                      busy={busy() === id}
                      onSave={async (patch) => {
                        const answer = await act(id, () => patchConnectionN1(id, patch));
                        return answer?.kind === "ok";
                      }}
                      onPause={() => void act(id, () => patchConnectionN1(id, { action: "pause" }))}
                      onResume={() => void act(id, () => patchConnectionN1(id, { action: "resume" }))}
                      onRevoke={() => setRevoking(connection())}
                      onLoadAudit={async () => {
                        const res = await listConnectionAuditN1(id);
                        return res.kind === "ok" ? res.value : null;
                      }}
                    />
                  );
                }}
              </For>
            </Show>
          )}
        </Show>
      </SettingsSection>

      <Dialog
        open={revoking() !== null}
        onOpenChange={(open) => {
          if (!open) setRevoking(null);
        }}
      >
        <DialogContent>
          <DialogTitle>
            {t("settings.connections.revoke_title", { name: revoking()?.client_id ?? "" })}
          </DialogTitle>
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
                await act(c.id, () => revokeConnectionN1(c.id));
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
