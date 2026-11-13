import { createRoot, createSignal, For, Show } from 'solid-js';
import { render } from 'solid-js/web';
import { machinesClient } from '@terminus/computers';
import { aplicarLengua, t } from '../lib/i18n';
import { setShellCacheScope } from '../lib/shellCache';
import { seguirElTema } from '../lib/theme';
import { Button } from '../ui/Button';
import { ToastStack } from '../ui/Toast';
import { webAccountProfile } from './account';
import { platformSession, platformTransport, PlatformSessionError, type PlatformWorkspace, type PlatformProfile } from './platform-session';
import type { WebSessionDeployment } from './session-config';
import { workspaceSelection } from './workspace-selection';
import { readCapabilities, supports, type CapabilitiesSnapshot } from './service-capabilities';
import { UpdateNotice } from './UpdateNotice';
import { WorkosAuthPage, signInError } from './auth/workos';
import { mountWindow } from './window';
import { sessionStorageScope, clearWebCaches } from './session-storage';
import { createOrganizationSelection } from '../features/shell/organization-selection';
import { webOrganizationSource } from './organizations';
import PromoRedeem from '../features/shell/PromoRedeem';
import './phrases';

declare const __DANIL_WEB_RELAY_ORIGINS__: string[];
const FIRST_RETRY_MS = 1000;
const POLL_MAX_MS = 30_000;

export function startWindow(options: WebSessionDeployment, root: HTMLElement) {
  return createRoot(dispose => {
    aplicarLengua();
    seguirElTema();
    const lifetime = new AbortController();
    const request: typeof fetch = (input, init = {}) => lifetime.signal.aborted ? Promise.reject(new DOMException('The page was closed', 'AbortError')) : fetch(input, { ...init, signal: init.signal ? AbortSignal.any([init.signal, lifetime.signal]) : lifetime.signal });
    const api = platformSession(options, request);
    const raw = platformTransport(options, request);
    const selection = workspaceSelection(api);
    const [rows, setRows] = createSignal<PlatformWorkspace[]>([]);
    const [caps, setCaps] = createSignal<CapabilitiesSnapshot | null>(null);
    const [active, setActive] = createSignal<string | null>(null);
    const [busy, setBusy] = createSignal(false);
    const [uncertain, setUncertain] = createSignal(false);
    const [error, setError] = createSignal('');
    const [signedOut, setSignedOut] = createSignal(false);
    // Hasta que identity contesta, la ventana muestra la pantalla de entrada original esperando.
    const [identified, setIdentified] = createSignal(false);
    const returnError = signInError(window.location.search);
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
      disposeGate = render(() => <Show when={identified() && !signedOut()} fallback={<><ToastStack><UpdateNotice /></ToastStack><WorkosAuthPage loginUrl={api.loginUrl(home)} busy={!signedOut()} error={returnError} /></>}><main class="flex h-full flex-col gap-4 overflow-y-auto bg-bg p-10 text-neutral-950" data-web-gate="">
        <ToastStack><UpdateNotice /></ToastStack>
        <h1 class="m-0 font-display text-lead font-bold">{t('common.brand_name')}</h1>
        <Show when={busy()}><p role="status">{t('web.auth.waiting')}</p></Show>
        <Show when={error()}><p role="alert">{t(error())}</p><Button disabled={busy()} onClick={() => void load()}>{t('web.computers.retry')}</Button></Show>
        <Show when={!signedOut() && !busy()}>
          <Show when={orgNeeded() || noWorkspace() || error()}>
            <For each={(() => { const s = orgState(); return s.kind === 'ready' ? s.items : []; })()}>{org => <Button variant="secondary" data-web-organization={org.id} aria-pressed={(() => { const s = orgState(); return s.kind === 'ready' && s.active === org.id; })()} onClick={() => void organizations.choose(org.id)}>{org.name}</Button>}</For>
          </Show>
          <Show when={!error()}>
            <p>{t('web.platform.empty')}</p>
            <For each={rows()}>{row => <Button onClick={() => void choose(row.id)}>{row.name}</Button>}</For>
          </Show>
          <PromoRedeem redeem={redeemPromo} />
          <Button variant="ghost" data-web-sign-out="" onClick={() => void logout()}>{t('web.platform.sign_out')}</Button>
        </Show>
      </main></Show>, root);
    }
    function expired() {
      if (stopped || signedOut()) return;
      clearTimeout(timer);
      lifetime.abort();
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
        organizations.report(cause);
        throw cause;
      }
    }
    const transport: ReturnType<typeof platformTransport> = {
      call: (path, init) => authorized(() => raw.call(path, init)),
      mutation: (path, init) => authorized(() => raw.mutation(path, init)),
    };
    const machines = machinesClient({ endpoint: `${options.origin}/v1`, transport, relayOrigins: __DANIL_WEB_RELAY_ORIGINS__ });
    // Tras cambiar de organización la página se relee entera, como tras cambiar de workspace.
    const organizations = createOrganizationSelection(webOrganizationSource(transport), { onSelected: () => window.location.assign(home) });
    const [orgNeeded, setOrgNeeded] = createSignal(false);
    const [orgState, setOrgState] = createSignal(organizations.state());
    const [noWorkspace, setNoWorkspace] = createSignal(false);
    organizations.subscribe(() => { setOrgNeeded(organizations.needed()); setOrgState(organizations.state()); });
    let organizationsLoaded = false;
    const readOrganizations = () => { if (!organizationsLoaded) { organizationsLoaded = true; void organizations.load(); } };
    const loadOrganizations = () => Promise.resolve(organizations);
    // Una organización sin workspace activo (`me` da 403 `workspace_selection_required` o `workspace: null`):
    // el estado vacío con sus workspaces, el selector de organización y cerrar sesión; nunca «Reintentar» sin salida.
    async function withoutWorkspace() {
      readOrganizations();
      const listed = await api.workspaces().catch(() => [] as PlatformWorkspace[]);
      if (stopped || signedOut()) return;
      setRows(listed);
      setError('');
      setNoWorkspace(true);
      gate();
    }
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
        if (stopped || signedOut()) return;
        if (person) {
          const fresh = await api.me();
          if (fresh.id !== person.id || fresh.workspace !== person.workspace) { gate(); window.location.assign(home); return; }
          person = fresh;
          if (stopped || signedOut() || busy()) return;
          if (permits('workspaces')) setRows(await api.workspaces());
          const ready = await windowApp?.refresh();
          if (ready) wait = POLL_MAX_MS;
        }
      } catch (cause) {
        if (cause instanceof PlatformSessionError && cause.status === 401) expired();
        else if (cause instanceof PlatformSessionError && cause.retryAfter) wait = Math.max(wait, Number(cause.retryAfter) * 1000 || wait);
      } finally {
        refreshing = false;
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
        else if (cause instanceof PlatformSessionError && cause.code === 'workspace_selection_required') await withoutWorkspace();
        else if (!stopped && !signedOut() && organizations.report(cause)) gate();
        else if (!stopped && !signedOut()) {
          setError(cause instanceof PlatformSessionError && cause.status === 403 ? 'web.platform.denied' : 'web.platform.unavailable'); gate();
          if (!(cause instanceof PlatformSessionError) || [404, 408, 429, 501, 503].includes(cause.status)) later();
        }
      } finally {
        setActive(signedOut() ? null : selection.active());
        setUncertain(selection.uncertain());
        setBusy(false);
        setIdentified(true);
      }
    }
    async function choose(id: string) {
      if (id === active() && !uncertain()) return;
      gate();
      await run(async () => { await selection.choose(id); window.location.assign(home); });
    }
    const redeemPromo = (code: string, key: string) => authorized(() => api.redeemPromo(code, key));
    async function logout() { await run(async () => { await api.logout(); expired(); }); }
    async function load() {
      await run(async () => {
        try { setCaps(await readCapabilities(transport)); }
        catch (cause) { if (cause instanceof PlatformSessionError && cause.status === 401) throw cause; }
        await selection.reconcile();
        if (mountedBefore) { window.location.assign(home); return; }
        person = await api.me();
        // Con sesión: el selector se lee una vez y, si la ruta aún no existe, se reintenta solo.
        readOrganizations();
        if (person.workspace === null) { await withoutWorkspace(); return; }
        const workspaces = permits('workspaces') ? await api.workspaces() : [];
        if (stopped || signedOut()) return;
        setRows(workspaces);
        setActive(selection.active());
        cache = sessionStorageScope(localStorage, person.id, person.workspace ?? 'unselected');
        if (workspaces.length === 0) { gate(); later(); return; }
        setShellCacheScope({ mine: () => false, prefer: null });
        disposeGate?.();
        disposeGate = undefined;
        mountedBefore = true;
        windowApp = mountWindow({ machines, permits, relayOrigin: __DANIL_WEB_RELAY_ORIGINS__[0],
          profile: webAccountProfile(transport), onUnauthorized: expired,
          onUnavailable: () => { setError('web.platform.unavailable'); gate(); later(); },
          workspaces: { rows, active, busy, uncertain, choose: id => void choose(id) },
          organizations: loadOrganizations, promo: redeemPromo,
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
