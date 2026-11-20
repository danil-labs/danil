/** El Free router de plataforma de esta ventana: un anfitrión (Desk o web) y un cliente por motor; sin anfitrión, cerrado. */
import type { FreeModelPolicy } from "../../lib/free-model-policy.ts";
import { createFreeRouterPlatform, platformScope, type EdgeSend, type EngineCall, type FreeRouterPlatform, type FreeRouterScope } from "./free-router-platform.ts";

export type FreeRouterHost = {
  edge: EdgeSend;
  /** La persona (`/me.id`) y el listado de `/v1/workspaces` de la sesión de plataforma; `null` sin sesión. */
  identity: () => Promise<{ sub: string; list: unknown } | null>;
  /** Las órdenes del motor que sirve ese workspace del motor; `null`, el motor de la máquina activa. */
  engine: (policy: FreeModelPolicy | null) => EngineCall;
};

/** El código con que el motor nuevo contesta `set_provider_consent` en un workspace que no es personal. */
export const PLATFORM_REQUIRED = "free_router.platform_required";

let host: FreeRouterHost | null = null;
const routers = new Map<string, FreeRouterPlatform>();
const policies = new Map<string, FreeModelPolicy>();
const scopes = new Map<string, FreeRouterScope>();

export function setFreeRouterHost(next: FreeRouterHost | null): void {
  host = next;
  routers.clear();
  policies.clear();
  scopes.clear();
}

const keyOf = (policy: FreeModelPolicy) => `${policy.workspace_id}\n${policy.destination_machine ?? ""}`;
const closed = (code = "free_router_unavailable") => ({ code });

function routerFor(policy: FreeModelPolicy, h: FreeRouterHost): FreeRouterPlatform {
  let router = routers.get(keyOf(policy));
  if (!router) routers.set(keyOf(policy), (router = createFreeRouterPlatform({ edge: h.edge, engine: h.engine(policy) })));
  policies.set(keyOf(policy), policy);
  return router;
}

/** El account activo de la sesión para este workspace del motor; sin él, el Router no se ofrece. */
async function scopeOf(policy: FreeModelPolicy, h: FreeRouterHost): Promise<FreeRouterScope> {
  const who = await h.identity().catch(() => null);
  const active = who && (who.list as { active_workspace_id?: unknown } | null)?.active_workspace_id;
  const scope = who && typeof active === "string" ? platformScope(who.list, active, who.sub, policy.workspace_id) : null;
  if (!scope) throw closed();
  return scope;
}

/** Activar en un workspace de plataforma: el sí en `workspaces` sobre el texto que vio la persona, el vínculo y el pase. */
export async function activatePlatform(policy: FreeModelPolicy): Promise<void> {
  const h = host;
  if (!h) throw closed();
  const scope = await scopeOf(policy, h);
  const router = routerFor(policy, h);
  const state = await router.read(scope.account);
  if (state.kind !== "ready") throw closed(state.kind === "unavailable" ? state.code : undefined);
  if (!state.offered) throw closed("not_offered");
  // Se acepta solo la política que la persona leyó: otra versión o proveedores es otro texto.
  const same = state.policy.version === policy.version && state.policy.providers.length === policy.providers.length &&
    state.policy.providers.every((p) => policy.providers.includes(p));
  if (!same) throw closed("policy_changed");
  if (!state.consent.accepted) await router.accept(scope.account, { revision: state.consent.revision, ...state.policy });
  await router.link(scope);
  await router.grant(scope);
  scopes.set(keyOf(policy), scope);
}

/** Retirar en un workspace de plataforma: DELETE del consentimiento y luego `clear`, dentro del cliente. */
export async function withdrawPlatform(policy: FreeModelPolicy): Promise<void> {
  const h = host;
  if (!h) throw closed();
  const scope = scopes.get(keyOf(policy)) ?? (await scopeOf(policy, h));
  await routerFor(policy, h).withdraw(scope);
  scopes.delete(keyOf(policy));
}

/** Antes de soltar la sesión: cada motor conocido suelta a esta persona (también tras reiniciar la ventana) y se borran sus bindings. */
export async function signOutPlatform(): Promise<void> {
  const h = host;
  if (!h) return;
  const who = await h.identity().catch(() => null);
  const subs = new Set([...scopes.values()].map((s) => s.sub).concat(who ? [who.sub] : []));
  if (!routers.has("")) routers.set("", createFreeRouterPlatform({ edge: h.edge, engine: h.engine(null) }));
  await Promise.all([...routers.entries()].map(async ([key, router]) => {
    const engine = key ? h.engine(policies.get(key)!) : h.engine(null);
    const listed = (await engine("list_workspaces", {}).catch(() => null)) as { workspaces?: { id?: unknown }[] } | null;
    const workspaces = (listed?.workspaces ?? []).map((w) => w.id).filter((id): id is string => typeof id === "string");
    await Promise.all([...subs].map((sub) => router.signOut(sub, workspaces).catch(() => {})));
  }));
  scopes.clear();
}

/** El motor marca la política de un workspace que no es personal (campo aditivo); sin la marca, camino personal. */
export const isPlatformPolicy = (policy: FreeModelPolicy): boolean => (policy as { authority?: unknown }).authority === "platform";

/** Si un rechazo del motor pide el camino de plataforma. */
export const needsPlatform = (e: unknown): boolean =>
  e === PLATFORM_REQUIRED || (!!e && typeof e === "object" && [(e as { code?: unknown }).code, (e as { detail?: unknown }).detail].includes(PLATFORM_REQUIRED));
