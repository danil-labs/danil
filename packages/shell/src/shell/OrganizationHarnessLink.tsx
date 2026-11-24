import ChevronRight from "lucide-solid/icons/chevron-right";
import { createMemo, createResource, createSignal, onCleanup, onMount, Show } from "solid-js";
import { openExternalTarget } from "../../../host/src/file-preview";
import { capabilities } from "../../../host/src/platform";
import { activeWorkspaceContext } from "../../../session/src/workspace-context";
import { t } from "../../../ui/src/lib/i18n";
import { canOpenOrganizationHarness, HARNESS_URL, type HarnessOrgInfo } from "./organization-harness";
import { sessionRailState } from "./session-groups";

type OrgSnapshot = {
  items: readonly HarnessOrgInfo[];
  active: string | null;
};

const HARNESS_ITEM =
  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-ui text-neutral-950 outline-none hover:bg-surface-muted focus-visible:bg-surface-muted";

/**
 * Entrada al Harness de la organización en el menú de perfil.
 * Se carga bajo demanda y solo aparece cuando el workspace abierto pertenece a una
 * organización y la persona es `owner` o `admin` en ella.
 */
export default function OrganizationHarnessLink(props: {
  workspace?: string | null;
  context?: string | null;
  onNavigate: () => void;
}) {
  const [orgs, setOrgs] = createSignal<OrgSnapshot | null>(null);
  const railGroups = () => sessionRailState()?.groups();
  const activeContext = () => props.context ?? activeWorkspaceContext();

  const [webGroup] = createResource(
    () => (!capabilities().nativeWindow && !railGroups()?.length ? capabilities().groupAccount : undefined),
    async (source) => {
      if (!source) return null;
      try {
        return await source.current();
      } catch {
        return null;
      }
    },
  );

  onMount(() => {
    const groups = railGroups();
    if (groups?.length && groups.every((g) => g.role && (g.org_type || g.personal !== undefined || g.plan))) return;
    let alive = true;
    let stop: (() => void) | undefined;
    onCleanup(() => { alive = false; stop?.(); });
    void capabilities().organizations?.().then(async (selection) => {
      if (!alive) return;
      const read = () => {
        const s = selection.state();
        setOrgs(s.kind === "ready" && !s.busy ? { items: s.items, active: s.active } : null);
      };
      stop = selection.subscribe(read);
      read();
      if (selection.state().kind !== "ready") await selection.load();
    }).catch(() => {});
  });

  const visible = createMemo(() =>
    canOpenOrganizationHarness({
      workspace: props.workspace,
      context: activeContext(),
      groups: railGroups(),
      webGroup: webGroup() ?? null,
      organizations: orgs()?.items ?? null,
      activeOrganizationId: orgs()?.active ?? null,
    }),
  );

  const abrir = (event: MouseEvent) => {
    props.onNavigate();
    if (!capabilities().nativeWindow) return;
    event.preventDefault();
    void openExternalTarget(HARNESS_URL).catch(() => {});
  };

  return (
    <Show when={visible()}>
      <div class="my-1 h-px bg-border" />
      <a
        href={HARNESS_URL}
        target="_blank"
        rel="noopener"
        class={HARNESS_ITEM}
        data-profile-harness=""
        onClick={abrir}
      >
        <span class="min-w-0 flex-1 truncate">{t("shell.profile.harness")}</span>
        <ChevronRight size={14} aria-hidden="true" class="shrink-0 text-neutral-500" />
      </a>
    </Show>
  );
}
