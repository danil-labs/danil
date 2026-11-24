import { createOrganizationSelection, type OrganizationSource } from "@terminus/computers";
import type { platformTransport } from "./platform-session.ts";
import { webOrganizationSource } from "./organizations.ts";

/** The page owns optional organization retries, including responses arriving after pagehide. */
export function organizationSession(transport: ReturnType<typeof platformTransport>, signal: AbortSignal, onSelected: () => void) {
  const fresh = webOrganizationSource(transport);
  let source = fresh;
  let loaded = false;
  async function current<T>(read: () => Promise<T>): Promise<T> {
    signal.throwIfAborted();
    const result = await read();
    signal.throwIfAborted();
    return result;
  }
  const selection = createOrganizationSelection({
    capabilities: () => current(() => source.capabilities!()),
    list: () => current(() => source.list()),
    select: (id, key) => current(() => source.select(id, key)),
  }, { schedule: (run, ms) => {
    if (signal.aborted) return () => {};
    const timer = setTimeout(run, ms);
    (timer as unknown as { unref?: () => void }).unref?.();
    return () => clearTimeout(timer);
  }, onSelected });
  return { selection, load(initial?: OrganizationSource) {
    if (loaded || signal.aborted) return;
    loaded = true;
    source = initial ?? fresh;
    void selection.load().finally(() => { source = fresh; });
  } };
}
