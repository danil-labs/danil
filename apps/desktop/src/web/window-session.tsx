import { createRoot, createSignal, For, Show } from 'solid-js';
import { render } from 'solid-js/web';
import { machinesClient } from '@terminus/computers';
import { aplicarLengua, t } from '../lib/i18n';
import { setShellCacheScope } from '../lib/shellCache';
import { seguirElTema } from '../lib/theme';
import { Spinner } from '../ui/Spinner';
import { Button } from '../ui/Button';
import { ToastStack } from '../ui/Toast';
import { webAccountProfile } from './account';
import { platformSession, platformTransport, PlatformSessionError, PreparationExpired, preparePlatformSession, type PlatformWorkspace, type PlatformProfile } from './platform-session';
import type { WebSessionDeployment } from './session-config';
import { workspaceSelection } from './workspace-selection';
import { readCapabilities, supports, type CapabilitiesSnapshot } from './service-capabilities';
import { UpdateNotice } from './UpdateNotice';
import { WorkosAuthPage, signInError } from './auth/workos';
import { mountWindow } from './window';
import { sessionStorageScope, clearWebCaches } from './session-storage';
import { createOrganizationSelection, hasActiveOrganization } from "@terminus/computers";
import { webOrganizationSource } from './organizations';
import { sessionPromoRedemption } from './promo-redemption';
import './phrases';
import { freeModelScope } from '../lib/free-model-policy';
import { freeRouterEngine, freeRouterWebEdge } from '../features/settings/free-router-adapters';
import { setFreeRouterHost, signOutPlatform } from '../features/settings/free-router-session';

declare const __DANIL_WEB_RELAY_ORIGINS__: string[];
const FIRST_RETRY_MS = 1000;
const POLL_MAX_MS = 30_000;
/** Lo que la ventana dice de una negativa: un 403 es falta de acceso; lo demás, servicio no disponible. */
const refusalCopy = (status: number | undefined) => status === 403 ? 'web.platform.denied' : 'web.platform.unavailable';

export function startWindow(options: WebSessionDeployment, root: HTMLElement) {
  return createRoot(dispose => {
    aplicarLengua();
    seguirElTema();
    const lifetime = new AbortController();
    let startupSignal: AbortSignal | undefined;
    const [preparing, setPreparing] = createSignal(false);
    const request: typeof fetch = (input, init = {}) => lifetime.signal.aborted ? Promise.reject(new DOMException('The page was closed', 'AbortError')) : fetch(input, { ...init, signal: AbortSignal.any([lifetime.signal, ...(startupSignal ? [startupSignal] : []), ...(init.signal ? [init.signal] : [])]) });
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
    // La ausencia de sesión solo se confirma con el 401 de identity.
    const [identified, setIdentified] = createSignal(false);
    const returnError = signInError(window.location.search);
    let windowApp: ReturnType<typeof mountWindow> | undefined;
    let disposeGate: (() => void) | undefined;
    let person: PlatformProfile | undefined;
    let profileReadAt = 0;
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
      disposeGate = render(() => <Show when={(identified() || preparing()) && !signedOut()} fallback={<><ToastStack><UpdateNotice /></ToastStack><Show when={signedOut()} fallback={<main class="flex h-full flex-col items-center justify-center gap-4 bg-bg text-neutral-950" data-web-session-loading="" aria-busy="true"><h1 class="m-0 font-display text-lead font-bold">{t('common.brand_name')}</h1><p role="status">{t('web.auth.waiting')}</p></main>}><WorkosAuthPage loginUrl={api.loginUrl(home)} busy={false} error={returnError} /></Show></>}><main class="flex h-full flex-col gap-4 overflow-y-auto bg-bg p-10 text-neutral-950" data-web-gate="">
        <ToastStack><UpdateNotice /></ToastStack>
        <h1 class="m-0 font-display text-lead font-bold">{t('common.brand_name')}</h1>
        <Show when={busy()}><p class="flex items-center gap-2" role="status"><Spinner />{t(preparing() ? 'web.platform.preparing' : 'web.auth.waiting')}</p></Show>
        <Show when={error()}><p role="alert">{t(error())}</p><Button disabled={busy()} onClick={() => void load()}>{t('web.computers.retry')}</Button></Show>
        <Show when={!signedOut() && !busy()}>
          <Show when={orgNeeded() || noWorkspace() || error()}>
            <For each={(() => { const s = orgState(); return s.kind === 'ready' ? s.items : []; })()}>{org => <Button variant="secondary" data-web-organization={org.id} aria-pressed={(() => { const s = orgState(); return s.kind === 'ready' && s.active === org.id; })()} onClick={() => void organizations.choose(org.id)}>{org.name}</Button>}</For>
          </Show>
          <Show when={!error()}>
            <p>{t('web.platform.empty')}</p>
            <For each={rows()}>{row => <Button onClick={() => void choose(row.id)}>{row.name}</Button>}</For>
          </Show>
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
    const organizations = createOrganizationSelection(webOrganizationSource(transport, () => ({ items: [...(caps() ?? [])].map(name => ({ name, version: 1, status: 'available' })) })), { onSelected: () => window.location.assign(home) });
    const [orgNeeded, setOrgNeeded] = createSignal(false);
    const [orgState, setOrgState] = createSignal(organizations.state());
    const [noWorkspace, setNoWorkspace] = createSignal(false);
    organizations.subscribe(() => { setOrgNeeded(organizations.needed()); setOrgState(organizations.state()); });
    let organizationsLoaded = false;
    const readOrganizations = () => { if (!organizationsLoaded) { organizationsLoaded = true; void organizations.load(); } };
    const loadOrganizations = () => Promise.resolve(organizations);
    // Una organización sin workspace activo (`me` da 403 `workspace_selection_required` o `workspace: null`):
    // el estado vacío con sus workspaces, el selector de organización y cerrar sesión; nunca «Reintentar» sin salida.
    async function withoutWorkspace(known?: PlatformWorkspace[]) {
      readOrganizations();
      const listed = known ?? await api.workspaces().catch(() => [] as PlatformWorkspace[]);
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
        const context = person && Date.now() - profileReadAt >= POLL_MAX_MS
          ? Promise.all([api.me(), permits('workspaces') ? api.workspaces() : Promise.resolve(null)]) : null;
        const [snapshot, ready, current] = await Promise.all([readCapabilities(transport), windowApp?.refresh(), context]);
        if (stopped || signedOut()) return;
        setCaps(snapshot);
        if (current && person) {
          const [fresh, listed] = current;
          if (fresh.id !== person.id || fresh.workspace !== person.workspace) { gate(); window.location.assign(home); return; }
          person = fresh;
          profileReadAt = Date.now();
          if (listed) setRows(listed);
        }
        if (ready) wait = POLL_MAX_MS;
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
        // La preparación agotó su presupuesto: queda «Reintentar», sin otro presupuesto automático.
        else if (cause instanceof PreparationExpired) {
          if (!stopped && !signedOut()) { setError(refusalCopy(cause.last?.status)); gate(); }
        }
        else if (!stopped && !signedOut() && organizations.report(cause)) gate();
        else if (!stopped && !signedOut()) {
          setError(refusalCopy(cause instanceof PlatformSessionError ? cause.status : undefined)); gate();
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
    const redeemPromo = sessionPromoRedemption((code, key) => authorized(() => api.redeemPromo(code, key)));
    // El Free router suelta a la persona antes de que la cookie deje de valer.
    async function logout() { await run(async () => { await signOutPlatform().catch(() => {}); await api.logout(); expired(); }); }
    async function load() {
      const read = async (signal?: AbortSignal) => {
        startupSignal = signal;
        // Las lecturas no dependen entre sí; identity sigue siendo quien decide la sesión.
        let initialMachines: ReturnType<typeof machines.list> | undefined;
        const discovered = readCapabilities(transport).then(snapshot => {
          setCaps(snapshot);
          if (supports(snapshot, 'machines')) initialMachines = machines.list();
          return snapshot;
        });
        const directory = Promise.allSettled([discovered, api.workspaces()]);
        person = await api.me();
        profileReadAt = Date.now();
        await selection.reconcile(person);
        if (mountedBefore) { window.location.assign(home); return true; }
        const [capabilities, listed] = await directory;
        if (capabilities.status === 'fulfilled') setCaps(capabilities.value);
        else if (capabilities.reason instanceof PlatformSessionError && capabilities.reason.status === 401) throw capabilities.reason;
        // Con sesión: el selector se lee una vez y, si la ruta aún no existe, se reintenta solo.
        readOrganizations();
        if (person.workspace === null) {
          await organizations.load();
          organizationsLoaded = true;
          const state = organizations.state();
          await withoutWorkspace(listed.status === 'fulfilled' ? listed.value : undefined);
          // Una negativa definitiva a la selección es una respuesta, no una cuenta por preparar.
          if (state.kind === 'ready' && state.refused) {
            if (!stopped && !signedOut()) { setError(refusalCopy(state.errorStatus)); gate(); }
            return true;
          }
          return state.kind === 'ready' && (state.active !== null || state.items.length > 1);
        }
        if (permits('workspaces') && listed.status === 'rejected') throw listed.reason;
        const workspaces = permits('workspaces') && listed.status === 'fulfilled' ? listed.value : [];
        if (stopped || signedOut()) return;
        setRows(workspaces);
        setActive(selection.active());
        cache = sessionStorageScope(localStorage, person.id, person.workspace ?? 'unselected');
        if (workspaces.length === 0) { gate(); later(); return; }
        setShellCacheScope({ mine: () => false, prefer: null });
        disposeGate?.();
        disposeGate = undefined;
        mountedBefore = true;
        // El Free router de plataforma con la cookie de esta sesión y su workspace activo (`/me.workspace`).
        setFreeRouterHost({ edge: freeRouterWebEdge(transport), engine: policy => freeRouterEngine(policy ? freeModelScope(policy) : undefined),
          identity: async () => (person ? { sub: person.id, list: { active_workspace_id: person.workspace, items: rows() } } : null) });
        windowApp = mountWindow({ machines, initialMachines, permits, relayOrigin: __DANIL_WEB_RELAY_ORIGINS__[0],
          profile: webAccountProfile(transport, () => person), onUnauthorized: expired,
          onUnavailable: () => { setError('web.platform.unavailable'); gate(); later(); },
          workspaces: { rows, active, busy, uncertain, choose: id => void choose(id) },
          organizations: loadOrganizations, promo: () => !orgNeeded() && hasActiveOrganization(orgState()) ? redeemPromo : undefined,
        }, { storage: cache.storage, webAccounts: {
          current: { user_id: person.id, name: person.name, email: null, extra: false },
          others: () => [], open: () => {}, add: () => {}, remove: async () => {}, signOut: () => void logout(),
        } });
        void windowApp.refresh().then(ready => later(ready ? POLL_MAX_MS : FIRST_RETRY_MS)).catch(() => {
          setError('web.platform.unavailable'); gate(); later();
        });
        return true;
      };
      await run(async () => {
        try {
          if (mountedBefore) await read();
          else {
            await preparePlatformSession(read, lifetime.signal, () => {
              setPreparing(true);
              gate();
            }, value => value !== false);
          }
        } finally { startupSignal = undefined; setPreparing(false); }
      });
    }
    const close = () => { stopped = true; clearTimeout(timer); lifetime.abort(); windowApp?.close(); disposeGate?.(); dispose(); };
    window.addEventListener('pagehide', close, { once: true });
    gate();
    void load();
    return close;
  });
}
