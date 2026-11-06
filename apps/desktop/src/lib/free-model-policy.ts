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
  destination_machine?: string;
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
  const policy = recognizedFreeModelPolicy(startup);
  return policy?.enabled ? policy : null;
}

export function recognizedFreeModelPolicy(startup: FreeModelStartup): FreeModelPolicy | null {
  const policy = startup.free_model_policy;
  if (!policy || policy.workspace_id !== startup.active || policy.version !== 2 ||
    !policy.acceptance_ref || !Array.isArray(policy.lines) || policy.lines.length === 0 ||
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
