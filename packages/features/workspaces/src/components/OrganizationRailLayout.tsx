import { type Accessor, createMemo, createSignal, type JSX, onCleanup, onMount, untrack } from "solid-js";
import { KeyedList } from "@danil/ui";
import { t } from "./i18n.ts";
import {
  type OrgPreference,
  orderedOrganizations,
  type RailOrganization,
  type SessionRailGroup,
  stackedOrganizations,
} from "./organization-rail-model.ts";

export type OrganizationAccessor = Accessor<RailOrganization>;
export type StackedAccessor = Accessor<boolean>;
export type OrganizationRenderer = (organization: OrganizationAccessor, stacked: StackedAccessor) => JSX.Element;

export function OrganizationRailLayout(props: {
  groups: readonly SessionRailGroup[];
  rows: readonly { id: string; name: string; logo: string | null }[];
  preference: OrgPreference;
  used: Readonly<Record<string, number>>;
  active: { workspace: string; context: string } | null;
  height?: number;
  render: OrganizationRenderer;
}) {
  let root: HTMLDivElement | undefined;
  const [measured, setMeasured] = createSignal(0);
  const groups = createMemo(() => orderedOrganizations(props.groups, props.rows, props.preference));
  const openOrg = createMemo(() => {
    const active = props.active;
    return active
      ? groups().find((org) =>
          org.tiles.some((tile) => tile.id === active.workspace && tile.context.context_id === active.context),
        )?.id ?? null
      : null;
  });
  const height = () => props.height ?? measured();
  const shape = createMemo(() =>
    JSON.stringify([height(), openOrg(), groups().map((org) => [org.id, org.pinned, org.tiles.map((tile) => tile.key)])]),
  );
  const collapsed = createMemo(() => {
    shape();
    return untrack(() => stackedOrganizations(groups(), height(), openOrg(), props.used));
  });

  onMount(() => {
    if (props.height !== undefined) return;
    const parent = root?.parentElement;
    if (!parent) return;
    const measure = () => {
      const siblings = [...parent.children].filter((element) => element !== root);
      const style = getComputedStyle(parent);
      const reserved = siblings.reduce((n, element) => n + element.getBoundingClientRect().height, 0);
      const padding = (Number.parseFloat(style.paddingTop) || 0) + (Number.parseFloat(style.paddingBottom) || 0);
      const gap = Number.parseFloat(style.rowGap) || 0;
      setMeasured(Math.max(0, parent.clientHeight - reserved - padding - siblings.length * gap));
    };
    const resize = new ResizeObserver(measure);
    resize.observe(parent);
    const children = new MutationObserver(measure);
    children.observe(parent, { childList: true });
    window.addEventListener("resize", measure);
    measure();
    onCleanup(() => {
      resize.disconnect();
      children.disconnect();
      window.removeEventListener("resize", measure);
    });
  });

  return (
    <div ref={root} class="flex w-full flex-col" data-organization-rail="">
      <KeyedList each={groups()} by={(org) => org.id}>
        {(org) => {
          const stacked = createMemo(() => collapsed().has(org().id));
          const contents = untrack(() => props.render(org, stacked));
          return (
            <div
              role="group"
              data-rail-organization={org().id}
              aria-label={`${org().name}${org().pinned ? t("shell.rail.pinned_suffix") : ""}`}
              class="flex w-full flex-col items-center gap-1"
              classList={{ "mt-3": groups()[0]?.id !== org().id }}
            >
              {contents}
            </div>
          );
        }}
      </KeyedList>
    </div>
  );
}
