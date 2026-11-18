import type { PreviewClient, PreviewLease, PreviewScope } from "@terminus/computers";

export type PreviewState = { kind: "opening" | "unavailable" | "failed" | "closed"; code?: string }
  | { kind: "loading" | "live"; url: string; slow?: boolean };
type Timer = ReturnType<typeof setTimeout> | number;

/** La pestaña posee el arriendo; ni el tráfico ni una respuesta tardía lo mantienen vivo. */
export function previewSession(options: {
  client: PreviewClient;
  changed: (state: PreviewState) => void;
  now?: () => number;
  schedule?: (fn: () => void, ms: number) => Timer;
  cancel?: (id: Timer) => void;
  random?: () => number;
}) {
  const now = options.now ?? (() => performance.now());
  const random = options.random ?? Math.random;
  const schedule = options.schedule ?? setTimeout;
  const cancel = options.cancel ?? clearTimeout;
  let generation = 0;
  let controller: AbortController | undefined;
  let renewTimer: Timer | undefined;
  let expiryTimer: Timer | undefined;
  let loadTimer: Timer | undefined;
  let retry = 0;
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
    retry = 0;
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
      view.lease = { ...view.lease, deadline: until };
      retry = 0;
      expiry(until);
      renewTimer = schedule(() => void renew(mine), Math.min(view.lease.renewAfterMs, (until - now()) / 2));
    } catch (error) {
      if (mine !== generation) return;
      const status = (error as { status?: number }).status;
      if (status && status >= 400 && status < 500 && status !== 408 && status !== 429) return fail("lease_expired");
      const remaining = view.lease.deadline - now();
      if (remaining <= 0) return fail("lease_expired");
      const delay = Math.min(8_000, 1000 * 2 ** Math.min(retry++, 3)) * (0.75 + random() * 0.5);
      renewTimer = schedule(() => void renew(mine), Math.min(delay, remaining));
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
      if (lease.deadline <= now()) return fail("lease_expired");
      expiry(lease.deadline);
      renewTimer = schedule(() => void renew(mine), Math.min(lease.renewAfterMs, (lease.deadline - now()) / 2));
      // El plazo de HEAD del contrato es 30 s; una carga lenta solo muestra aviso.
      loadTimer = schedule(() => { if (current) options.changed({ kind: "loading", url: current.url, slow: true }); }, 30_000);
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
