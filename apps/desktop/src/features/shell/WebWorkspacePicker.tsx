import { createResource, createSignal, For, Match, Show, Switch } from "solid-js";
import { t } from "../../lib/i18n";
import { ITEM_DE_MENU } from "../../ui/Popover";
import type { WorkspacePicker } from "../../web/workspace-picker";
import type { PlatformWorkspace } from "../../web/platform-workspaces";

const note = "m-0 px-2 py-1.5 text-caption text-neutral-500";

export function WebWorkspacePicker(props: { picker: WorkspacePicker; initial: string | null }) {
  const [organization, setOrganization] = createSignal(props.initial);
  const [organizations, orgActions] = createResource(() => props.picker.organizations());
  const [workspaces, workspaceActions] = createResource(organization, org => props.picker.catalog(org));
  const [saving, setSaving] = createSignal(false);
  const [failedAdd, setFailedAdd] = createSignal(false);
  const empty = (key: string) => <>
    <p role="status" class={note} data-picker-empty="">{t(key)}</p>
  </>;
  const loading = () => <p role="status" class={note}>{t("shell.workspaces.danil_loading")}</p>;
  const error = (retry: () => unknown) => <>
    <p role="alert" data-picker-error="" class={note}>{t("shell.workspaces.catalog_error")}</p>
    <button type="button" data-picker-retry="" role="menuitem" class={ITEM_DE_MENU} onClick={() => void retry()}>{t("common.part.retry")}</button>
  </>;
  async function add(row: PlatformWorkspace) {
    const org = organization();
    if (!org || saving()) return;
    setSaving(true); setFailedAdd(false);
    try { await props.picker.add(org, row.id); }
    catch { setFailedAdd(true); }
    finally { setSaving(false); }
  }
  return <div data-web-workspace-picker="">
    <Show when={organization()} fallback={<>
      <p class={note}>{t("shell.workspaces.choose_org")}</p>
      <Switch>
        <Match when={organizations.loading}>{loading()}</Match>
        <Match when={organizations.error}>{error(orgActions.refetch)}</Match>
        <Match when={organizations()?.items.length}><For each={organizations()?.items}>{group =>
          <button type="button" role="menuitem" data-picker-org={group.id} class={ITEM_DE_MENU} onClick={() => setOrganization(group.id)}>{group.name}</button>
        }</For></Match>
        <Match when={true}>{empty("shell.workspaces.no_authorized_orgs")}</Match>
      </Switch>
    </>}>
      <button type="button" role="menuitem" class={ITEM_DE_MENU} disabled={saving()} onClick={() => { setFailedAdd(false); setOrganization(null); }}>{t("shell.workspaces.choose_org")}</button>
      <p class={note}>{(organizations.error ? undefined : organizations.latest)?.items.find(group => group.id === organization())?.name}</p>
      <Show when={failedAdd()}><p role="alert" class={note}>{t("shell.workspaces.add_failed")}</p></Show>
      <Switch>
        <Match when={workspaces.loading}>{loading()}</Match>
        <Match when={workspaces.error}>{error(workspaceActions.refetch)}</Match>
        <Match when={workspaces()?.length}><div class="max-h-64 overflow-y-auto"><For each={workspaces()}>{row =>
          <button type="button" role="menuitem" data-picker-workspace={row.id} disabled={saving() || !row.engine_workspace_id} class={ITEM_DE_MENU} onClick={() => void add(row)}>
            <span class="flex min-w-0 flex-col text-left"><span class="truncate">{row.name}</span><span class="text-caption text-neutral-500">{row.engine_workspace_id ? row.engine_workspace_id + " · " : ""}{row.id}</span></span>
          </button>
        }</For></div></Match>
        <Match when={true}>{empty("shell.workspaces.no_workspace_here")}</Match>
      </Switch>
    </Show>
    <Show when={!saving()}><a role="menuitem" data-picker-account="" class={ITEM_DE_MENU} href={props.picker.accountLoginUrl}>{t("shell.workspaces.other_login")}</a></Show>
  </div>;
}
