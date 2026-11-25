import type { OrganizationState } from "../../../platform-client/src/organizations.ts";

export function organizationMenuReady(state: OrganizationState, grouped: boolean) {
  return !grouped && state.kind === "ready" && state.items.length > 0 ? state : null;
}
