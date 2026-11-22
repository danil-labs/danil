import type { MachineResources, MachineTaskUsage } from "../../../../../packages/engine-client/src/index.ts";

/**
 * «Máquinas» sin motor: vm-alberto con su medición real (4 vCPU, 15,6 GB) y
 * `engine_update_v1`, esta Mac con reparto aproximado, una VM con motor anterior
 * (solo disco, sin `engine_update_v1`), una apagada con copia y otra sin copia.
 * `mode` lleva a vm-alberto a normal, presión alta o crítica, con las cifras de
 * la vista previa aprobada (`machines-card-v2.html`).
 */
export type Mode = "normal" | "high" | "critical";

const GB = 1024 ** 3;
const MIN = 60_000;
export const WORKSPACE = "ws-danil";

const MODES = {
  normal: { memory: 5, io: 2, cpu: 6, used: 7.1, scale: 0.65, swap: 0, usage: 18 },
  high: { memory: 25, io: 48, cpu: 7, used: 12.9, scale: 1, swap: 1.4, usage: 9 },
  critical: { memory: 44, io: 69, cpu: 7, used: 15.1, scale: 1.15, swap: 6.8, usage: 6 },
} as const;

/** El bloque `engine` de vm-alberto con `engine_update_v1`: hay una release firmada más nueva. */
const ALBERTO_ENGINE = {
  version: "0.2.73", build: "09a2e33c71", available: true, channel: "stable",
  latest: { release: "v0.2.74", version: "0.2.74", commit: "5be01d2a90", sha256: "9f…", published_at: "2026-10-30T02:10:00Z" },
  update_available: true, handover_pending: false, download: null, pending: null, last: null,
};
/** Lo que pidió «Actualizar» en esta página: el motor lo devuelve en `pending`. */
let requested: { pending?: { request_id: string; release: string; mode: "now" | "when_idle" }; handover_pending?: boolean } = {};

const RAMPA = [0.3, 0.35, 0.5, 0.6, 0.7, 0.85, 1, 0.95, 0.9, 1];

type Seed = { session: string; title: string; project: string; state: MachineTaskUsage["state"]; gb: number; processes: number; top: [string, number, number?][]; ended?: number; archived?: boolean; browsers?: string[] };

const ALBERTO: Seed[] = [
  { session: "s-machines", title: "Diseño de la tarjeta de máquinas", project: "Terminus", state: "running", gb: 2.4, processes: 23,
    top: [["chrome", 0.5], ["chrome", 0.3], ["chrome", 0.25], ["chrome", 0.15], ["node · mount-frontend", 0.6]], browsers: ["s-machines"] },
  { session: "s-support", title: "Acceso de soporte para clientes", project: "danil-workspace", state: "running", gb: 1.6, processes: 17,
    top: [["chrome", 0.32], ["chrome", 0.3], ["node · expo start", 0.55], ["claude", 0.24]] },
  { session: "s-emails", title: "Correos en Configuración", project: "Terminus", state: "running", gb: 1.1, processes: 9,
    top: [["biome lint", 0.44], ["node · verify", 0.3], ["claude", 0.21]] },
  { session: "s-search", title: "Búsqueda global ⌘K", project: "Terminus", state: "idle", gb: 0.4, processes: 3,
    top: [["claude", 0.25], ["node", 0.11]] },
];

const LEFT: Seed[] = [
  { session: "s-inbox", title: "Revisión del rediseño del Inbox", project: "Terminus", state: "finished", gb: 0.9, processes: 14,
    top: [["chrome · agent-browser «gs261030»", 0.3], ["chrome · agent-browser «gs261030»", 0.25], ["chrome · agent-browser «gs261030»", 0.2], ["chrome · agent-browser «gs261030»", 0.1], ["chrome · agent-browser «gs261030»", 0.05]],
    ended: 2 * 60, browsers: ["gs261030"] },
  { session: "s-ports", title: "Arreglo de la vista de puertos", project: "Terminus", state: "finished", gb: 0.35, processes: 2,
    top: [["node · fake-computers :8787", 0.35]], ended: 5 * 60, archived: true },
];

function task(seed: Seed, scale: number, now: number): MachineTaskUsage {
  const bytes = Math.round(seed.gb * scale * GB);
  return {
    workspace: WORKSPACE, session: seed.session, state: seed.state,
    memory_bytes: bytes, memory_peak_bytes: Math.round(bytes * 1.2),
    // % de un núcleo, como `top`: la del navegador pasa de 100.
    cpu_percent: seed.state !== "running" ? 0 : seed.browsers ? 140 : 30, processes: seed.processes, pressure_memory: 0,
    browsers: (seed.browsers ?? []).map((session) => ({ session, since: now - 40 * MIN })),
    top: seed.top.map(([command, gb], i) => ({ pid: 4100 + i, command, rss_bytes: Math.round(gb * scale * GB) })),
    title: seed.title, project: seed.project,
    ended_at: seed.ended ? now - seed.ended * MIN : undefined, archived: !!seed.archived,
  };
}

function disk(used: number, total: number) {
  return [{ id: "data", label: "Datos del motor", total_bytes: total * GB, free_bytes: (total - used) * GB, available_bytes: (total - used) * GB, terminus_bytes: null, attribution: "unknown" as const }];
}

export function resources(mode: Mode, now = Date.now()): Record<string, MachineResources> {
  const m = MODES[mode];
  const total = 15.6 * GB;
  return {
    "vm-alberto": {
      measured_at: now - 4_000,
      storage: disk(150, 193),
      memory: { total_bytes: total, available_bytes: total - m.used * GB, swap_total_bytes: 7.8 * GB, swap_used_bytes: m.swap * GB },
      cpu: { cores: 4, load: [11.3, 88.9, 122.8], usage_percent: m.usage },
      pressure: { cpu: m.cpu, memory: m.memory, io: m.io, memory_history: RAMPA.map((k) => Math.round(Math.min(100, m.memory * k) * 10) / 10) },
      engine: { rss_bytes: 2.1 * GB, threads: 57, ...ALBERTO_ENGINE, ...requested },
      attribution: "cgroup",
      tasks: [...ALBERTO.map((s) => task(s, m.scale, now)), ...LEFT.map((s) => task(s, 1, now))],
      other: { memory_bytes: 1.2 * GB, processes: 212 },
      // El aviso del motor: memoria sobre 20 % sostenida dos minutos, con lo que más usa.
      ...(mode === "normal" ? {} : { pressure_alert: { since: now - 6 * MIN, memory: m.memory, tasks: ALBERTO.slice(0, 3).map((x) => ({ workspace: WORKSPACE, session: x.session, title: x.title, memory_bytes: Math.round(x.gb * m.scale * GB) })) } }),
      measure_us: 2_840,
    },
    local: {
      measured_at: now - 3_000,
      storage: disk(402, 994),
      memory: { total_bytes: 16 * GB, available_bytes: 6.7 * GB, swap_total_bytes: 2 * GB, swap_used_bytes: 0.4 * GB },
      cpu: { cores: 10, load: [2.1, 2.4, 2.2], usage_percent: 12 },
      pressure: { cpu: 3, memory: 2, io: 1 },
      engine: { rss_bytes: 0.6 * GB, threads: 31, version: "0.2.74", build: "5be01d2a90" },
      attribution: "best_effort",
      tasks: [
        task({ session: "s-local-a", title: "Notas de la versión 0.2.89", project: "Terminus", state: "running", gb: 2.2, processes: 8, top: [["node · vite", 1.1], ["claude", 0.3]] }, 1, now),
        task({ session: "s-local-b", title: "Revisión del contrato de soporte", project: "brand", state: "idle", gb: 0.9, processes: 2, top: [["claude", 0.4]] }, 1, now),
      ],
      other: { memory_bytes: 5.7 * GB, processes: 540 },
    },
    "vm-roberto": { measured_at: now - 6_000, storage: disk(41, 100) },
    // La copia de la flota: lo último que contestó antes de apagarse.
    "vm-linux-alberto": {
      measured_at: now - 9 * 24 * 60 * MIN,
      storage: disk(88, 200),
      memory: { total_bytes: 7.6 * GB, available_bytes: 5.1 * GB, swap_total_bytes: 0, swap_used_bytes: 0 },
      cpu: { cores: 2, load: [0.2, 0.3, 0.2], usage_percent: 4 },
      pressure: { cpu: 0, memory: 0, io: 1 },
      engine: { rss_bytes: 0.4 * GB, threads: 22, version: "0.2.71", build: "c3d9a01b44" },
      attribution: "cgroup",
      tasks: [],
      other: { memory_bytes: 2.1 * GB, processes: 150 },
    },
  };
}

/** Cuándo se guardó la copia de cada máquina apagada; sin entrada, no hay copia. */
export const cachedAt = (now = Date.now()): Record<string, number> => ({ "vm-linux-alberto": now - 9 * 24 * 60 * MIN });

export function machines() {
  const usage = ["remote_child_v1", "machine_usage_v1"];
  return [
    { id: "local", local: true, active: true, on: true, power: "on" as const, hosts: true, os: "macos" as const, features: usage, version: "0.2.74-5be01d2" },
    { id: "vm-alberto", local: false, active: false, on: true, power: "on" as const, hosts: true, wakes: true, os: "linux" as const, features: [...usage, "engine_update_v1"], version: "0.2.73-09a2e33" },
    { id: "vm-roberto", local: false, active: false, on: true, power: "on" as const, hosts: true, wakes: true, os: "linux" as const, features: ["remote_child_v1"], version: "0.2.61-1a2b3c4" },
    { id: "vm-linux-alberto", local: false, active: false, on: false, power: "off" as const, hosts: null, wakes: true, os: "linux" as const, version: "0.2.71-c3d9a01" },
    { id: "vm-pruebas", local: false, active: false, on: false, power: "off" as const, hosts: null, wakes: true, os: "linux" as const },
  ];
}

const storage = (now: number) => ({
  tareas: [
    { session: "s-machines", project: "p-terminus", tarea: "Diseño de la tarjeta de máquinas", proyecto: "Terminus", bytes: 6.2 * GB, recuperable: 4.8 * GB, actividad: now - 20 * MIN,
      bloques: [{ rel: "worktree/target", clase: "recuperable", bytes: 4.1 * GB }, { rel: "worktree/node_modules", clase: "recuperable", bytes: 0.7 * GB }, { rel: "worktree", clase: "fuente", bytes: 1.4 * GB }] },
    { session: "s-support", project: "p-workspace", tarea: "Acceso de soporte para clientes", proyecto: "danil-workspace", bytes: 1.9 * GB, recuperable: 1.1 * GB, actividad: now - 3 * MIN,
      bloques: [{ rel: "worktree/node_modules", clase: "recuperable", bytes: 1.1 * GB }, { rel: "worktree", clase: "fuente", bytes: 0.8 * GB }] },
  ],
  bytes: 8.1 * GB, recuperable: 5.9 * GB, compartido: [{ etiqueta: "Caché de compilación", bytes: 2.3 * GB, rel: "cache" }], sueltos: [], medido_en: now - 4_000, aviso: null,
});

/**
 * Lo que contestaría el motor de cada máquina: para `setMachineRoute` en la
 * página de prueba. Una apagada contesta `list_workspaces` desde su copia, con
 * `cached_at`, como el enrutador de verdad; sin copia, `machine_off`.
 */
export function route(mode: Mode) {
  return async (command: string, args?: unknown, options?: { headers?: Record<string, string> }) => {
    const now = Date.now();
    const machine = options?.headers?.["x-terminus-machine"] ?? "local";
    const list = machines();
    const m = list.find((x) => x.id === machine);
    if (command === "machine_list") return list;
    if (command === "list_workspaces") {
      const base = { workspaces: [{ id: WORKSPACE, name: "Danil" }], active: WORKSPACE };
      const r = resources(mode, now)[machine];
      if (m && !m.on) {
        const at = cachedAt(now)[machine];
        if (!at || !r) throw { what: { clave: "shell.storage.offline" }, detail: "machine_off" };
        return { ...base, machine_resources: r, cached_at: at };
      }
      return { ...base, machine_resources: r };
    }
    if (command === "list_storage") return storage(now);
    if (command === "stop_task_processes") return { ok: true, args };
    if (command === "engine_update") {
      const { force } = (args ?? {}) as { force?: boolean };
      requested = { pending: { request_id: "r1", release: "v0.2.74", mode: force ? "now" : "when_idle" }, handover_pending: !force };
      return { request_id: "r1", release: "v0.2.74", mode: force ? "now" : "when_idle", state: "downloading" };
    }
    if (command === "engine_update_status") return machine === "vm-alberto" ? { ...ALBERTO_ENGINE, ...requested, schema: 1 } : { version: "0.2.61", build: "1a2b3c4", available: false };
    throw { what: { clave: "shell.service.command" }, detail: "command" };
  };
}
