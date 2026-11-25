import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import { parseWorkspaceAddLink, type WorkspaceAddLink } from "../../session/src/workspace-add-link.ts";

export function openNativeExternal(target: string) {
  return invoke("open_external", { target });
}

export async function watchWorkspaceAddLinks(accept: (link: WorkspaceAddLink) => void) {
  let last: string | undefined;
  const receive = (urls: string[] | null) => {
    for (const raw of urls ?? []) {
      if (raw === last) continue;
      let url: URL;
      try { url = new URL(raw); } catch { continue; }
      if (url.protocol !== "danil:" || url.host !== "workspaces" || url.pathname !== "/add" || url.username || url.password) continue;
      const link = parseWorkspaceAddLink(url.searchParams);
      if (!link) continue;
      last = raw;
      accept(link);
    }
  };
  const stop = await listen<string[]>("deep-link://new-url", (event) => { last = undefined; receive(event.payload); });
  void invoke<string[] | null>("plugin:deep-link|get_current").then(receive).catch(() => {});
  return stop;
}
