import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { OrganizationRailLayout } from "../../src/features/shell/OrganizationRailLayout";
import { changeOrgPreference, parseOrgPreference } from "../../src/features/shell/organization-rail-model";

export function mountOrganizationLayout(root: HTMLElement, controlled = true) {
  let viewport = 100;
  if (!controlled) Object.defineProperty(root, "clientHeight", { configurable: true, get: () => viewport });
  const make = (org: string, context: string, ids: string[]) => ({ org, org_name: org, context_id: context, family: context, email: `${context}@example.com`, plan: "paid", person: context, available: ids.map((id) => ({ id, name: id })), added: new Set(ids) });
  const [groups, setGroups] = createSignal([make("a", "one", ["a1", "a2"]), make("a", "two", ["a3"]), make("b", "three", ["b1", "b2"])]);
  const [pref, setPref] = createSignal(parseOrgPreference({ version: 1, orgs: [{ org_id: "b", pinned: true }, { org_id: "a", pinned: false }] }));
  const [height, setHeight] = createSignal(500);
  const [active, setActive] = createSignal<{ workspace: string; context: string } | null>(null);
  const dispose = render(() => <OrganizationRailLayout groups={groups()} rows={groups().flatMap((group) => group.available.map((w) => ({ ...w, logo: null })))} preference={pref()} used={{ a: 1, b: 2 }} active={active()} height={controlled ? height() : undefined} render={(org, collapsed) => <div data-layout-stack={collapsed() ? org().id : undefined}>{org().tiles.map((tile) => <button data-layout-context={tile.context.context_id}>{tile.name}</button>)}</div>} />, root);
  return { dispose, height: (value: number) => { viewport = value; setHeight(value); window.dispatchEvent(new Event("resize")); }, active: setActive, add: () => setGroups((rows) => [...rows, make("c", "four", ["c1"])]), change: (id: string, action: "pin" | "up" | "down") => setPref((value) => changeOrgPreference(value, ["b", "a", "c"], id, action)) };
}
