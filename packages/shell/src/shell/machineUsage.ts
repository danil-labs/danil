import type { EngineUpdate, MachineResources, MachineTaskUsage } from "@terminus/protocol";

/**
 * Lo que el panel «Máquinas» lee de `machine_resources`, sin pantalla: cuándo
 * hay presión, cómo se parte la memoria y qué quedó corriendo. Todo es opcional
 * del lado del motor (`machine_usage_v1`); sin esos campos la máquina es «Solo
 * disco» y nada de aquí la marca como vieja.
 */

export const USAGE_FEATURE = "machine_usage_v1";
/** `engine_update(release)` (seldon-host, propuesta §3.6). Sin ella no hay botón. */
export const UPDATE_FEATURE = "engine_update_v1";

export type Level = "normal" | "high" | "critical";

/**
 * PSI `some avg60`: 20 % de memoria es el umbral del aviso del motor (§3.4) y
 * el doble, todo lento. Sin swap que alcance, la memoria que falta se lee del
 * disco: el `io` también cuenta. Con menos del 5 % libre el kernel mata algo.
 */
const HIGH = { memory: 20, io: 40 };
const CRITICAL = { memory: 40, io: 65, available: 0.05 };

/** Si el host manda memoria y presión: sin eso, la tarjeta es solo de disco. */
export function hasUsage(r: MachineResources | undefined): r is MachineResources & Required<Pick<MachineResources, "memory">> {
  return !!r?.memory && r.memory.total_bytes > 0;
}

export function level(r: MachineResources | undefined): Level | null {
  if (!hasUsage(r)) return null;
  const p = r.pressure;
  const free = r.memory.available_bytes / r.memory.total_bytes;
  if (free < CRITICAL.available || (p && (p.memory >= CRITICAL.memory || p.io >= CRITICAL.io))) return "critical";
  if (r.pressure_alert || (p && (p.memory >= HIGH.memory || p.io >= HIGH.io))) return "high";
  return "normal";
}

/** La peor de todas, con la máquina que la tiene; `null` si ninguna tiene presión. */
export function worst(entries: { id: string; resources: MachineResources | undefined }[]): { id: string; level: Exclude<Level, "normal"> } | null {
  let found: { id: string; level: Exclude<Level, "normal"> } | null = null;
  for (const e of entries) {
    const l = level(e.resources);
    if (l === "critical") return { id: e.id, level: l };
    if (l === "high" && !found) found = { id: e.id, level: l };
  }
  return found;
}

export type MemorySplit = { total: number; tasks: number; engine: number; other: number; available: number };

/**
 * La barra de memoria: tareas, motor y el resto de lo usado. Lo de las tareas
 * incluye lo que quedó corriendo: ocupa igual. Se recorta para que la suma no
 * pase de lo usado si el reparto aproximado de macOS cuenta de más.
 */
export function split(r: MachineResources & Required<Pick<MachineResources, "memory">>): MemorySplit {
  const total = r.memory.total_bytes;
  const available = Math.min(total, Math.max(0, r.memory.available_bytes));
  const used = total - available;
  const engine = Math.min(used, Math.max(0, r.engine?.rss_bytes ?? 0));
  const tasks = Math.min(used - engine, (r.tasks ?? []).reduce((n, t) => n + Math.max(0, t.memory_bytes), 0));
  return { total, tasks, engine, other: Math.max(0, used - engine - tasks), available };
}

/** Las que no terminaron, de más a menos memoria. */
export function active(r: MachineResources | undefined): MachineTaskUsage[] {
  return (r?.tasks ?? []).filter((t) => t.state !== "finished").sort((a, b) => b.memory_bytes - a.memory_bytes);
}

/** «Quedó corriendo»: tareas terminadas o archivadas con procesos vivos. */
export function leftovers(r: MachineResources | undefined): MachineTaskUsage[] {
  return (r?.tasks ?? []).filter((t) => t.state === "finished" && t.processes > 0).sort((a, b) => b.memory_bytes - a.memory_bytes);
}

/** Lo que más usa, para el aviso: el del aviso activo del motor si hay uno; si no, hasta dos de cualquier estado. */
export function heaviest(r: MachineResources | undefined, n = 2): { session: string; title?: string; memory_bytes: number }[] {
  if (r?.pressure_alert?.tasks.length) return r.pressure_alert.tasks.slice(0, n);
  return [...(r?.tasks ?? [])].sort((a, b) => b.memory_bytes - a.memory_bytes).slice(0, n);
}

/** Los procesos principales, juntando los del mismo programa: «chrome (5)». */
export function topProcesses(t: MachineTaskUsage): { command: string; count: number; bytes: number }[] {
  const by = new Map<string, { command: string; count: number; bytes: number }>();
  for (const p of t.top) {
    const g = by.get(p.command) ?? { command: p.command, count: 0, bytes: 0 };
    g.count++;
    g.bytes += p.rss_bytes;
    by.set(p.command, g);
  }
  return [...by.values()].sort((a, b) => b.bytes - a.bytes);
}

/**
 * Las barritas de presión de los últimos 10 minutos. El motor las manda en
 * `memory_history`; si no, se arman con lo que esta ventana fue leyendo, una
 * por minuto.
 */
const samples = new Map<string, { minute: number; value: number }[]>();
const MINUTE = 60_000;

export function remember(machine: string, r: MachineResources | undefined) {
  if (!hasUsage(r) || !r.pressure) return;
  const minute = Math.floor(r.measured_at / MINUTE);
  const list = (samples.get(machine) ?? []).filter((s) => s.minute > minute - 10 && s.minute !== minute);
  list.push({ minute, value: r.pressure.memory });
  list.sort((a, b) => a.minute - b.minute);
  samples.set(machine, list);
}

export function history(machine: string, r: MachineResources | undefined): number[] {
  const sent = r?.pressure?.memory_history;
  if (sent?.length) return sent.slice(-10);
  return (samples.get(machine) ?? []).map((s) => s.value);
}

/** Para las pruebas. */
export function forgetSamples() {
  samples.clear();
}

export type EngineVersion = { version: string; build: string | null; updateAvailable: boolean };

/**
 * La versión del motor: la del bloque `engine` del resumen (o de su copia, si
 * la máquina está apagada) y, si no, la `host_version` del plano de control
 * («0.2.73-45867e9»). Otro contrato nunca es una máquina inservible.
 */
export function engineVersion(r: MachineResources | undefined, hostVersion?: string | null): EngineVersion | null {
  const e = r?.engine;
  if (e?.version) return { version: e.version, build: e.build ? e.build.slice(0, 7) : null, updateAvailable: !!e.update_available };
  const m = hostVersion?.trim().replace(/^v/, "").match(/^(\d+(?:\.\d+)*)(?:[-+.]([0-9a-f]{7,}))?/i);
  return m ? { version: m[1], build: m[2] ? m[2].slice(0, 7) : null, updateAvailable: false } : null;
}

/** En qué va una actualización pedida, según el motor. */
export function updateState(e: EngineUpdate | undefined): "scheduled" | "now" | "rejected" | null {
  if (!e?.available) return null;
  if (e.download?.state === "rejected") return "rejected";
  if (e.pending?.mode === "now") return "now";
  if (e.handover_pending || e.pending || e.download?.state === "downloading" || e.download?.state === "staged") return "scheduled";
  return null;
}
