import { machinesClient } from '@terminus/computers';
import { createRoot, createSignal, For, Show } from 'solid-js';
import { render } from 'solid-js/web';
import { forgetMachineNames } from '../features/machines/known-names';
import { aplicarLengua, t } from '../lib/i18n';
import { setShellCacheScope } from '../lib/shellCache';
import { seguirElTema } from '../lib/theme';
import { Button } from '../ui/Button';
import { ToastStack } from '../ui/Toast';
import { SessionLoading } from './auth/SessionLoading';
import { signInError, WorkosAuthPage } from './auth/workos';
import { webOrganizations } from './organization-context';
import { activeGroupCredits, type PlatformProfile, PlatformSessionError, type PlatformWorkspace, platformSession, platformTransport } from './platform-session';
import { type CapabilitiesSnapshot, readCapabilities, supports } from './service-capabilities';
import type { WebSessionDeployment } from './session-config';
import { clearWebCaches, sessionStorageScope } from './session-storage';
import { UpdateNotice } from './UpdateNotice';
import { mountWindow } from './window';
import './phrases';
import { sessionStartup } from './startup-reader';

declare const __DANIL_WEB_RELAY_ORIGINS__: string[];
const FIRST_RETRY_MS = 1000;
const POLL_MAX_MS = 30_000;
/** Identity puede no contestar aún al primer montaje; la ventana monta en cuanto da el perfil. */
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
    // Identity aún no dio el perfil y se reintenta solo: sigue la carga, no una pantalla vacía.
    const [preparing, setPreparing] = createSignal(false), [reloading, setReloading] = createSignal(false);
    const [signedOut, setSignedOut] = createSignal(false);
    // Hasta que identity contesta se ve la carga; la entrada solo sin sesión o con el error del retorno.
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
      disposeGate = render(() => <Show when={identified() && !signedOut() && !preparing() && !reloading()} fallback={<><ToastStack><UpdateNotice /></ToastStack><Show when={!reloading() && (signedOut() || returnError)} fallback={<SessionLoading busy={busy()} onSignOut={preparing() && !reloading() ? () => void logout() : undefined} />}><WorkosAuthPage loginUrl={api.loginUrl(home)} error={returnError} /></Show></>}><main class="flex h-full flex-col gap-4 overflow-y-auto bg-bg p-10 text-neutral-950" data-web-gate="">
        <ToastStack><UpdateNotice /></ToastStack>
        <h1 class="m-0 font-display text-lead font-bold">{t('common.brand_name')}</h1>
        <Show when={busy()}><p role="status">{t('web.auth.waiting')}</p></Show>
        <Show when={error()}><p role="alert">{t(error())}</p><Button disabled={busy()} onClick={() => void load()}>{t('web.computers.retry')}</Button></Show>
        <Show when={!signedOut() && !busy()}>
          <Show when={orgNeeded() || noWorkspace() || error()}>
            <For each={(() => { const s = orgState(); return s.kind === 'ready' ? s.items : []; })()}>{org => <Button variant="secondary" data-web-organization={org.id} aria-pressed={(() => { const s = orgState(); return s.kind === 'ready' && s.active === org.id; })()} onClick={() => void organizations.choose(org.id)}>{org.name}</Button>}</For>
          </Show>
          <Show when={!error()}>
            <For each={rows()}>{row => <Button onClick={() => void choose(row.id)}>{row.name}</Button>}</For>
          </Show>
          <Button variant="ghost" data-web-sign-out="" onClick={() => void logout()}>{t('web.platform.sign_out')}</Button>
        </Show>
      </main></Show>, root);
    }
    /** La recarga que hace el sistema: se ve la carga, sin botones, hasta que navega. `gate` cierra y pinta en el mismo turno. */
    function reload() { setReloading(true); gate(); stopped = true; stopServices(); window.location.assign(home); }
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
        organization.report(cause);
        throw cause;
      }
    }
    const transport: ReturnType<typeof platformTransport> = {
      call: (path, init) => authorized(() => raw.call(path, init)),
      mutation: (path, init) => authorized(() => raw.mutation(path, init)),
    };
    const startup = sessionStartup(api, transport);
    const selection = startup.selection;
    const machines = machinesClient({ endpoint: `${options.origin}/v1`, transport, relayOrigins: __DANIL_WEB_RELAY_ORIGINS__ });
    const organization = webOrganizations(transport, { signal: lifetime.signal, store: window.sessionStorage, signIn: () => window.location.assign(api.loginUrl(home)), redeem: (code, key) => authorized(() => api.redeemPromo(code, key)), onSelected: () => {
      // La organización que identity crea al darse de alta llega con la ventana ya montada: se adopta sin recargar.
      if (mountedBefore && waiting()) { wait = FIRST_RETRY_MS; later(0); } else reload();
    } });
    const organizations = organization.selection;
    const [orgNeeded, setOrgNeeded] = createSignal(false);
    const [orgState, setOrgState] = createSignal(organizations.state());
    const [noWorkspace, setNoWorkspace] = createSignal(false);
    const unsubscribeOrganizations = organizations.subscribe(() => { if (!stopped && !lifetime.signal.aborted) { setOrgNeeded(organizations.needed()); setOrgState(organizations.state()); } });
    // `me` da 403 `workspace_selection_required`: elegir entre sus workspaces; sin ninguno sigue la carga y se reintenta.
    async function withoutWorkspace() {
      organization.load(startup.reader()?.organizations);
      const listed = await (startup.reader()?.workspaces() ?? api.workspaces()).catch(() => [] as PlatformWorkspace[]);
      if (stopped || signedOut()) return;
      setRows(listed); setPreparing(listed.length === 0); setError(''); setNoWorkspace(true);
      gate(); if (listed.length === 0) later();
    }
    /** La cuenta recién creada monta sin workspace; se sondea hasta que la plataforma lo tiene. */
    function waiting() { return person !== undefined && (person.workspace === null || (permits('workspaces') && rows().length === 0)); }
    /** La lista vacía o aún sin contexto (403/404/503) no impide montar; 401 sí sale. */
    async function listWorkspaces(read: () => Promise<PlatformWorkspace[]>, fallback: PlatformWorkspace[]) {
      try { return await read(); }
      catch (cause) { if (cause instanceof PlatformSessionError && cause.status === 401) throw cause; slower(cause); organization.report(cause); return fallback; }
    }
    function slower(cause: unknown) { if (cause instanceof PlatformSessionError && cause.retryAfter) wait = Math.max(wait, Number(cause.retryAfter) * 1000 || wait); }
    /** Primer montaje: identity aún no da el perfil; sigue la carga en vez de enseñar un 403 fatal. */
    function prepare() { firstMountAttempts += 1; setPreparing(true); setError(''); gate(); later(); }
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
        if (startup.refreshDue() || waiting()) {
          const [capabilities, fresh] = await Promise.all([readCapabilities(transport), api.me()]);
          if (stopped || signedOut()) return;
          setCaps(capabilities);
          const arrived = person?.workspace === null && fresh.workspace !== null;
          // Los créditos se atan a la organización al montar: cambiarla recarga una vez.
          if (person && (fresh.id !== person.id || (!arrived && fresh.workspace !== person.workspace) || fresh.active_organization_id !== person.active_organization_id)) { reload(); return; }
          person = fresh;
          if (permits('workspaces') && fresh.workspace !== null) {
            const listed = await listWorkspaces(() => api.workspaces(), rows());
            if (stopped || signedOut()) return; setRows(listed);
          }
          if (arrived) setActive(fresh.workspace);
          startup.checked();
        } else if (!permits('machines')) { const capabilities = await readCapabilities(transport); if (stopped || signedOut()) return; setCaps(capabilities); }
        if (!stopped && !signedOut()) ready = await windowApp?.refresh() ?? false;
      } catch (cause) {
        if (cause instanceof PlatformSessionError && cause.status === 401) expired();
        else slower(cause);
      } finally {
        refreshing = false;
        later(ready && !waiting() ? Math.min(POLL_MAX_MS, startup.refreshIn()) : wait);
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
        else if (!stopped && !signedOut() && organization.report(cause)) gate();
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
    async function logout() { await run(async () => { await api.logout(); forgetMachineNames(); expired(); }); }
    async function load() {
      await run(async () => {
        const { profile, capabilities } = await startup.read(caps());
        if (stopped || signedOut()) return;
        setCaps(capabilities);
        if (mountedBefore) { reload(); return; }
        person = profile;
        organization.load(startup.reader()?.organizations);
        const workspaces = person.workspace !== null && permits('workspaces') ? await listWorkspaces(() => startup.reader()!.workspaces(), []) : [];
        if (stopped || signedOut()) return;
        setRows(workspaces);
        setActive(selection.active());
        cache = sessionStorageScope(localStorage, person.id, person.workspace ?? 'unselected');
        setPreparing(false);
        setShellCacheScope({ mine: () => false, prefer: null });
        disposeGate?.();
        disposeGate = undefined;
        mountedBefore = true;
        windowApp = mountWindow({ machines, permits, relayOrigin: __DANIL_WEB_RELAY_ORIGINS__[0],
          profile: startup.accountProfile(lifetime.signal), onUnauthorized: expired,
          onUnavailable: () => { setError('web.platform.unavailable'); gate(); later(); },
          services: {
            webWorkspaces: { rows, active, busy, uncertain, choose: id => void choose(id) },
            danilCredits: activeGroupCredits(api, profile.active_organization_id),
          },
          organizations: () => Promise.resolve(organizations), promo: organization.redeem, reauth: organization.reauth, groupAccount: { ...api.groupAccount, send: (...args) => authorized(() => api.groupAccount.send(...args)) },
        }, { storage: cache.storage, webAccounts: {
          current: { user_id: person.id, name: person.name, email: typeof person.email === "string" ? person.email : null, extra: false },
          others: () => [], open: () => {}, remove: async () => {}, signOut: () => void logout(),
        } });
        later(FIRST_RETRY_MS);
      }, true);
    }
    function stopServices() { clearTimeout(timer); lifetime.abort(); organization.stop(); unsubscribeOrganizations(); }
    const close = () => { stopped = true; stopServices(); windowApp?.close(); disposeGate?.(); dispose(); };
    window.addEventListener('pagehide', close, { once: true });
    gate();
    void load();
    return close;
  });
}
