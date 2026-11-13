import { createRoot, createSignal, For, Show } from 'solid-js';
import { render } from 'solid-js/web';
import { aplicarLengua, t } from '../lib/i18n';
import { setShellCacheScope } from '../lib/shellCache';
import { seguirElTema } from '../lib/theme';
import { Button } from '../ui/Button';
import { ToastStack } from '../ui/Toast';
import { webAccountProfile } from './account';
import { platformSession, platformTransport, PlatformSessionError, type PlatformWorkspace } from './platform-session';
import type { WebSessionDeployment } from './session-config';
import { workspaceSelection } from './workspace-selection';
import { UpdateNotice } from './UpdateNotice';
import { mountWindow } from './window';
import { sessionStorageScope, clearWebCaches } from './session-storage';
import './phrases';

export function startWindow(options: WebSessionDeployment, root: HTMLElement) {
  return createRoot(dispose => {
    aplicarLengua();
    seguirElTema();
    const api = platformSession(options);
    const raw = platformTransport(options);
    const selection = workspaceSelection(api);
    const [rows, setRows] = createSignal<PlatformWorkspace[]>([]);
    const [active, setActive] = createSignal<string | null>(null);
    const [busy, setBusy] = createSignal(false);
    const [uncertain, setUncertain] = createSignal(false);
    const [error, setError] = createSignal('');
    const [signedOut, setSignedOut] = createSignal(false);
    let windowApp: ReturnType<typeof mountWindow> | undefined;
    let disposeGate: (() => void) | undefined;
    let stopped = false;
    let cache: ReturnType<typeof sessionStorageScope> | undefined;
    let mountedBefore = false;
    const home = new URL(import.meta.env.BASE_URL, window.location.origin).href;
    function gate() {
      windowApp?.close();
      windowApp = undefined;
      disposeGate?.();
      root.replaceChildren();
      disposeGate = render(() => <main class="flex h-full flex-col gap-4 overflow-y-auto bg-bg p-10 text-neutral-950" data-web-gate="">
        <ToastStack><UpdateNotice /></ToastStack>
        <h1 class="m-0 font-display text-lead font-bold">{t('common.brand_name')}</h1>
        <Show when={signedOut()}><Button as="a" href={api.loginUrl(home)}>{t('web.auth.signin')}</Button></Show>
        <Show when={busy()}><p role="status">{t('web.auth.waiting')}</p></Show>
        <Show when={error()}><p role="alert">{t(error())}</p><Button disabled={busy()} onClick={() => void load()}>{t('web.computers.retry')}</Button></Show>
        <Show when={!signedOut() && !busy() && !error()}>
          <p>{t('web.platform.empty')}</p>
          <For each={rows()}>{row => <Button onClick={() => void choose(row.id)}>{row.name}</Button>}</For>
          <Button variant="ghost" onClick={() => void logout()}>{t('web.platform.sign_out')}</Button>
        </Show>
      </main>, root);
    }
    function expired() {
      if (stopped || signedOut()) return;
      if (cache) cache.clear();
      else clearWebCaches(localStorage);
      setSignedOut(true);
      setRows([]);
      setActive(null);
      setError('');
      gate();
    }
    async function authorized<T>(action: () => Promise<T>): Promise<T> {
      try { return await action(); }
      catch (cause) {
        if (cause instanceof PlatformSessionError && cause.status === 401) expired();
        throw cause;
      }
    }
    const transport: ReturnType<typeof platformTransport> = {
      call: (path, init) => authorized(() => raw.call(path, init)),
      mutation: (path, init) => authorized(() => raw.mutation(path, init)),
    };
    async function run(action: () => Promise<void>) {
      if (busy() || stopped) return;
      setBusy(true);
      setError('');
      try { await action(); }
      catch (cause) {
        if (cause instanceof PlatformSessionError && cause.status === 401) expired();
        else { setError(cause instanceof PlatformSessionError && cause.status === 403 ? 'web.platform.denied' : 'web.platform.unavailable'); gate(); }
      } finally {
        setActive(signedOut() ? null : selection.active());
        setUncertain(selection.uncertain());
        setBusy(false);
      }
    }
    async function choose(id: string) {
      if (id === active() && !uncertain()) return;
      windowApp?.close();
      windowApp = undefined;
      gate();
      await run(async () => { await selection.choose(id); window.location.assign(home); });
    }
    async function logout() {
      await run(async () => { await api.logout(); expired(); });
    }
    async function load() {
      await run(async () => {
        await selection.reconcile();
        if (mountedBefore) { window.location.assign(home); return; }
        const person = await api.me();
        const workspaces = await api.workspaces();
        if (stopped) return;
        setRows(workspaces);
        setActive(selection.active());
        setSignedOut(false);
        cache = sessionStorageScope(localStorage, person.id, person.workspace);
        if (workspaces.length === 0) { gate(); return; }
        setShellCacheScope({ mine: () => false, prefer: null });
        disposeGate?.();
        disposeGate = undefined;
        mountedBefore = true;
        windowApp = mountWindow({
          profile: webAccountProfile(transport),
          onUnavailable: () => { setError("web.platform.unavailable"); gate(); },
          workspaces: { rows, active, busy, uncertain, choose: id => void choose(id) },
        }, { storage: cache.storage, webAccounts: {
          current: { user_id: person.id, name: person.name, email: null, extra: false },
          others: () => [], open: () => {}, add: () => {}, remove: async () => {}, signOut: () => void logout(),
        } });
      });
    }
    const close = () => { stopped = true; windowApp?.close(); disposeGate?.(); dispose(); };
    window.addEventListener('pagehide', close, { once: true });
    gate();
    void load();
    return close;
  });
}
