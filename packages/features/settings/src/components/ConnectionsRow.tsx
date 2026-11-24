import type {
  McpAuditEntry,
  McpConnection,
  McpConnectionPatch,
} from "../../../../platform-client/src/connections.ts";
import type { ConnectionOrg, ConnectionWorkspace } from "../queries/engine-connections.ts";
import { createSignal, For, onCleanup, Show } from "solid-js";
import { t } from "../../../../ui/src/lib/i18n";
import { Badge } from "../../../../ui/src/Badge";
import { Button } from "../../../../ui/src/Button";
import { SettingsRow } from "../../../../ui/src/SettingsLayout";
import { ConnectionAccess } from "./ConnectionAccess";

const NO_RING = "outline-none focus:outline-none focus-visible:outline-none";

const stateTone = (state: McpConnection["state"]) =>
  state === "active" ? "success" : state === "needs_setup" ? "warning" : "neutral";

export function ConnectionRow(props: {
  connection: McpConnection;
  organizations: ConnectionOrg[];
  activeOrganizationId: string | null;
  workspaces: ConnectionWorkspace[];
  busy: boolean;
  onSave: (patch: McpConnectionPatch) => Promise<boolean>;
  onPause: () => void;
  onResume: () => void;
  onRevoke: () => void;
  onLoadAudit: () => Promise<McpAuditEntry[] | null>;
}) {
  const c = () => props.connection;
  const [auditOpen, setAuditOpen] = createSignal(false);
  const [auditLoading, setAuditLoading] = createSignal(false);
  const [auditItems, setAuditItems] = createSignal<McpAuditEntry[] | null>(null);
  let alive = true;
  let auditReq = 0;
  onCleanup(() => {
    alive = false;
    auditReq++;
  });

  const orgName = () => {
    const orgId = c().organization_id;
    if (!orgId) return null;
    return props.organizations.find((o) => o.id === orgId)?.name ?? orgId;
  };

  const summary = () => {
    if (c().state === "needs_setup") return t("settings.connections.needs_setup_hint");
    const org = orgName() ?? "—";
    const exclCount = c().exclusions.length;
    if (exclCount > 0) {
      return t("settings.connections.summary_n1_exclusions", { org, count: String(exclCount) });
    }
    return t("settings.connections.summary_n1", { org });
  };

  async function toggleAudit() {
    if (auditOpen()) {
      auditReq++;
      setAuditOpen(false);
      setAuditLoading(false);
      return;
    }
    const req = ++auditReq;
    setAuditOpen(true);
    setAuditLoading(true);
    try {
      const items = await props.onLoadAudit();
      if (!alive || req !== auditReq) return;
      setAuditItems(items);
    } finally {
      if (alive && req === auditReq) setAuditLoading(false);
    }
  }

  return (
    <div class="border-b border-border last:border-b-0">
      <SettingsRow
        class="border-b-0"
        label={
          <span class="flex items-center gap-2">
            {c().client_id}
            <Badge tone={stateTone(c().state)}>{t(`settings.connections.state.${c().state}`)}</Badge>
          </span>
        }
        description={summary()}
      >
        <div class="flex gap-2">
          <Button variant="ghost" size="sm" class={NO_RING} disabled={props.busy} onClick={() => void toggleAudit()}>
            {t("settings.connections.audit")}
          </Button>
          <Show when={c().state === "active"}>
            <Button variant="secondary" size="sm" class={NO_RING} disabled={props.busy} onClick={props.onPause}>
              {t("settings.connections.pause")}
            </Button>
          </Show>
          <Show when={c().state === "paused"}>
            <Button variant="secondary" size="sm" class={NO_RING} disabled={props.busy} onClick={props.onResume}>
              {t("settings.connections.resume")}
            </Button>
          </Show>
          <Show when={c().state !== "revoked"}>
            <Button variant="outline" size="sm" class={NO_RING} disabled={props.busy} onClick={props.onRevoke}>
              {t("settings.connections.revoke")}
            </Button>
          </Show>
        </div>
      </SettingsRow>
      <Show when={auditOpen()}>
        <div class="grid gap-1 pb-3 text-xs text-neutral-600">
          <Show when={auditLoading()}>
            <span>{t("settings.connections.loading")}</span>
          </Show>
          <Show when={!auditLoading() && auditItems() && auditItems()!.length === 0}>
            <span>{t("settings.connections.audit_empty")}</span>
          </Show>
          <Show when={!auditLoading() && auditItems() && auditItems()!.length > 0}>
            <For each={auditItems()!.slice(0, 10)}>
              {(entry) => (
                <div class="flex items-center justify-between gap-2 font-mono">
                  <span>{entry.action} (v{entry.version})</span>
                  <span class="text-neutral-500">{entry.occurred_at}</span>
                </div>
              )}
            </For>
          </Show>
        </div>
      </Show>
      <Show when={c().state !== "revoked"}>
        <ConnectionAccess
          connection={c()}
          organizations={props.organizations}
          activeOrganizationId={props.activeOrganizationId}
          workspaces={props.workspaces}
          busy={props.busy}
          onSave={props.onSave}
        />
      </Show>
    </div>
  );
}
