/**
 * El gobierno de Radiant del workspace activo, compartido por las pantallas que
 * bloquea. Espeja `src-tauri/src/workspace/governed.rs`. El backend rechaza la
 * edición igual; aquí solo se pinta de solo lectura.
 */
import { listen } from "./serviceEvents";
import { createSignal } from "solid-js";
import { invoke } from "../engine/client.ts";
import { capabilities } from "./platform";

export type GovernedSection = "context_sources" | "mcp_servers" | "skills" | "agents" | "models";

export type Governed = {
  workspace_id: string;
  workspace_name: string;
  server: string;
  mode: string;
  locked: string[];
  policy_revision: string;
  expires_at: number;
  last_ok: number;
  previous_root?: string | null;
  last_error?: string | null;
};

export type McpState = {
  id: string;
  name: string;
  url: string;
  auth: string;
  tailnet: boolean;
  active: boolean;
  reason?: string | null;
};

export type Tailscale =
  | { kind: "missing" }
  | { kind: "stopped" }
  | { kind: "connected"; tailnet: string; suffix: string };

export type RemoteConnection = {
  id: string;
  provider: string;
  name: string;
  owner: string;
  purpose: string;
  status: string;
};

export type GovernanceSummary = {
  sources: { id: string; name: string; role: string; files: number }[];
  skills: string[];
  agents: string[];
  mcp: McpState[];
  models: { providers: string[]; allowed: string[]; default: string | null };
  connections: RemoteConnection[];
  tailnet: { tailnet: string; required: boolean; state: Tailscale } | null;
  issued_at: number;
};

export type GovernanceStatus = {
  governed: Governed | null;
  stale: boolean;
  notice: string | null;
  summary: GovernanceSummary | null;
};

const [status, setStatus] = createSignal<GovernanceStatus | null>(null);
let request = 0;
let started = false;

export async function reloadGovernance() {
  const mine = ++request;
  try {
    const next = await invoke<GovernanceStatus>("radiant_governance_status");
    if (mine === request) setStatus(next);
  } catch {
    if (mine === request) setStatus(null);
  }
}

/** Una respuesta de un comando de gobierno: entra y descarta lo que esté en vuelo. */
export function adoptGovernance(next: GovernanceStatus) {
  request++;
  setStatus(next);
}

export function governance(): GovernanceStatus | null {
  // La web no ofrece Radiant: ni pide su gobierno ni lo pinta.
  if (!capabilities().radiant) return null;
  if (!started) {
    started = true;
    void listen("radiant", () => void reloadGovernance());
    // Lo del workspace anterior no se pinta en el siguiente mientras llega la respuesta.
    window.addEventListener("harness:workspace", () => {
      request++;
      setStatus(null);
      void reloadGovernance();
    });
    void reloadGovernance();
  }
  return status();
}

/** El gobierno que bloquea esta sección, o `null` si se edita aquí. */
export function lockedBy(section: GovernedSection): Governed | null {
  const g = governance()?.governed;
  return g && g.mode === "managed" && g.locked.includes(section) ? g : null;
}
