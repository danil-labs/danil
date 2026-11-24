import { parseWorkspaceAddLink } from "./workspace-add-link";
import { createRoot, createSignal, Show } from 'solid-js';
import { render } from 'solid-js/web';
import { forgetMachineNames } from './known-machine-names';
import { aplicarLengua, t } from '../../../apps/desktop/src/lib/i18n';
import { setShellCacheScope } from './shellCache';
import { seguirElTema } from '../../ui/src/lib/theme';
import { Button } from '../../ui/src/Button';
import { ToastStack } from '../../ui/src/Toast';
import { SessionLoading } from '../../../apps/desktop/src/web/auth/SessionLoading';
import { signInError, WorkosAuthPage } from '../../../apps/desktop/src/web/auth/workos';
import { webWorkspacePicker } from './workspace-picker';
import { webCredentialSource } from '../../platform-client/src/credentials';
import { webAccountProfile } from '../../../apps/desktop/src/web/account';
import { contextMachines, type PlatformProfile, PlatformSessionError, platformSession, platformTransport } from './platform-session';
import { type CapabilitiesSnapshot, readCapabilities, supports } from '../../../apps/desktop/src/web/service-capabilities';
import type { WebSessionDeployment } from './session-config';
import { clearWebCaches, retryWait, sessionExit, workspaceCache } from './session-wait';
import { UpdateNotice } from '../../../apps/desktop/src/web/UpdateNotice';
import { mountWindow } from '../../../apps/desktop/src/web/window';
import '../../../apps/desktop/src/web/phrases';
import { organizationMachine, windowBilling } from '../../../apps/desktop/src/web/window-billing';
import { webSessionCommands, type WebSessionStatus } from '../../../apps/desktop/src/web/web-session-contexts';
import { webRailCatalog } from '../../../apps/desktop/src/web/web-rail-catalog';
import { windowActiveContext } from '../../../apps/desktop/src/web/window-active-context';
import { freeModelScope } from './free-model-policy';
import { freeRouterEngine, freeRouterWebEdge } from '../../features/settings/src/queries/free-router-adapters';
import { setFreeRouterHost, signOutPlatform } from '../../features/settings/src/queries/free-router-session';
import { sessionRailState } from '../../shell/src/shell';
import { platformFetch, setEdgeContext } from '../../platform-client/src/client';
import { contextMachinesQuery } from '../../features/machines/src/queries/machines-query';

declare const __DANIL_WEB_RELAY_ORIGINS__: string[];
const FIRST_RETRY_MS = 1000;
const POLL_MS = 30_000;
/** Identity puede no contestar aún al primer montaje; la ventana monta en cuanto da el conjunto. */
const FIRST_MOUNT_ATTEMPTS = 8;
const FIRST_MOUNT_TRANSIENT = [403, 404, 503];

/**
 * La ventana web con varias sesiones a la vez (plan web varias sesiones, W1–W4 y W6): el conjunto de
 * la cookie da una sesión por (correo, organización) y cada workspace del riel abre con la suya. Abrir
 * un workspace es un cambio en el cliente: no hay `organizations/select` ni `workspaces/select`, y la
 * página no recarga. Un error de un contexto se queda en su grupo; solo la cookie muerta cierra todo.
 */
export function startWindow(options: WebSessionDeployment, root: HTMLElement) {
  return createRoot(dispose => {
    aplicarLengua();
    seguirElTema();
    const lifetime = new AbortController();
    const request: typeof fetch = (input, init = {}) => lifetime.signal.aborted ? Promise.reject(new DOMException('The page was closed', 'AbortError')) : platformFetch(input, { ...init, signal: init.signal ? AbortSignal.any([init.signal, lifetime.signal]) : lifetime.signal });
    // El eco de la organización se comprueba con el conjunto de la cookie (M2 del dictamen de seguridad).
    const api = platformSession(options, request, context => sessions.scopeOf(context)?.org ?? null);
    const raw = platformTransport(options, request);
    const [caps, setCaps] = createSignal<CapabilitiesSnapshot | null>(null);
    const [error, setError] = createSignal('');
    const [preparing, setPreparing] = createSignal(false);
    const [signedOut, setSignedOut] = createSignal(false);
    const [identified, setIdentified] = createSignal(false);
    const [reauthFailed, setReauthFailed] = createSignal(false);
    const returnError = signInError(window.location.search);
    let windowApp: ReturnType<typeof mountWindow> | undefined;
    let disposeGate: (() => void) | undefined;
    let cache: ReturnType<typeof workspaceCache> | undefined;
    let stopped = false;
    let mounted = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let wait = FIRST_RETRY_MS;
    const home = new URL(import.meta.env.BASE_URL, window.location.origin).href;
    const returnSearch = new URLSearchParams(window.location.search);
    let harnessWorkspace = parseWorkspaceAddLink(returnSearch);
    const loginReturn = new URL(home);
    if (harnessWorkspace) {
      for (const key of ["add_workspace", "org", "workspace", "account"]) {
        const value = returnSearch.get(key);
        if (value) loginReturn.searchParams.set(key, value);
      }
    }
    const permits = (name: string) => supports(caps(), name);
    const gone = () => stopped || signedOut() || exit.leaving();
    const sessions = webSessionCommands(raw, { expired: () => expired() });
    const active = windowActiveContext(sessions);
    // Las fuentes que llaman directo a `platformFetch` llevan el mismo contexto que `active.scoped`.
    setEdgeContext(options.origin, () => active.current()?.context ?? null);
    const rail = webRailCatalog(sessions);
    /** La lista de máquinas de cada contexto, compartida por la facturación, la ventana y sus pantallas. */
    const machines = contextMachinesQuery(context => contextMachines(`${options.origin}/v1`, raw, __DANIL_WEB_RELAY_ORIGINS__, context));
    /** Un 401 sin contexto propio es la cookie muerta; uno con `X-Danil-Session` es de ese contexto. */
    const guarded = (send: typeof raw.call): typeof raw.call => async (path, init) => {
      try { return await send(path, init); }
      catch (cause) {
        if (cause instanceof PlatformSessionError && cause.status === 401 && !new Headers(init?.headers).has('X-Danil-Session')) expired();
        throw cause;
      }
    };
    /** Una escritura de identity o workspaces cambia el conjunto, el catálogo o la persona: las lecturas compartidas se olvidan. */
    const invalidating = (send: typeof raw.mutation): typeof raw.mutation => (path, init) => {
      if (!/^\/?(identity|workspaces)(\/|\?|$)/.test(path)) return send(path, init);
      sessions.invalidate();
      return send(path, init).finally(sessions.invalidate);
    };
    const plain = { call: guarded(raw.call), mutation: guarded(invalidating(raw.mutation)) };
    const transport = active.scoped(plain);
    function gate() {
      windowApp?.close();
      windowApp = undefined;
      disposeGate?.();
      root.replaceChildren();
      disposeGate = render(() => <Show when={identified() && !signedOut() && !preparing()} fallback={<><ToastStack><UpdateNotice /></ToastStack><Show when={signedOut() || returnError} fallback={<SessionLoading onSignOut={preparing() ? () => void exit.leave() : undefined} />}><WorkosAuthPage loginUrl={api.loginUrl(loginReturn.href)} error={returnError} /></Show></>}><main class="flex h-full flex-col gap-4 overflow-y-auto bg-bg p-10 text-neutral-950" data-web-gate="">
        <ToastStack><UpdateNotice /></ToastStack>
        <h1 class="m-0 font-display text-lead font-bold">{t('common.brand_name')}</h1>
        <Show when={error()}><p role="alert">{t(error())}</p><Button onClick={() => void load()}>{t('web.computers.retry')}</Button></Show>
        <Button variant="ghost" data-web-sign-out="" onClick={() => void exit.leave()}>{t('web.platform.sign_out')}</Button>
      </main></Show>, root);
    }
    function expired() {
      if (stopped || signedOut()) return;
      stopServices();
      if (cache) cache.clear();
      else clearWebCaches(localStorage);
      setSignedOut(true);
      setPreparing(false);
      setError('');
      setIdentified(true);
      gate();
    }
    function later(delay = wait) {
      clearTimeout(timer);
      if (gone()) return;
      timer = setTimeout(() => void (mounted ? refresh() : load()), delay);
      wait = Math.min(wait * 2, POLL_MS);
    }
    async function refresh() {
      if (gone()) return;
      let ready = false;
      try {
        setCaps(await readCapabilities(plain));
        if (!gone()) [ready] = await Promise.all([windowApp?.refresh() ?? false, rail.refresh()]);
      } catch (cause) { wait = retryWait(cause, wait); }
      finally { later(ready ? POLL_MS : wait); }
    }
    const exit = sessionExit({
      closed: () => stopped || signedOut(), cancel: () => clearTimeout(timer), logout: async () => { await signOutPlatform().catch(() => {}); await api.logout(); }, signedOut: () => { forgetMachineNames(); expired(); },
      unavailable: () => { if (!gone()) { setPreparing(false); setError('web.platform.unavailable'); gate(); } },
    });
    /** La persona según `me` con el contexto de su organización personal (nunca el de por omisión). */
    async function person(status: WebSessionStatus): Promise<PlatformProfile> {
      const first = active.current();
      const family = status.sessions.find(f => f.sub === first?.sub) ?? status.sessions[0];
      const reply = first ? await sessions.handle('danil_edge_fetch', { method: 'GET', path: '/v1/identity/me', context: first.context }).catch(() => null) as { status: number; body?: { name?: unknown; email?: unknown } } | null : null;
      const body = reply?.status === 200 ? reply.body : null;
      return { id: family.sub, name: typeof body?.name === 'string' ? body.name : family.email ?? '', email: typeof body?.email === 'string' ? body.email : family.email, workspace: null, organizations: active.groups(status).filter(g => g.sub === family.sub).map(g => ({ id: g.org, name: g.name, type: g.personal ? 'personal' : null })), active_organization_id: first?.org ?? null };
    }
    async function load() {
      if (gone() || mounted) return;
      setError('');
      try {
        const [status, capabilities] = await Promise.all([sessions.handle('danil_session_status') as Promise<WebSessionStatus>, readCapabilities(plain).catch(() => caps())]);
        if (gone() || status.state !== 'connected') return;
        setCaps(capabilities);
        if (!status.sessions.length) throw new PlatformSessionError(503, null);
        mount(await person(status));
      } catch (cause) {
        if (gone()) return;
        const status = cause instanceof PlatformSessionError ? cause.status : (cause as { status?: number } | null)?.status ?? 0;
        const shown = preparing() && !error();
        if (FIRST_MOUNT_TRANSIENT.includes(status) || (cause as { detail?: string } | null)?.detail === 'unavailable') {
          if (++attempts >= FIRST_MOUNT_ATTEMPTS) { setPreparing(false); setError('web.platform.unavailable'); }
          else setPreparing(true);
        } else { setPreparing(false); setError(status === 403 ? 'web.platform.denied' : 'web.platform.unavailable'); }
        setIdentified(true);
        // La carga ya pintada no se repinta en cada reintento.
        if (!(shown && preparing() && !error())) gate();
        later();
      }
    }
    function mount(profile: PlatformProfile) {
      if (gone()) return;
      mounted = true;
      setPreparing(false);
      setIdentified(true);
      cache = workspaceCache(localStorage, profile.id, 'contexts');
      setShellCacheScope({ mine: () => false, prefer: null });
      disposeGate?.();
      disposeGate = undefined;
      const picker = webWorkspacePicker(plain, { store: window.sessionStorage, takeHarnessWorkspace: () => { const link = harnessWorkspace; harnessWorkspace = null; return link; }, signIn: organization => window.location.assign(api.loginUrl(loginReturn.href, organization)) });
      const organizations = active.organizations(() => sessions.handle('danil_session_status'));
      setFreeRouterHost({ edge: freeRouterWebEdge(transport), engine: policy => freeRouterEngine(policy ? freeModelScope(policy) : undefined),
        identity: active.freeRouterIdentity(rail.accountOf) });
      const billing = windowBilling(active.scoped(plain, active.of(profile.active_organization_id, profile.id)), profile, organizations, () => undefined, async (id, signal) => {
        const group = active.of(id)();
        const listed = group ? await machines(group.context).list(signal) : null;
        return listed?.kind === 'ok' ? organizationMachine(id, listed.value) : null;
      }, active.billingFor(plain, profile.id));
      const current = async () => { const group = active.current(); return group ? { context: group.context, org: group.org, name: group.name, plan: group.plan, role: group.role } : null; };
      windowApp = mountWindow({ sessions, rail, contextMachines: machines, permits, relayOrigin: __DANIL_WEB_RELAY_ORIGINS__[0], credentials: webCredentialSource(options.origin, transport),
        profile: webAccountProfile(transport), active,
        onUnavailable: () => { setError('web.platform.unavailable'); mounted = false; gate(); later(); },
        services: {
          webWorkspacePicker: picker,
          danilCredits: { readBalance: async signal => { const group = active.current(); return group ? api.creditsBalance(group.org, signal, group.context) : null; } },
        },
        // W4: una organización con la sesión vencida ofrece volver a entrar a esa organización.
        // Admite solo esa organización (como el «+»): un login completo reemplazaría todo el conjunto de la cookie. Solo
        // si identity exige SSO o MFA (409 organization_auth_required) el selector manda al login de esa organización.
        reauth: { needed: () => !!expiredGroup(), failed: reauthFailed, signIn: () => { const g = expiredGroup(); setReauthFailed(false); if (g) void picker.admit({ session: g.family, sub: '', email: g.email ?? '', org: g.org, organization: g.org_name ?? '', context: null, admission_required: true, catalog_state: 'listed' }, { resume: false }).then(() => sessionRailState()?.sessions.refresh()).catch(() => setReauthFailed(true)); } },
        billing, groupAccount: { send: api.groupAccount.send, current, legacy: () => false, contexts: () => active.groups().map(g => g.context) },
      }, { storage: cache.storage, webAccounts: {
        current: { user_id: profile.id, name: profile.name, email: typeof profile.email === 'string' ? profile.email : null, extra: false },
        others: () => [], open: () => {}, remove: async () => {}, signOut: () => void exit.leave(),
      } });
      void refresh();
    }
    const expiredGroup = () => sessionRailState()?.groups()?.find(g => g.empty_reason === 'session_expired') ?? null;
    function stopServices() { clearTimeout(timer); lifetime.abort(); }
    const close = () => { stopped = true; stopServices(); setEdgeContext(null); windowApp?.close(); disposeGate?.(); dispose(); };
    window.addEventListener('pagehide', close, { once: true });
    gate();
    void load();
    return close;
  });
}
