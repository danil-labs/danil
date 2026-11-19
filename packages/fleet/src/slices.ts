import { memberKey } from "./member-key.ts";
/**
 * Lo que contestó cada máquina a cada lectura: una rebanada con su estado.
 *
 * - `ok`: lo acaba de contestar.
 * - `cached`: una copia con su hora (del relay con la máquina apagada, o la
 *   última que se leyó aquí).
 * - `no_answer`: no contestó a tiempo; se queda lo que había.
 * - `off`: apagada y sin copia: no aporta nada, y nada se inventa en su lugar.
 * - `outdated`: su motor habla otro contrato.
 * - `license_required`: la cuenta no tiene Terminus de pago; se queda lo que había.
 *
 * Una rebanada sin valor (`has: false`) no aporta filas: nunca es una lista vacía.
 */

export type SliceStatus = "ok" | "cached" | "no_answer" | "off" | "outdated" | "license_required";

export type Slice = {
  machine: string;
  context?: string;
  status: SliceStatus;
  /** Si `value` es una respuesta de la máquina; sin ella la rebanada no aporta nada. */
  has: boolean;
  value: unknown;
  /** Cuándo se leyó `value` (ms de época), o `null`. */
  at: number | null;
  /** El error con nombre de la última vez, si falló. */
  error?: string;
};

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type Schedule = (run: () => void, ms: number) => unknown;
type Entry = { at: number; value: string };

const LIVE_BYTES = 8 * 1024 * 1024;
const LIVE_ENTRIES = 256;
const LIVE_ENTRY_BYTES = 1024 * 1024;
const ENTRY = 200_000;
const TOTAL = 2_000_000;
export const SAVE_EVERY = 30_000;
export const SLICES_KEY = "terminus-fleet:slices:v1";

/**
 * Las rebanadas por máquina, contexto y lectura. Las que traen valor se guardan en el
 * almacenamiento de la página (acotadas, con espera) y al arrancar vuelven
 * como `cached` con su hora: sin red se ve lo último de cada máquina.
 */
export class SliceBook {
  private slices = new Map<string, Map<string, Slice>>();
  private liveSizes = new Map<string, number>();
  private liveBytes = 0;
  private saved = new Map<string, Entry>();
  private timer: unknown;
  private readonly storage: StorageLike | null;
  private readonly schedule: Schedule;

  constructor(storage: StorageLike | null = null, schedule: Schedule = (run, ms) => setTimeout(run, ms)) {
    this.storage = storage;
    this.schedule = schedule;
    try {
      const raw = storage?.getItem(SLICES_KEY);
      if (raw) this.saved = new Map(Object.entries(JSON.parse(raw) as Record<string, Entry>));
    } catch {}
  }

  get(machine: string, key: string, context?: string): Slice | null {
    const member = memberKey(machine, context);
    const live = this.slices.get(member)?.get(key);
    if (live) {
      const id = storeKey(member, key);
      const bytes = this.liveSizes.get(id);
      if (bytes !== undefined) { this.liveSizes.delete(id); this.liveSizes.set(id, bytes); }
      return live;
    }
    const entry = this.saved.get(storeKey(member, key));
    if (!entry) return null;
    try {
      return { machine, ...(context ? { context } : {}), status: "cached", has: true, value: JSON.parse(entry.value), at: entry.at };
    } catch {
      return null;
    }
  }

  put(slice: Slice, key: string) {
    const member = memberKey(slice.machine, slice.context);
    const id = storeKey(member, key);
    const bytes = new TextEncoder().encode(JSON.stringify(slice)).length;
    this.liveBytes -= this.liveSizes.get(id) ?? 0;
    this.liveSizes.delete(id);
    this.slices.get(member)?.delete(key);
    if (bytes > LIVE_ENTRY_BYTES) return;
    this.liveSizes.set(id, bytes);
    this.liveBytes += bytes;
    const of = this.slices.get(member) ?? new Map<string, Slice>();
    // La más reciente al final: `statuses` lee la última.
    of.delete(key);
    of.set(key, slice);
    this.slices.set(member, of);
    while (this.liveBytes > LIVE_BYTES || this.liveSizes.size > LIVE_ENTRIES) {
      const oldest = this.liveSizes.entries().next().value;
      if (!oldest) break;
      this.liveSizes.delete(oldest[0]); this.liveBytes -= oldest[1];
      const [machine, oldKey] = oldest[0].split("\u0000");
      this.slices.get(machine)?.delete(oldKey);
      if (this.slices.get(machine)?.size === 0) this.slices.delete(machine);
    }
    if (!slice.has || (slice.status !== "ok" && slice.status !== "cached")) return;
    let text: string;
    try {
      const value = slice.value;
      const saved = value && typeof value === "object" && !Array.isArray(value) && "machine_resources" in value
        ? Object.fromEntries(Object.entries(value).filter(([name]) => name !== "machine_resources")) : value;
      text = JSON.stringify(saved ?? null);
    } catch {
      return;
    }
    if (this.saved.get(id)?.value === text) return;
    this.saved.delete(id);
    if (text.length <= ENTRY) this.saved.set(id, { at: slice.at ?? Date.now(), value: text });
    if (this.storage && this.timer === undefined) this.timer = this.schedule(() => this.flush(), SAVE_EVERY);
  }

  /** La máquina ya no es de la cuenta: nada suyo se queda, ni guardado. */
  forget(machine: string, context?: string) {
    const member = memberKey(machine, context);
    this.slices.delete(member);
    for (const [id, bytes] of this.liveSizes) if (id.startsWith(`${member}\u0000`)) {
      this.liveSizes.delete(id); this.liveBytes -= bytes;
    }
    for (const id of [...this.saved.keys()]) if (id.startsWith(`${member}\u0000`)) this.saved.delete(id);
    this.flush();
  }

  /**
   * El estado de cada máquina: el de su lectura más reciente, salvo que esa no
   * sea de ahora ni diga otro contrato o licencia y haya algo guardado: entonces
   * `cached` con la hora de la copia más nueva. Una lectura sin copia no tapa las que sí la tienen.
   */
  statuses(context?: string): Record<string, { status: SliceStatus; at: number | null }> {
    const out: Record<string, { status: SliceStatus; at: number | null }> = {};
    for (const of of this.slices.values()) {
      const all = [...of.values()].filter((slice) => (slice.context ?? "") === (context ?? ""));
      const machine = all[0]?.machine;
      if (!machine) continue;
      const last = all.at(-1);
      if (!last) continue;
      const saved = all.filter((s) => s.has && s.status !== "ok" && s.at !== null);
      const settled = last.status === "ok" || last.status === "outdated" || last.status === "license_required";
      out[machine] = !settled && saved.length ? { status: "cached", at: Math.max(...saved.map((s) => s.at as number)) } : { status: last.status, at: last.at };
    }
    return out;
  }

  flush() {
    if (this.timer !== undefined) clearTimeout(this.timer as ReturnType<typeof setTimeout>);
    this.timer = undefined;
    if (!this.storage) return;
    let size = 0;
    const kept = [...this.saved].reverse().filter(([, entry]) => (size += entry.value.length) <= TOTAL);
    this.saved = new Map(kept.reverse());
    try {
      this.storage.setItem(SLICES_KEY, JSON.stringify(Object.fromEntries(this.saved)));
    } catch {}
  }
}

const storeKey = (machine: string, key: string) => `${machine}\u0000${key}`;
