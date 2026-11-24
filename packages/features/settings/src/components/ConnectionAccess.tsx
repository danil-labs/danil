import type {
  McpConnection,
  McpConnectionPatch,
  McpDestination,
} from "../../../../platform-client/src/connections.ts";
import type { ConnectionOrg, ConnectionWorkspace } from "../queries/engine-connections.ts";
import { createSignal, createUniqueId, For, onCleanup, Show } from "solid-js";
import { t } from "../../../../ui/src/lib/i18n";
import { Button } from "../../../../ui/src/Button";
import { Select } from "../../../../ui/src/Select";
import "../../../../ui/src/locales/settingsPhrases";

const NO_RING = "outline-none focus:outline-none focus-visible:outline-none";

type Props = {
  connection: McpConnection;
  organizations: ConnectionOrg[];
  activeOrganizationId: string | null;
  workspaces: ConnectionWorkspace[];
  busy: boolean;
  onSave: (patch: McpConnectionPatch) => Promise<boolean>;
};

export function ConnectionAccess(props: Props) {
  const [editing, setEditing] = createSignal(false);
  const [saved, setSaved] = createSignal(false);
  const id = createUniqueId();
  let trigger: HTMLButtonElement | undefined;
  function close() {
    setEditing(false);
    trigger?.focus();
  }
  return (
    <div class="grid gap-3 pb-4">
      <Button
        ref={trigger}
        variant="secondary"
        size="sm"
        class={`justify-self-start ${NO_RING}`}
        disabled={props.busy}
        aria-expanded={editing()}
        aria-controls={id}
        onClick={() => {
          setSaved(false);
          if (editing()) close();
          else setEditing(true);
        }}
      >
        {t("settings.connections.edit_access")}
      </Button>
      <Show when={editing()}>
        <div id={id}>
          <AccessEditor
            {...props}
            onClose={close}
            onSave={async (patch) => {
              const ok = await props.onSave(patch);
              if (ok) setSaved(true);
              return ok;
            }}
          />
        </div>
      </Show>
      <Show when={saved()}>
        <p class="m-0 text-ui text-neutral-500" role="status">
          {t("settings.connections.access_saved")}
        </p>
      </Show>
    </div>
  );
}

function AccessEditor(props: Props & { onClose: () => void }) {
  const initialOrg = () =>
    props.connection.organization_id ?? props.activeOrganizationId ?? props.organizations[0]?.id ?? "";
  const [orgId, setOrgId] = createSignal(initialOrg());
  const [excluded, setExcluded] = createSignal<Set<string>>(
    new Set(props.connection.exclusions.filter((e) => e.folder === "").map((e) => e.workspace)),
  );
  const [failed, setFailed] = createSignal(false);
  let alive = true;
  onCleanup(() => {
    alive = false;
  });

  const folderExclusions = () => props.connection.exclusions.filter((e) => e.folder !== "");

  function toggleWorkspace(wsId: string, included: boolean) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (included) next.delete(wsId);
      else next.add(wsId);
      return next;
    });
  }

  async function save() {
    const targetOrg = orgId().trim();
    if (!targetOrg) return;
    setFailed(false);
    const exclusions: McpDestination[] = [
      ...folderExclusions(),
      ...[...excluded()].map((workspace) => ({ workspace, folder: "" })),
    ];
    const ok = await props.onSave({ action: "configure", organization_id: targetOrg, exclusions });
    if (!alive) return;
    if (ok) props.onClose();
    else setFailed(true);
  }

  return (
    <div class="grid gap-3">
      <p class="m-0 text-ui text-neutral-500">{t("settings.connections.access_hint")}</p>
      <Show when={props.connection.organization_id === null}>
        <label class="grid gap-1 text-label text-neutral-500">
          {t("settings.connections.organization")}
          <Select
            class={`${NO_RING} focus-visible:border-border-strong`}
            value={orgId()}
            disabled={props.busy}
            onChange={(e) => setOrgId(e.currentTarget.value)}
          >
            <For each={props.organizations}>
              {(org) => <option value={org.id}>{org.name}</option>}
            </For>
          </Select>
        </label>
      </Show>
      <Show when={props.workspaces.length > 0}>
        <fieldset class="m-0 grid gap-2 rounded-md border border-border p-3" disabled={props.busy}>
          <legend class="px-1 text-label font-semibold text-neutral-950">
            {t("settings.connections.workspaces_scope")}
          </legend>
          <For each={props.workspaces}>
            {(ws) => (
              <label class="flex items-center gap-2 text-ui text-neutral-950">
                <input
                  type="checkbox"
                  class={NO_RING}
                  checked={!excluded().has(ws.id)}
                  onChange={(e) => toggleWorkspace(ws.id, e.currentTarget.checked)}
                />
                <span>{ws.name}</span>
              </label>
            )}
          </For>
        </fieldset>
      </Show>
      <Show when={failed()}>
        <p class="m-0 text-ui text-error-strong" role="alert">
          {t("settings.connections.failed")}
        </p>
      </Show>
      <div class="flex justify-end gap-2">
        <Button variant="secondary" class={NO_RING} disabled={props.busy} onClick={props.onClose}>
          {t("settings.connections.cancel")}
        </Button>
        <Button class={NO_RING} disabled={props.busy || !orgId().trim()} onClick={() => void save()}>
          {props.connection.state === "needs_setup"
            ? t("settings.connections.activate")
            : t("settings.connections.save_access")}
        </Button>
      </div>
    </div>
  );
}
