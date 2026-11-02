/**
 * Las cuentas de IA de la persona en todas sus máquinas, como el panel de la
 * web: una tarjeta por correo y tipo de suscripción confirmado, con las
 * máquinas donde tiene sesión. Sin tipo conocido no se unen credenciales.
 */
import { word } from "../../design/src/index.ts";

type Lang = "es" | "en";

export type AccountRowLike = {
  id: string;
  label?: string | null;
  identity?: string | null;
  plan?: string | null;
  /** Identidad estable del workspace o suscripción; distingue organizaciones con el mismo plan. */
  credential_group?: string | null;
};

/** Una máquina donde la cuenta tiene sesión: su id local allí y si está encendida. */
export type AccountMember = { machine: string; id: string; on: boolean };

export type AccountGroup<R extends AccountRowLike = AccountRowLike> = {
  /** Proveedor, correo y grupo o tipo conocido; sin grupo, máquina e id local. */
  key: string;
  provider: string;
  /** La credencial de la máquina elegida para leer consumo. */
  row: R;
  /** El correo en minúsculas; `null` si el CLI no lo dice. */
  email: string | null;
  members: AccountMember[];
  /** De qué credencial y máquina se lee el consumo. */
  usageFrom: AccountMember;
};

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** `lists` en el orden de las máquinas (`orderComputers`), una por máquina, todas del mismo proveedor. */
export function groupAccounts<R extends AccountRowLike>(
  provider: string,
  lists: readonly { machine: string; on: boolean; accounts: readonly R[] }[],
): AccountGroup<R>[] {
  const groups: AccountGroup<R>[] = [];
  const candidates = new Map<string, { row: R; member: AccountMember; email: string }[]>();
  for (const { machine, on, accounts } of lists) {
    for (const row of accounts) {
      if (typeof row?.id !== "string") continue;
      const member = { machine, id: row.id, on };
      const email = text(row.identity).toLowerCase() || null;
      // El grupo autoritativo (el workspace de OpenCode) manda sobre el plan
      // visible; sin él, el plan conserva el comportamiento de los demás agentes.
      const group = text(row.credential_group) || text(row.plan).toLowerCase();
      if (email && group) {
        const key = JSON.stringify([provider, email, group]);
        const entries = candidates.get(key) ?? [];
        entries.push({ row, member, email });
        candidates.set(key, entries);
      }
      groups.push({ key: `${provider}:${machine}~${row.id}`, provider, row, email, members: [member], usageFrom: member });
    }
  }
  const joined = new Map<string, AccountGroup<R>>();
  for (const [key, entries] of candidates) {
    // Dos registros del mismo tipo en una máquina son ambiguos: no atribuir
    // la copia de otra máquina a uno de ellos por su orden en la lista.
    if (new Set(entries.map((e) => e.member.machine)).size !== entries.length) continue;
    const source = entries.find((e) => e.member.on) ?? entries[0];
    const group = { key, provider, row: source.row, email: source.email, members: entries.map((e) => e.member), usageFrom: source.member };
    for (const e of entries) joined.set(`${e.member.machine}~${e.member.id}`, group);
  }
  const seen = new Set<AccountGroup<R>>();
  return groups.flatMap((g) => {
    const group = joined.get(`${g.usageFrom.machine}~${g.usageFrom.id}`) ?? g;
    if (seen.has(group)) return [];
    seen.add(group);
    return [group];
  });
}

/** Lo que queda de una ventana, de 0 a 100: el motor da lo usado. */
export function windowLeft(window: { used_pct: number }): number {
  const left = Math.round(100 - (Number.isFinite(window.used_pct) ? window.used_pct : 0));
  return Math.max(0, Math.min(100, left));
}

/** El tono de la barra, como `tono()` del escritorio: nunca el color primario. */
export function usageTone(left: number): "error" | "warning" | "neutral" {
  if (left <= 5) return "error";
  if (left <= 20) return "warning";
  return "neutral";
}

/**
 * La ventana que corre ahora —las cinco horas antes que la semana—: la que
 * vuelve a empezar primero. Una ventana ya reseteada pierde contra una vigente;
 * sin fechas manda el orden en que las manda el proveedor.
 */
export function immediateWindow<T extends { resets_at: number | null }>(windows: readonly T[], now = Date.now()): T | null {
  const dated = windows.filter((window) => window.resets_at !== null);
  if (!dated.length) return windows[0] ?? null;
  const running = dated.filter((window) => (window.resets_at as number) > now);
  const pool = running.length ? running : dated;
  return pool.reduce((first, window) => ((window.resets_at as number) < (first.resets_at as number) ? window : first));
}

/**
 * Cuándo vuelve a empezar una ventana (`cuandoVuelve` del escritorio). Sin
 * fecha hay dos casos: intacta todavía no arrancó; empezada, el proveedor no
 * dio el dato. `resetsAt` en ms de época.
 */
export function resetLabel(lang: Lang, resetsAt: number | null, usedPct: number, now = Date.now()): string {
  if (resetsAt === null) return word(lang, usedPct === 0 ? "common.limits.not_started" : "common.limits.no_reset_date");
  const left = resetsAt - now;
  if (left <= 0) return word(lang, "common.limits.reset_done");
  const min = Math.round(left / 60_000);
  if (min < 60) return word(lang, "common.limits.reset_in_min", { count: min });
  const h = Math.round(min / 60);
  if (h < 48) return word(lang, "common.limits.reset_in_hours", { count: h });
  return word(lang, "common.limits.reset_in_days", { count: Math.round(h / 24) });
}

/** «resta 62% · reset en 3 h». */
export function windowLabel(lang: Lang, window: { used_pct: number; resets_at: number | null }, now = Date.now()): string {
  return word(lang, "settings.account_card.window_left", { left: windowLeft(window), when: resetLabel(lang, window.resets_at, window.used_pct, now) });
}
