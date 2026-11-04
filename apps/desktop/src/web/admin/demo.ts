import type { Membership } from "../../../../../packages/attention/src/support-access.ts";
import type { AuditEntry } from "../audit-log";
import type { AdminSource } from "./AdminPage";
import type { Member, MembersSource } from "./Members";
import type { OrganizationSource } from "./Organization";
import type { PolicyArea, PolicyPull, PolicySource } from "./PolicyFlow";
import type { PolicyRule } from "./Rules";
import { sharedDemo } from "./Shared";
import type { UsagePersonRow, UsageReport, UsageSource } from "./Usage";

const REVISION = "9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b";
const NEXT = "1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c";

const PEOPLE: UsagePersonRow[] = [
  { id: "maria", name: "María", tasks: 142, turns: 980, tokens: 17_100_000, agentHours: 71, machineHours: 320, costUsd: 188 },
  { id: "jose", name: "José", tasks: 101, turns: 744, tokens: 13_400_000, agentHours: 58, machineHours: 240, costUsd: 141 },
  { id: "ana", name: "Ana", tasks: 73, turns: 460, tokens: 7_700_000, agentHours: 35, machineHours: 142, costUsd: null },
];

function report(people: UsagePersonRow[], days: number): UsageReport {
  const sum = (pick: (row: UsagePersonRow) => number) => people.reduce((total, row) => total + pick(row), 0);
  const share = days / 30;
  const scale = (value: number) => Math.round(value * share);
  const reported = people.filter((row) => row.costUsd !== null);
  const turns = sum((row) => row.turns);
  const tokens = sum((row) => row.tokens);
  return {
    costUsd: reported.length ? scale(reported.reduce((total, row) => total + (row.costUsd ?? 0), 0)) : null,
    coverage: { reported: scale(reported.reduce((total, row) => total + row.turns, 0)), total: scale(turns), missing: reported.length === people.length ? [] : ["Codex"] },
    tokens: scale(tokens), turns: scale(turns), tasks: scale(sum((row) => row.tasks)), agentHours: scale(sum((row) => row.agentHours)), machineHours: scale(sum((row) => row.machineHours ?? 0)),
    daily: Array.from({ length: days }, (_, i) => ({
      date: new Date(Date.UTC(2026, 9, 31 - days + 1 + i)).toISOString().slice(0, 10),
      tokens: Math.round((tokens / 30) * (i === days - 6 ? 4.2 : 0.6 + ((i * 7) % 5) * 0.2)),
    })),
    models: [["Opus 5.5", 0.48], ["Sonnet 5.5", 0.29], ["GPT-6.1", 0.16], ["Haiku 5.5", 0.07]].map(([name, part]) => ({ name: name as string, tokens: Math.round(tokens * share * (part as number)) })),
    people: people.map((row) => ({ ...row, tasks: scale(row.tasks), turns: scale(row.turns), tokens: scale(row.tokens), agentHours: scale(row.agentHours), machineHours: scale(row.machineHours ?? 0), costUsd: row.costUsd === null ? null : scale(row.costUsd) })),
    tools: [{ name: "Bash", calls: scale(8420), errors: scale(212) }, { name: "Edit", calls: scale(3105), errors: scale(41) }, { name: "mcp · github", calls: scale(612), errors: scale(9) }],
  };
}

const usageDemo = (own: boolean): UsageSource => ({
  people: async () => PEOPLE.map(({ id, name }) => ({ id, name })),
  report: async ({ period, person }) => report(own ? PEOPLE.slice(0, 1) : person ? PEOPLE.filter((row) => row.id === person) : PEOPLE, period === "7d" ? 7 : 30),
});

function membersDemo(): MembersSource {
  let rows: Member[] = [
    { id: "1", name: "María Hernández", email: "maria@ejemplo.mx", role: "owner", invited: false },
    { id: "2", name: "José Ramírez", email: "jose@ejemplo.mx", role: "admin", invited: false },
    { id: "3", name: "Ana Torres", email: "ana@ejemplo.mx", role: "member", invited: false },
    { id: "4", name: "", email: "luis@ejemplo.mx", role: "member", invited: true },
  ];
  return {
    list: async () => rows,
    invite: async (email, role) => void (rows = [...rows, { id: String(rows.length + 10), name: "", email, role, invited: true }]),
    setRole: async (id, role) => void (rows = rows.map((row) => (row.id === id ? { ...row, role } : row))),
    remove: async (id) => void (rows = rows.filter((row) => row.id !== id)),
  };
}

const RULES: PolicyRule[] = [
  { id: "models", name: "Modelos permitidos", value: "Opus 5.5, Sonnet 5.5, GPT-6.1", enforcement: "client", scope: "workspace" },
  { id: "mcp", name: "Servidores MCP de terceros", value: "Solo los de la lista compartida", enforcement: "advisory", scope: "workspace" },
  { id: "network", name: "Red", value: "Tailnet de la organización", enforcement: "advisory", scope: "workspace" },
  { id: "gateway", name: "Skills y agentes del gateway", value: "Fijados a un commit aprobado", enforcement: "server", scope: "workspace" },
  { id: "org-models", name: "Modelos en toda la organización", value: "Sin modelos gratuitos", enforcement: "advisory", scope: "organization" },
];

function policyDemo(internal: boolean): PolicySource {
  const contents: Record<PolicyArea, string> = {
    rules: 'models:\n  allowed: ["opus-5.5", "sonnet-5.5", "gpt-6.1"]\nenforcement:\n  mode: advisory\n',
    skills: 'skills:\n  - id: revisar-pr\n    required: true\n',
    mcp: 'mcp_servers:\n  - id: jira\n    url: https://mcp.atlassian.com\n',
    agents: 'agents:\n  - id: qa\n    folder: practicas/agents/qa\n',
  };
  const pulls: Record<PolicyArea, PolicyPull[]> = {
    rules: [
      { id: "1", number: 48, title: "Permitir Haiku 5.5", url: "https://github.com/ejemplo/politica/pull/48", author: "José", state: "review", proposedRevision: NEXT },
      { id: "2", number: 47, title: "Modo gestionado en red", url: "https://github.com/ejemplo/politica/pull/47", author: "María", state: "merged", proposedRevision: REVISION },
    ],
    skills: [{ id: "3", number: 49, title: "Hacer obligatoria escribir-en-espanol", url: "https://github.com/ejemplo/politica/pull/49", author: "María", state: "checks", proposedRevision: NEXT }],
    mcp: [], agents: [],
  };
  return {
    current: async (area) => ({ revision: REVISION, repository: internal ? null : { name: "ejemplo/politica", path: "policy.yaml" }, content: contents[area] }),
    validate: async (area, candidate) => {
      if (candidate.includes("\t") || !candidate.includes(":")) return { valid: false, errors: [{ path: "/", message: "No se pudo leer como YAML." }], changed: false, added: [], modified: [], removed: [], proposedRevision: null };
      const changed = candidate !== contents[area];
      return { valid: true, errors: [], changed, added: [], modified: changed ? [area] : [], removed: [], proposedRevision: changed ? NEXT : REVISION };
    },
    pulls: async (area) => (internal ? pulls[area].map((row) => ({ ...row, url: null })) : pulls[area]),
    open: async (area, _candidate, proposal) => void (pulls[area] = [{ id: String(Date.now()), number: 50, title: "Cambio propuesto", url: "https://github.com/ejemplo/politica/pull/50", author: "María", state: "checks", proposedRevision: proposal.proposedRevision ?? NEXT }, ...pulls[area]]),
  };
}

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const entry = (id: number, over: Partial<AuditEntry>): AuditEntry => ({
  id, created_at: ago(id * 45), event_type: "row.update", entity_type: "agents", action: "update", changed_fields: [], actor_type: "user",
  actor_name: null, actor_email: null, on_behalf_of_name: null, on_behalf_of_email: null, support_grant_id: null, ...over,
});

const auditDemo: AuditEntry[] = [
  entry(1, { actor_type: "ai", changed_fields: ["instructions"], on_behalf_of_email: "maria@ejemplo.mx" }),
  entry(2, { actor_type: "member", entity_type: "channels", action: "insert", actor_email: "jose@ejemplo.mx" }),
  entry(3, { actor_type: "danil_support", event_type: "support_access.granted", actor_email: "soporte@danil.ai" }),
  entry(4, { actor_type: "member", event_type: "machine.started", entity_type: null, actor_email: "maria@ejemplo.mx" }),
  entry(5, { actor_type: "ai", event_type: "task.created", entity_type: null, on_behalf_of_email: "ana@ejemplo.mx" }),
  entry(6, { actor_type: "member", event_type: "mcp.connected", entity_type: null, actor_email: "ana@ejemplo.mx" }),
  entry(7, { actor_type: "member", event_type: "credential.rotated", entity_type: null, actor_email: "jose@ejemplo.mx" }),
  entry(8, { actor_type: "user", event_type: "session.started", entity_type: null }),
];

const organizationOf = (plan: string, enterprise: boolean, workspace: string, other: string): OrganizationSource => ({
  workspaces: async (_account: number) => [{ id: 1, name: workspace, members: 4 }, { id: 2, name: other, members: 7 }],
  plan: async () => ({ name: plan, detail: "2 workspaces · 11 personas" }),
  identity: enterprise ? [{ id: "sso", value: "Activo con Okta" }, { id: "domains", value: "ejemplo.mx" }, { id: "retention", value: "365 días" }] : undefined,
});

/** Lo de una cuenta personal en Configuración. */
export const personalDemo = { usage: usageDemo(true), plan: async () => ({ name: "Personal", detail: "1 workspace" }) };

/** Las cuatro cuentas de la vista previa; `account` llega de `?account=`. */
export function adminDemo(account: string | null, workspace: string, other: string, internalPolicy: boolean): Pick<AdminSource, "memberships" | "active" | "shared" | "workspace" | "auditLog" | "usage" | "members" | "rules" | "policy" | "organization"> {
  const personal = account === "personal";
  const enterprise = account === "enterprise";
  const row: Membership = personal
    ? { id: 1, name: workspace, role: "owner", organization: null, plan: "Personal" }
    : { id: 1, name: workspace, role: account === "member" ? "member" : "owner", organization: "Danil", organizationId: 1, plan: enterprise ? "Enterprise" : "Teams" };
  return {
    memberships: async () => [row, { id: 2, name: other, role: "member", organization: row.organization, organizationId: row.organizationId, plan: row.plan }],
    active: async () => 1,
    workspace: null,
    shared: sharedDemo(),
    auditLog: { list: async () => ({ kind: "ok", entries: auditDemo, more: false }) },
    usage: usageDemo(account === "member"),
    members: membersDemo(),
    rules: { rules: async () => RULES },
    policy: policyDemo(internalPolicy),
    organization: organizationOf(row.plan ?? "", enterprise, workspace, other),
  };
}
