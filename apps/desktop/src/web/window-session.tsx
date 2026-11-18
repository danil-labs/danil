import { createRoot, createSignal } from 'solid-js';
import { render } from 'solid-js/web';
import { machinesClient } from '@terminus/computers';
import { aplicarLengua } from '../lib/i18n';
import { setShellCacheScope } from '../lib/shellCache';
import { seguirElTema } from '../lib/theme';
import { platformSession, platformTransport, PlatformSessionError, type PlatformWorkspace, type PlatformProfile } from './platform-session';
import type { WebSessionDeployment } from './session-config';
import { readCapabilities, supports, type CapabilitiesSnapshot } from './service-capabilities';
import { signInError } from './auth/workos';
import { mountWindow } from './window';
import { forgetMachineNames } from '../features/machines/known-names';
import { sessionStorageScope, clearWebCaches } from './session-storage';
import { organizationSession } from './organization-session';
import './phrases';
import { sessionStartup } from './startup-reader';
import { billingV2 } from './billing-v2-api';
import { webOrganizationSource } from './organizations';
import SessionGate from './SessionGate';

declare const __DANIL_WEB_RELAY_ORIGINS__: string[];
const FIRST_RETRY_MS = 1000;
const POLL_MAX_MS = 30_000;
/** Membresía y workspace pueden tardar minutos en llegar al central tras crear la organización. */
const FIRST_MOUNT_ATTEMPTS = 8;
const FIRST_MOUNT_TRANSIENT = [403, 404, 503];

export function startWindow(options: WebSessionDeployment, root: HTMLElement) {
  return createRoot(dispose => {
    aplicarLengua();
    seguirElTema();
    const lifetime = new AbortController();
    const request: typeof fetch = (input, init = {}) => lifetime.signal.aborted ? Promise.reject(new DOMException('The page was closed', 'AbortError')) : fetch(input, { ...init, signal: init.signal ? AbortSignal.any([init.signal, lifetime.signal]) : lifetime.signal });
    const api = platformSession(options, request);
    const raw = platformTransport(options, request);
    const [rows, setRows] = createSignal<PlatformWorkspace[]>([]);
    const [caps, setCaps] = createSignal<CapabilitiesSnapshot | null>(null);
    const [active, setActive] = createSignal<string | null>(null);
    const [busy, setBusy] = createSignal(false);
    const [uncertain, setUncertain] = createSignal(false);
    const [error, setError] = createSignal('');
    const [preparing, setPreparing] = createSignal(false);
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
    let firstMountAttempts = 0;
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
      disposeGate = render(() => <SessionGate identified={identified} signedOut={signedOut} busy={busy} preparing={preparing} error={error} orgNeeded={orgNeeded} noWorkspace={noWorkspace} rows={rows} organizations={organizations} orgState={orgState} loginUrl={() => api.loginUrl(home)} returnError={returnError} load={() => void load()} choose={id => void choose(id)} logout={() => void logout()} redeem={redeemPromo} billing={import.meta.env.VITE_DANIL_BILLING_V2 === 'true' ? { api: billingWithoutOrganization, onActive: selectCreatedOrganization } : undefined} />, root);
    }
    function expired() {
      if (stopped || signedOut()) return;
      stopServices();
      if (cache) cache.clear();
      else clearWebCaches(localStorage);
      setSignedOut(true);
      setRows([]);
      setActive(null);
      setPreparing(false);
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
    const billingWithoutOrganization = billingV2(transport, null);
    let checkoutSelection: { id: string; key: string } | undefined;
    async function selectCreatedOrganization(id: string) {
      if (rows().find(row => row.id === selection.active())?.org === id) return;
      if (checkoutSelection?.id !== id) checkoutSelection = { id, key: crypto.randomUUID() };
      await webOrganizationSource(transport).select(id, checkoutSelection.key);
      checkoutSelection = undefined;
      const target = new URL(home);
      target.searchParams.set('settings', 'plan');
      window.location.assign(target.href);
    }
    const startup = sessionStartup(api, transport);
    const selection = startup.selection;
    const machines = machinesClient({ endpoint: `${options.origin}/v1`, transport, relayOrigins: __DANIL_WEB_RELAY_ORIGINS__ });
    const organization = organizationSession(transport, lifetime.signal, () => {
      stopped = true; stopServices(); windowApp?.close(); window.location.assign(home);
    });
    const organizations = organization.selection;
    const [orgNeeded, setOrgNeeded] = createSignal(false);
    const [orgState, setOrgState] = createSignal(organizations.state());
    const [noWorkspace, setNoWorkspace] = createSignal(false);
    const unsubscribeOrganizations = organizations.subscribe(() => { if (!stopped && !lifetime.signal.aborted) { setOrgNeeded(organizations.needed()); setOrgState(organizations.state()); } });
    // Una organización sin workspace activo (`me` da 403 `workspace_selection_required` o `workspace: null`):
    // el estado vacío con sus workspaces, el selector de organización y cerrar sesión; nunca «Reintentar» sin salida.
    async function withoutWorkspace() {
      organization.load(startup.reader()?.organizations);
      const listed = await (startup.reader()?.workspaces() ?? api.workspaces()).catch(() => [] as PlatformWorkspace[]);
      if (stopped || signedOut()) return;
      setRows(listed);
      setPreparing(false);
      setError('');
      setNoWorkspace(true);
      gate();
    }
    /** Primer montaje: la membresía o el workspace aún no llegó; se espera en vez de enseñar un 403 fatal. */
    function prepare() {
      firstMountAttempts += 1;
      setPreparing(true);
      setError('');
      gate();
      later();
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
      let ready = false;
      try {
        if (startup.refreshDue()) {
          const [capabilities, fresh] = await Promise.all([readCapabilities(transport), api.me()]);
          if (stopped || signedOut()) return;
          setCaps(capabilities);
          if (person && (fresh.id !== person.id || fresh.workspace !== person.workspace)) { gate(); window.location.assign(home); return; }
          person = fresh;
          if (permits('workspaces')) { const listed = await api.workspaces(); if (stopped || signedOut()) return; setRows(listed); }
          startup.checked();
        } else if (!permits('machines')) { const capabilities = await readCapabilities(transport); if (stopped || signedOut()) return; setCaps(capabilities); }
        if (!stopped && !signedOut()) ready = await windowApp?.refresh() ?? false;
      } catch (cause) {
        if (cause instanceof PlatformSessionError && cause.status === 401) expired();
        else if (cause instanceof PlatformSessionError && cause.retryAfter) wait = Math.max(wait, Number(cause.retryAfter) * 1000 || wait);
      } finally {
        refreshing = false;
        later(ready ? Math.min(POLL_MAX_MS, startup.refreshIn()) : wait);
      }
    }
    async function run(action: () => Promise<void>, firstMountRetry = false) {
      if (busy() || stopped || signedOut()) return;
      setBusy(true);
      setError('');
      try { await action(); }
      catch (cause) {
        if (cause instanceof PlatformSessionError && cause.status === 401) expired();
        else if (cause instanceof PlatformSessionError && cause.code === 'workspace_selection_required') await withoutWorkspace();
        else if (firstMountRetry && !mountedBefore && cause instanceof PlatformSessionError
          && FIRST_MOUNT_TRANSIENT.includes(cause.status) && firstMountAttempts < FIRST_MOUNT_ATTEMPTS) prepare();
        else if (!stopped && !signedOut() && organizations.report(cause)) gate();
        else if (!stopped && !signedOut()) {
          setPreparing(false);
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
    async function logout() { await run(async () => { await api.logout(); forgetMachineNames(); expired(); }); }
    async function load() {
      await run(async () => {
        const { profile, capabilities } = await startup.read(caps());
        if (stopped || signedOut()) return;
        setCaps(capabilities);
        if (mountedBefore) { window.location.assign(home); return; }
        person = profile;
        // Con sesión: el selector se lee una vez y, si la ruta aún no existe, se reintenta solo.
        organization.load(startup.reader()?.organizations);
        if (person.workspace === null) { await withoutWorkspace(); return; }
        const listed = permits('workspaces');
        const workspaces = listed ? await startup.reader()!.workspaces() : [];
        if (stopped || signedOut()) return;
        setRows(workspaces);
        setActive(selection.active());
        cache = sessionStorageScope(localStorage, person.id, person.workspace ?? 'unselected');
        if (workspaces.length === 0 && listed && firstMountAttempts < FIRST_MOUNT_ATTEMPTS) { prepare(); return; }
        setPreparing(false);
        if (workspaces.length === 0) { gate(); later(); return; }
        setShellCacheScope({ mine: () => false, prefer: null });
        disposeGate?.();
        disposeGate = undefined;
        mountedBefore = true;
        firstMountAttempts = 0;
        const selected = workspaces.find(row => row.id === selection.active());
        windowApp = mountWindow({ machines, permits, relayOrigin: __DANIL_WEB_RELAY_ORIGINS__[0],
          billing: import.meta.env.VITE_DANIL_BILLING_V2 === 'true' && selected?.org ? {
            api: billingV2(transport, selected.org), role: () => rows().find(row => row.id === selection.active())?.role ?? '', context: `${person.id}:${selected.org}`, onActive: selectCreatedOrganization,
          } : undefined,
          profile: startup.accountProfile(lifetime.signal), onUnauthorized: expired,
          onUnavailable: () => { setError('web.platform.unavailable'); gate(); later(); },
          workspaces: { rows, active, busy, uncertain, choose: id => void choose(id) },
          organizations: () => Promise.resolve(organizations), promo: redeemPromo,
        }, { storage: cache.storage, webAccounts: {
          current: { user_id: person.id, name: person.name, email: null, extra: false },
          others: () => [], open: () => {}, add: () => {}, remove: async () => {}, signOut: () => void logout(),
        } });
        later(FIRST_RETRY_MS);
      }, true);
    }
    function stopServices() { clearTimeout(timer); lifetime.abort(); organizations.stop(); unsubscribeOrganizations(); }
    const close = () => { stopped = true; stopServices(); windowApp?.close(); disposeGate?.(); dispose(); };
    window.addEventListener('pagehide', close, { once: true });
    gate();
    void load();
    return close;
  });
}
