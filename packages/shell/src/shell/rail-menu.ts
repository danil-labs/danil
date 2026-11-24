import { capabilities } from "../../../host/src/platform.ts";
import { openNativeExternal } from "../../../host/src/native-workspace-add-link.ts";
import { invoke } from "../../../engine-client/src/client.ts";

export const RAIL_MENU_ITEM =
  "block w-full rounded-sm px-2 py-1.5 text-left text-ui text-neutral-950 outline-none hover:bg-surface-muted focus-visible:bg-surface-muted disabled:opacity-50";

export const RAIL_MENU_ICON =
  "grid size-7 shrink-0 place-items-center rounded-sm text-neutral-500 outline-none hover:bg-surface-muted focus-visible:bg-surface-muted";

export function openHarnessWorkspaces(organization: string, create = false) {
  const target = new URL("https://harness.danil.ai/workspaces");
  target.searchParams.set("org", organization);
  if (create) {
    target.searchParams.set("create", "1");
    target.searchParams.set("from", capabilities().nativeWindow ? "desk" : "web");
  }
  return capabilities().nativeWindow ? openNativeExternal(target.href) : invoke("open_external", { target: target.href });
}
