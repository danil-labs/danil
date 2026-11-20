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
import { webWorkspacePicker } from './workspace-picker';
import { activeGroupCredits, contextMachines, type PlatformProfile, PlatformSessionError, type PlatformWorkspace, platformSession, platformTransport } from './platform-session';
import { type CapabilitiesSnapshot, readCapabilities, supports } from './service-capabilities';
import type { WebSessionDeployment } from './session-config';
import { awaitingWorkspace, canListWorkspaces, clearWebCaches, readWorkspaces, retryWait, sessionExit, workspaceCache } from './session-wait';
import { UpdateNotice } from './UpdateNotice';
import { mountWindow } from './window';
import './phrases';
import { organizationMachine, webBillingEnabled, windowBilling } from './window-billing';
import { sessionStartup } from './startup-reader';
import { freeModelScope } from '../lib/free-model-policy';
import { freeRouterEngine, freeRouterWebEdge } from '../features/settings/free-router-adapters';
import { setFreeRouterHost, signOutPlatform } from '../features/settings/free-router-session';

declare const __DANIL_WEB_RELAY_ORIGINS__: string[];
const FIRST_RETRY_MS = 1000;
const POLL_MAX_MS = 30_000;
/** La última organización usada (una de WorkOS) para que AuthKit no repita su selector. */
const LAST_ORGANIZATION = "danil.web.last-organization";
function lastOrganization(): string | undefined {
  try { return localStorage.getItem(LAST_ORGANIZATION) ?? undefined; } catch { return undefined; }
}
function rememberOrganization(profile: PlatformProfile) {
  const organization = profile.organizations.find(org => org.id === profile.active_organization_id);
  // La organización personal no vive en WorkOS: mandarla a AuthKit fallaría.
  if (!organization || organization.type === "personal") return;
  try { localStorage.setItem(LAST_ORGANIZATION, organization.id); } catch { /* sin almacenamiento */ }
}
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
    const [preparing, setPreparing] = createSignal(false);
    const [reloading, setReloading] = createSignal(false);
    const [signedOut, setSignedOut] = createSignal(false);
    const [preparingWorkspace, setPreparingWorkspace] = createSignal(false);
    const [identified, setIdentified] = createSignal(false);
    const returnError = signInError(window.location.search);
    let windowApp: ReturnType<typeof mountWindow> | undefined;
    let disposeGate: (() => void) | undefined;
    let person: PlatformProfile | undefined;
    let stopped = false;
    const gone = () => stopped || signedOut() || exit.leaving();
    let cache: ReturnType<typeof workspaceCache> | undefined;
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
      disposeGate = render(() => <Show when={identified() && !signedOut() && !preparing() && !reloading()} fallback={<><ToastStack><UpdateNotice /></ToastStack><Show when={!reloading() && (signedOut() || returnError)} fallback={<SessionLoading onSignOut={preparing() && !reloading() ? () => void exit.leave() : undefined} />}><WorkosAuthPage loginUrl={api.loginUrl(home, lastOrganization())} error={returnError} /></Show></>}><main class="flex h-full flex-col gap-4 overflow-y-auto bg-bg p-10 text-neutral-950" data-web-gate="">
        <ToastStack><UpdateNotice /></ToastStack>
        <Show when={webBillingEnabled && person}>{profile => billing(profile()).returned()}</Show>
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
          <Button variant="ghost" data-web-sign-out="" onClick={() => void exit.leave()}>{t('web.platform.sign_out')}</Button>
        </Show>
      </main></Show>, root);
    }
    function reload() { setReloading(true); gate(); stopped = true; stopServices(); window.location.assign(home); } // La recarga del sistema: solo la carga, sin botones; `gate` cierra y pinta en el mismo turno.
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
    const organization = webOrganizations(transport, { signal: lifetime.signal, store: window.sessionStorage, signIn: () => window.location.assign(api.loginUrl(home, lastOrganization())), redeem: (code, key) => authorized(() => api.redeemPromo(code, key)), onSelected: () => {
      // La organización de una cuenta nueva llega con la ventana montada: se relee `me` y, al quedar activa, la página recarga una sola vez.
      if (mountedBefore && waiting()) { wait = FIRST_RETRY_MS; later(0); } else reload();
    } });
    const organizations = organization.selection;
    const [orgNeeded, setOrgNeeded] = createSignal(false);
    const [orgState, setOrgState] = createSignal(organizations.state());
    const [noWorkspace, setNoWorkspace] = createSignal(false);
    const billing = (profile: PlatformProfile) => windowBilling(transport, profile, organizations, () => rows().find(row => row.id === selection.active() && row.org === profile.active_organization_id), async (id, signal) => { if (person?.active_organization_id !== id) return null; signal.throwIfAborted(); const result = await machines.list(); return result.kind === 'ok' ? organizationMachine(id, result.value) : null; });
    const unsubscribeOrganizations = organizations.subscribe(() => { if (!stopped && !lifetime.signal.aborted) { setOrgNeeded(organizations.needed()); setOrgState(organizations.state()); } });
    // `me` da 403 `workspace_selection_required`: elegir entre sus workspaces; sin ninguno sigue la carga y se reintenta.
    async function withoutWorkspace() {
      organization.load(startup.reader()?.organizations);
      const listed = await (startup.reader()?.workspaces() ?? api.workspaces()).catch(() => [] as PlatformWorkspace[]);
      if (gone()) return;
      setRows(listed); setPreparing(listed.length === 0); setError(''); setNoWorkspace(true);
      gate(); if (listed.length === 0) later();
    }
    const waiting = () => awaitingWorkspace(person, permits('workspaces'), rows().length);
    const unlisted = (cause: unknown) => { wait = retryWait(cause, wait); organization.report(cause); };
    /** Primer montaje: identity aún no da el perfil; sigue la carga en vez de enseñar un 403 fatal. */
    function prepare() { firstMountAttempts += 1; const shown = preparing() && !windowApp; setPreparing(true); setError(''); if (!shown) gate(); later(); }
    function later(delay = wait) {
      clearTimeout(timer);
      if (gone()) return;
      setPreparingWorkspace(mountedBefore && waiting());
      timer = setTimeout(() => void refreshServices(), delay);
      wait = Math.min(wait * 2, POLL_MAX_MS);
    }
    async function refreshServices() {
      if (gone()) return;
      if (busy() || refreshing) { later(); return; }
      if (!mountedBefore) { await load(); return; }
      refreshing = true;
      let ready = false;
      try {
        if (startup.refreshDue() || waiting()) {
          const [capabilities, fresh] = await Promise.all([readCapabilities(transport), api.me()]);
          if (gone()) return;
          setCaps(capabilities);
          const arrived = person?.workspace === null && fresh.workspace !== null;
          // Los créditos se atan a la organización al montar: cambiarla recarga una vez.
          if (person && (fresh.id !== person.id || (!arrived && fresh.workspace !== person.workspace) || fresh.active_organization_id !== person.active_organization_id)) { reload(); return; }
          person = fresh;
          rememberOrganization(fresh);
          if (canListWorkspaces(fresh, permits('workspaces'))) {
            const listed = await readWorkspaces(() => api.workspaces(), rows(), unlisted);
            if (gone()) return; setRows(listed);
          }
          if (arrived && fresh.workspace !== null) { setActive(fresh.workspace); cache?.rescope(fresh.workspace); }
          startup.checked();
        } else if (!permits('machines')) { const capabilities = await readCapabilities(transport); if (gone()) return; setCaps(capabilities); }
        if (!gone()) ready = await windowApp?.refresh() ?? false;
      } catch (cause) {
        if (cause instanceof PlatformSessionError && cause.status === 401) expired();
        else wait = retryWait(cause, wait);
      } finally {
        refreshing = false;
        later(ready && !waiting() ? Math.min(POLL_MAX_MS, startup.refreshIn()) : wait);
      }
    }
    async function run(action: () => Promise<void>, firstMountRetry = false) {
      if (busy() || gone()) return;
      setBusy(true);
      setError('');
      try { await action(); }
      catch (cause) {
        if (cause instanceof PlatformSessionError && cause.status === 401) expired();
        else if (cause instanceof PlatformSessionError && cause.code === 'workspace_selection_required') await withoutWorkspace();
        else if (firstMountRetry && !mountedBefore && cause instanceof PlatformSessionError
          && FIRST_MOUNT_TRANSIENT.includes(cause.status) && firstMountAttempts < FIRST_MOUNT_ATTEMPTS) prepare();
        else if (!gone() && organization.report(cause)) gate();
        else if (!gone()) {
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
    const exit = sessionExit({
      closed: () => stopped || signedOut(), cancel: () => clearTimeout(timer), logout: async () => { await signOutPlatform().catch(() => {}); await api.logout(); }, signedOut: () => { forgetMachineNames(); expired(); },
      unavailable: () => { if (!gone()) { setPreparing(false); setError('web.platform.unavailable'); gate(); } },
    });
    async function load() {
      await run(async () => {
        const { profile, capabilities } = await startup.read(caps());
        if (gone()) return;
        setCaps(capabilities);
        if (mountedBefore) { reload(); return; }
        person = profile;
        rememberOrganization(profile);
        organization.load(startup.reader()?.organizations);
        const listed = canListWorkspaces(profile, permits('workspaces')) ? await readWorkspaces(() => startup.reader()!.workspaces(), [], unlisted) : [];
        if (gone()) return;
        setRows(listed);
        setActive(selection.active());
        cache = workspaceCache(localStorage, person.id, person.workspace ?? 'unselected');
        setPreparing(false);
        setShellCacheScope({ mine: () => false, prefer: null });
        disposeGate?.();
        disposeGate = undefined;
        mountedBefore = true;
        // El Free router de plataforma con la cookie de esta sesión y su workspace activo (`/me.workspace`).
        setFreeRouterHost({ edge: freeRouterWebEdge(transport), engine: policy => freeRouterEngine(policy ? freeModelScope(policy) : undefined),
          identity: async () => (person ? { sub: person.id, list: { active_workspace_id: person.workspace, items: rows() } } : null) });
        windowApp = mountWindow({ machines, contextMachines: context => contextMachines(`${options.origin}/v1`, transport, __DANIL_WEB_RELAY_ORIGINS__, context), permits, relayOrigin: __DANIL_WEB_RELAY_ORIGINS__[0],
          profile: startup.accountProfile(lifetime.signal), onUnauthorized: expired,
          onUnavailable: () => { setError('web.platform.unavailable'); gate(); later(); },
          services: {
            webWorkspaces: { rows, organization: () => profile.active_organization_id ?? null, active, busy, uncertain, choose: id => void choose(id) },
            webWorkspacePicker: webWorkspacePicker(transport, { store: window.sessionStorage,
              selected: row => { if (row.sub === profile.id && row.org === profile.active_organization_id && active() !== row.account_id) reload(); },
              signIn: organization => window.location.assign(api.loginUrl(home, organization)),
            }),
            danilCredits: activeGroupCredits(api, profile.active_organization_id),
          },
          organizations: () => Promise.resolve(organizations), billing: webBillingEnabled ? billing(profile) : undefined, reauth: organization.reauth, preparing: preparingWorkspace, groupAccount: { ...api.groupAccount, send: (...args) => authorized(() => api.groupAccount.send(...args)) },
        }, { storage: cache.storage, webAccounts: {
          current: { user_id: person.id, name: person.name, email: typeof person.email === "string" ? person.email : null, extra: false },
          others: () => [], open: () => {}, remove: async () => {}, signOut: () => void exit.leave(),
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
