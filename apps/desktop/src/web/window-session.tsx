import { createRoot, createSignal, For, Show } from 'solid-js';
import { render } from 'solid-js/web';
import { machinesClient } from '@terminus/computers';
import { aplicarLengua, t } from '../lib/i18n';
import { setShellCacheScope } from '../lib/shellCache';
import { seguirElTema } from '../lib/theme';
import { Button } from '../ui/Button';
import { ToastStack } from '../ui/Toast';
import { webAccountProfile } from './account';
import { platformSession, platformTransport, PlatformSessionError, type PlatformWorkspace, type PlatformOrganization, type PlatformProfile } from './platform-session';
import type { WebSessionDeployment } from './session-config';
import { workspaceSelection } from './workspace-selection';
import { organizationSession } from './organization-session';
import { readCapabilities, supports, type CapabilitiesSnapshot } from './service-capabilities';
import { UpdateNotice } from './UpdateNotice';
import { mountWindow } from './window';
import { sessionStorageScope, clearWebCaches } from './session-storage';
import './phrases';

declare const __DANIL_WEB_RELAY_ORIGIN__: string;
const FIRST_RETRY_MS = 1000;
const POLL_MAX_MS = 30_000;

export function startWindow(options: WebSessionDeployment, root: HTMLElement) {
  return createRoot(dispose => {
    aplicarLengua();
    seguirElTema();
    const lifetime = new AbortController();
    const request: typeof fetch = (input, init = {}) => fetch(input, { ...init, signal: init.signal ? AbortSignal.any([init.signal, lifetime.signal]) : lifetime.signal });
    const api = platformSession(options, request);
    const raw = platformTransport(options, request);
    const selection = workspaceSelection(api);
    const organizations = organizationSession(api);
    const [rows, setRows] = createSignal<PlatformWorkspace[]>([]);
    const [orgRows, setOrgRows] = createSignal<PlatformOrganization[]>([]);
    const [orgActive, setOrgActive] = createSignal<string | null>(null);
    const [orgUncertain, setOrgUncertain] = createSignal(false);
    const [caps, setCaps] = createSignal<CapabilitiesSnapshot | null>(null);
    const [active, setActive] = createSignal<string | null>(null);
    const [busy, setBusy] = createSignal(false);
    const [uncertain, setUncertain] = createSignal(false);
    const [error, setError] = createSignal('');
    const [signedOut, setSignedOut] = createSignal(false);
    let windowApp: ReturnType<typeof mountWindow> | undefined;
    let disposeGate: (() => void) | undefined;
    let person: PlatformProfile | undefined;
    let stopped = false;
    let cache: ReturnType<typeof sessionStorageScope> | undefined;
    let mountedBefore = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let wait = FIRST_RETRY_MS;
    let refreshing = false;
    const home = new URL(import.meta.env.BASE_URL, window.location.origin).href;
    const permits = (name: string) => supports(caps(), name);
    function gate() {
      windowApp?.close();
      windowApp = undefined;
      disposeGate?.();
      root.replaceChildren();
      disposeGate = render(() => <main class="flex h-full flex-col overflow-y-auto bg-bg px-10 py-10" data-web-gate="">
        <ToastStack><UpdateNotice /></ToastStack>
        <h1 class="m-0 mb-5 text-3xl leading-tight font-display font-bold tracking-[-0.03em] text-neutral-950">{t('common.brand_name')}</h1>
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
      clearTimeout(timer);
      lifetime.abort();
      if (cache) cache.clear();
      else clearWebCaches(localStorage);
      setSignedOut(true);
      setRows([]);
      setOrgRows([]);
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
    const machines = machinesClient({ endpoint: `${options.origin}/v1`, transport, relayOrigins: [__DANIL_WEB_RELAY_ORIGIN__] });
    function later(delay = wait) {
      clearTimeout(timer);
      if (stopped || signedOut()) return;
      timer = setTimeout(() => void refreshServices(), delay);
      wait = Math.min(wait * 2, POLL_MAX_MS);
    }
    async function refreshServices() {
      if (stopped || signedOut()) return;
      if (busy() || refreshing) { later(); return; }
      if (!mountedBefore) { await load(); return; }
      refreshing = true;
      try {
        setCaps(await readCapabilities(transport));
        if (organizations.uncertain()) {
          if (permits('identity.organizations')) { await organizations.reconcile(); window.location.assign(home); return; }
        } else if (person) {
          const fresh = await api.me();
          if (fresh.id !== person.id || fresh.workspace !== person.workspace || fresh.active_organization_id !== person.active_organization_id) {
            gate(); window.location.assign(home); return;
          }
          person = fresh;
          const listed = permits('identity.organizations') ? await organizations.list(person) : { items: person.organizations, active_organization_id: person.active_organization_id ?? null, fallback: true };
          if (stopped || signedOut() || busy()) return;
          if (permits('workspaces')) setRows(await api.workspaces());
          setOrgRows(listed.items);
          setOrgActive(listed.active_organization_id);
          const ready = await windowApp?.refresh();
          if (ready && !listed.fallback) wait = POLL_MAX_MS;
        }
      } catch (cause) {
        if (cause instanceof PlatformSessionError && cause.status === 401) expired();
        else if (cause instanceof PlatformSessionError && cause.retryAfter) wait = Math.max(wait, Number(cause.retryAfter) * 1000 || wait);
      } finally {
        refreshing = false;
        setOrgUncertain(organizations.uncertain());
        later();
      }
    }
    async function run(action: () => Promise<void>) {
      if (busy() || stopped || signedOut()) return;
      setBusy(true);
      setError('');
      try { await action(); }
      catch (cause) {
        if (cause instanceof PlatformSessionError && cause.status === 401) expired();
        else if (!stopped && !signedOut()) {
          setError(cause instanceof PlatformSessionError && cause.status === 403 ? 'web.platform.denied' : 'web.platform.unavailable'); gate();
          if (!(cause instanceof PlatformSessionError) || [404, 408, 429, 501, 503].includes(cause.status)) later();
        }
      } finally {
        setActive(signedOut() ? null : selection.active());
        setUncertain(selection.uncertain());
        setOrgUncertain(organizations.uncertain());
        setBusy(false);
      }
    }
    async function choose(id: string) {
      if (id === active() && !uncertain()) return;
      gate();
      await run(async () => { await selection.choose(id); window.location.assign(home); });
    }
    async function chooseOrganization(id: string) {
      if (id === orgActive() && !organizations.uncertain()) return;
      setRows([]);
      cache?.clear();
      gate();
      await run(async () => { await organizations.choose(id); window.location.assign(home); });
    }
    async function logout() { await run(async () => { await api.logout(); expired(); }); }
    async function load() {
      await run(async () => {
        try { setCaps(await readCapabilities(transport)); }
        catch (cause) { if (cause instanceof PlatformSessionError && cause.status === 401) throw cause; }
        await selection.reconcile();
        if (mountedBefore) { window.location.assign(home); return; }
        person = await api.me();
        const listed = permits('identity.organizations') ? await organizations.list(person) : { items: person.organizations, active_organization_id: person.active_organization_id ?? null, fallback: true };
        if (!listed.fallback && listed.items.length === 1 && !listed.active_organization_id && !person.active_organization_id) {
          await organizations.choose(listed.items[0].id); window.location.assign(home); return;
        }
        const workspaces = permits('workspaces') ? await api.workspaces() : [];
        if (stopped || signedOut()) return;
        setOrgRows(listed.items);
        setOrgActive(listed.active_organization_id);
        setRows(workspaces);
        setActive(selection.active());
        cache = sessionStorageScope(localStorage, person.id, person.workspace ?? 'unselected');
        if (workspaces.length === 0 && listed.items.length === 0) { gate(); later(); return; }
        setShellCacheScope({ mine: () => false, prefer: null });
        disposeGate?.();
        disposeGate = undefined;
        mountedBefore = true;
        windowApp = mountWindow({ machines, permits, relayOrigin: __DANIL_WEB_RELAY_ORIGIN__,
          profile: webAccountProfile(transport), onUnauthorized: expired,
          onUnavailable: () => { setError('web.platform.unavailable'); gate(); later(); },
          workspaces: { rows, active, busy, uncertain, choose: id => void choose(id) },
          organizations: { rows: orgRows, active: orgActive, busy: () => busy() || !permits('identity.organizations'), uncertain: orgUncertain, choose: id => void chooseOrganization(id) },
        }, { storage: cache.storage, webAccounts: {
          current: { user_id: person.id, name: person.name, email: null, extra: false },
          others: () => [], open: () => {}, add: () => {}, remove: async () => {}, signOut: () => void logout(),
        } });
        later(FIRST_RETRY_MS);
      });
    }
    const close = () => { stopped = true; clearTimeout(timer); lifetime.abort(); windowApp?.close(); disposeGate?.(); dispose(); };
    window.addEventListener('pagehide', close, { once: true });
    gate();
    void load();
    return close;
  });
}
