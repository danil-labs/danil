import { createMemo, createResource, createSignal, For, Show } from "solid-js";
import { t } from "../../lib/i18n";
import { capabilities } from "../../lib/platform";
import { ITEM_DE_MENU } from "../../ui/Popover";
import { Spinner } from "../../ui/Spinner";
import { webOrganizationDeps } from "./web-organization-deps";
import { groupByOrganization, openInOrganization } from "./web-organization-open";

type Session = NonNullable<ReturnType<typeof capabilities>["webWorkspaces"]>;
type Row = ReturnType<Session["rows"]>[number];

/**
 * «Workspaces» del menú de cuenta en la web, agrupados por organización. Uno de otra organización
 * cambia primero a ella y luego se abre: elegirlo en la activa daba la pantalla de 403.
 */
export function WebWorkspaceMenuList(props: { session: Session; close: () => void }) {
  const [names] = createResource(async () => {
    const state = (await capabilities().organizations?.().catch(() => undefined))?.state();
    return new Map(state?.kind === "ready" ? state.items.map(org => [org.id, org.name]) : []);
  });
  const [opening, setOpening] = createSignal<string | null>(null);
  const [failed, setFailed] = createSignal(false);
  const active = () => props.session.organization?.() ?? null;
  const groups = createMemo(() => groupByOrganization(props.session.rows(), active()));
  async function open(row: Row) {
    if (opening()) return;
    setFailed(false);
    if (!props.session.organization || row.org === active()) { props.close(); props.session.choose(row.id); return; }
    setOpening(row.id);
    try { await openInOrganization({ account_id: row.id, org: row.org }, webOrganizationDeps()); return; } // La página recarga o va al login: el indicador sigue.
    catch { setFailed(true); }
    setOpening(null);
  }
  return <>
    <p class="m-0 px-2 pt-1 text-caption font-medium text-neutral-500">{t("web.platform.workspaces")}</p>
    <For each={groups()}>{group => <>
      <Show when={groups().length > 1}><p data-web-workspace-org={group.org} class="m-0 px-2 pt-1.5 text-caption text-neutral-500">{names()?.get(group.org) ?? t("web.platform.other_organization")}</p></Show>
      <For each={group.rows}>{row => <button type="button" class={ITEM_DE_MENU} data-web-workspace={row.id} data-web-workspace-org-of={row.org} aria-pressed={props.session.active() === row.id} aria-busy={opening() === row.id}
        disabled={props.session.busy() || props.session.uncertain() || opening() !== null} onClick={() => void open(row)}>
        <span class="min-w-0 flex-1 truncate text-left">{row.name}</span>
        <Show when={opening() === row.id}><Spinner size={14} label={t("web.platform.switching_organization")} /></Show>
      </button>}</For>
    </>}</For>
    <Show when={failed()}><p role="alert" class="m-0 px-2 py-1 text-caption text-error-strong">{t("web.platform.switch_failed")}</p></Show>
  </>;
}
