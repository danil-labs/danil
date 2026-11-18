import type { PreviewClient, PreviewLease, PreviewScope } from "@terminus/computers";

export type PreviewState = { kind: "opening" | "unavailable" | "failed" | "closed"; code?: string }
  | { kind: "loading" | "live"; url: string };
type Timer = ReturnType<typeof setTimeout> | number;

/** La pestaña posee el arriendo; ni el tráfico ni una respuesta tardía lo mantienen vivo. */
export function previewSession(options: {
  client: PreviewClient;
  changed: (state: PreviewState) => void;
  now?: () => number;
  schedule?: (fn: () => void, ms: number) => Timer;
  cancel?: (id: Timer) => void;
}) {
  const now = options.now ?? Date.now;
  const schedule = options.schedule ?? setTimeout;
  const cancel = options.cancel ?? clearTimeout;
  let generation = 0;
  let controller: AbortController | undefined;
  let renewTimer: Timer | undefined;
  let expiryTimer: Timer | undefined;
  let loadTimer: Timer | undefined;
  let current: { scope: PreviewScope; lease: PreviewLease; url: string } | undefined;
  const release = (scope: PreviewScope, id: string) => {
    void options.client.close(scope, id).catch(() => console.warn("preview_close_failed: lease expiry will revoke the view"));
  };
  function clear() {
    generation++;
    controller?.abort();
    controller = undefined;
    for (const timer of [renewTimer, expiryTimer, loadTimer]) if (timer !== undefined) cancel(timer);
    renewTimer = expiryTimer = loadTimer = undefined;
    if (current) release(current.scope, current.lease.id);
    current = undefined;
  }
  function fail(code: string) {
    clear();
    options.changed({ kind: "failed", code });
  }
  function expiry(until: number) {
    if (expiryTimer !== undefined) cancel(expiryTimer);
    expiryTimer = schedule(() => fail("lease_expired"), Math.max(0, until - now()));
  }
  async function renew(mine: number) {
    if (mine !== generation || !current || !controller) return;
    const view = current;
    try {
      const until = await options.client.renew(view.scope, view.lease.id, controller.signal);
      if (mine !== generation) return;
      if (until <= now()) return fail("lease_expired");
      expiry(until);
      renewTimer = schedule(() => void renew(mine), view.lease.renewAfterMs);
    } catch {
      if (mine === generation) fail("lease_expired");
    }
  }
  async function open(scope: PreviewScope, port: number, path: string) {
    clear();
    const mine = generation;
    controller = new AbortController();
    options.changed({ kind: "opening" });
    try {
      const lease = await options.client.open(scope, port, controller.signal);
      if (mine !== generation) return release(scope, lease.id);
      current = { scope, lease, url: lease.url.replace(/\/$/, "") + path };
      if (lease.expiresAt <= now()) return fail("lease_expired");
      expiry(lease.expiresAt);
      renewTimer = schedule(() => void renew(mine), lease.renewAfterMs);
      loadTimer = schedule(() => fail("load_timeout"), 20_000);
      options.changed({ kind: "loading", url: current.url });
    } catch (error) {
      if (mine !== generation) return;
      const problem = error as { code?: string; message?: string; status?: number };
      const code = problem.code ?? problem.message ?? "preview_failed";
      if (code === "capability_missing" || problem.status === 404 || problem.status === 501) {
        options.changed({ kind: "unavailable", code: "capability_missing" });
        renewTimer = schedule(() => void open(scope, port, path), 30_000);
      } else fail(code);
    }
  }
  return {
    open,
    close: () => { clear(); options.changed({ kind: "closed" }); },
    loaded: () => {
      if (!current) return;
      if (loadTimer !== undefined) cancel(loadTimer);
      loadTimer = undefined;
      options.changed({ kind: "live", url: current.url });
    },
    failed: () => fail("load_failed"),
  };
}
