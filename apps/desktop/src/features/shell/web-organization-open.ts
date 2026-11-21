/**
 * Abrir en la web un workspace de otra organización de la misma persona (riel fijado y menú de
 * cuenta). Elegirlo con `workspaces/select` en la organización activa respondía 403 («No tienes
 * acceso a este recurso»): primero se elige dentro del contexto de su organización
 * (`picker.add`, con `X-Danil-Session`) y después se cambia la organización de la página
 * (`identity/organizations/select`), que recarga y entra con él.
 */
import type { OrganizationSelection } from "@terminus/computers";
import type { PickerRow, WorkspacePicker } from "../../web/workspace-picker.ts";

export type OrganizationOpenDeps = {
  me: string | undefined;
  picker?: Pick<WorkspacePicker, "catalog" | "add">;
  organizations?: () => Promise<OrganizationSelection>;
  /** La organización pide un login nuevo (SSO o MFA): la página va a él con esa organización. */
  reauth?: () => void;
};

/** `opening`: la página recarga con la organización nueva; `signing_in`: va al login de esa organización. */
export async function openInOrganization(target: { account_id: string; org: string; row?: PickerRow }, deps: OrganizationOpenDeps): Promise<"opening" | "signing_in"> {
  const selection = await deps.organizations?.();
  if (!selection) throw new Error("organization_selection_unavailable");
  // Sin contexto de esa organización en el catálogo, se entra a ella y abre su workspace activo.
  const row = target.row ?? (await deps.picker?.catalog())?.rows.find(r => r.account_id === target.account_id && r.org === target.org && r.sub === deps.me);
  if (row && deps.picker) await deps.picker.add(row);
  await selection.choose(target.org);
  const state = selection.state();
  if (state.kind === "ready" && state.error === "organization_auth_required" && deps.reauth) { deps.reauth(); return "signing_in"; }
  if (state.kind === "ready" && state.active === target.org && !state.error) return "opening";
  throw new Error(state.kind === "ready" && state.error ? state.error : "organization_not_selected");
}

/** Un workspace fijado del riel: de la organización activa, de otra organización de la misma persona o de otra cuenta. */
export function pinnedTarget(row: Pick<PickerRow, "sub" | "org">, me: string | undefined, active: string | null | undefined): "here" | "organization" | "account" {
  if (row.sub !== me) return "account";
  return row.org === active ? "here" : "organization";
}

/** Los workspaces por organización, la activa primero; las demás en el orden de la lista. */
export function groupByOrganization<T extends { org: string }>(rows: readonly T[], active: string | null): { org: string; rows: T[] }[] {
  const groups = new Map<string, T[]>();
  if (active && rows.some(r => r.org === active)) groups.set(active, []);
  for (const r of rows) { const group = groups.get(r.org); if (group) group.push(r); else groups.set(r.org, [r]); }
  return [...groups].map(([org, list]) => ({ org, rows: list }));
}
