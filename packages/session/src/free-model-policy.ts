import type { Frase } from "../../ui/src/lib/prose.ts";

export type FreeModelPolicy = {
  workspace_id: string;
  version: number;
  providers: string[];
  lines: Frase[];
  acceptance_ref: string;
  enabled: boolean;
  terms: { label: string; url: string }[];
  accepted: boolean;
  destination_machine?: string;
  authority?: string;
};

export type FreeModelConsent = {
  workspace_id: string;
  version: number;
  providers: string[];
  policy_id: string;
  acceptance_id: string;
};

export type FreeModelStartup = {
  active: string | null;
  free_model_policy?: FreeModelPolicy;
};

/** El motor marca la política de un workspace que no es personal (campo aditivo); sin la marca, camino personal. */
export function isPlatformFreeModelPolicy(policy: Pick<FreeModelPolicy, "authority"> | null | undefined): boolean {
  return policy?.authority === "platform";
}

/**
 * Si la política puede activarse/usarse en la interfaz: en workspaces personales
 * manda `enabled`; en los de organización/plataforma decide la plataforma al activar,
 * aunque el motor aún reporte `enabled: false` antes de existir un grant local.
 */
export function freeModelPolicyAvailable(policy: Pick<FreeModelPolicy, "enabled" | "authority"> | null | undefined): boolean {
  return !!policy && (policy.enabled || isPlatformFreeModelPolicy(policy));
}

export function freeModelPolicy(startup: FreeModelStartup): FreeModelPolicy | null {
  const policy = recognizedFreeModelPolicy(startup);
  return policy?.enabled ? policy : null;
}

/** Sin `pendingRef` exige la referencia de aceptación; con él basta para saber que el motor ofrece el Router. */
export function recognizedFreeModelPolicy(startup: FreeModelStartup, pendingRef = false): FreeModelPolicy | null {
  const policy = startup.free_model_policy;
  if (!policy || policy.workspace_id !== startup.active || policy.version !== 3 ||
    (!pendingRef && !policy.acceptance_ref) || !Array.isArray(policy.lines) || policy.lines.length === 0 ||
    !sameProviders(policy.providers, ["kilo", "vercel", "reflection"])) return null;
  return policy;
}

function sameProviders(a: string[], b: string[]): boolean {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  return a.length === b.length && new Set(a).size === a.length && a.every((id) => b.includes(id));
}

export function sameFreeModelPolicy(a: FreeModelPolicy, b: FreeModelPolicy | null): boolean {
  return !!b && a.workspace_id === b.workspace_id && a.version === b.version && a.destination_machine === b.destination_machine && sameProviders(a.providers, b.providers);
}

export function acceptedFreeModelPolicy(policy: FreeModelPolicy, consent?: FreeModelConsent): boolean {
  return !!consent && consent.workspace_id === policy.workspace_id && consent.version === policy.version &&
    !!consent.policy_id && !!consent.acceptance_id && sameProviders(consent.providers, policy.providers);
}

export const freeModelScope = (policy: Pick<FreeModelPolicy, "workspace_id" | "destination_machine">) => ({ headers: { "x-terminus-workspace": policy.workspace_id, ...(policy.destination_machine ? { "x-terminus-machine": policy.destination_machine } : {}) } });
