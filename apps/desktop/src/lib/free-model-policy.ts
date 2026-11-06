import type { Frase } from "./prose.ts";

export type FreeModelPolicy = {
  workspace_id: string;
  version: number;
  providers: string[];
  lines: Frase[];
  acceptance_ref: string;
  enabled: boolean;
  terms: { label: string; url: string }[];
  accepted: boolean;
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

export function freeModelPolicy(startup: FreeModelStartup): FreeModelPolicy | null {
  const policy = startup.free_model_policy;
  if (!policy || policy.workspace_id !== startup.active || policy.version !== 2 || !policy.enabled ||
    !policy.acceptance_ref || policy.lines.length === 0 ||
    !sameProviders(policy.providers, ["kilo", "vercel", "reflection"])) return null;
  return policy;
}

function sameProviders(a: string[], b: string[]): boolean {
  return a.length === b.length && new Set(a).size === a.length && a.every((id) => b.includes(id));
}

export function sameFreeModelPolicy(a: FreeModelPolicy, b: FreeModelPolicy | null): boolean {
  return !!b && a.workspace_id === b.workspace_id && a.version === b.version && sameProviders(a.providers, b.providers);
}

export function acceptedFreeModelPolicy(policy: FreeModelPolicy, consent?: FreeModelConsent): boolean {
  return !!consent && consent.workspace_id === policy.workspace_id && consent.version === policy.version &&
    !!consent.policy_id && !!consent.acceptance_id && sameProviders(consent.providers, policy.providers);
}

export const freeModelScope = (policy: FreeModelPolicy) => ({ headers: { "x-terminus-workspace": policy.workspace_id } });
