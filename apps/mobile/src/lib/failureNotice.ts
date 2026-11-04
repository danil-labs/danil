/**
 * La frase de un turno que se detuvo, la misma tabla que la ventana
 * (`apps/desktop/src/features/chat/failures.ts`). Sin el catálogo: quien llama
 * pasa `say`, para poder probarlo sin la app.
 */

export type TurnFailure = {
  /** `failures::Clase`, en snake_case. `"desconocido"` se conserva como texto. */
  clase: string;
  detail?: string;
  /** Epoch ms, si el proveedor dijo cuándo vuelve el cupo. */
  vuelve_en?: number;
  reintentos?: number;
  /** Epoch ms en que Danil la retoma sola. */
  resumes_at?: number;
};

/** Con qué cuenta siguió una tarea cortada por cupo. */
export type QuotaChange = { from?: string | null; to?: string | null; until?: number | null };

export type FailureSay = (key: string, vars?: Record<string, string | number>) => string;

const KNOWN = new Set([
  "sin_cupo",
  "sin_saldo",
  "tope_de_gasto",
  "credencial",
  "proveedor_caido",
  "sin_red",
  "contexto_lleno",
  "modelo_no_existe",
  "politica",
  "memoria_perdida",
]);

type Notice = { text?: string; role?: string; meta?: string | null; fallo?: TurnFailure | null; quota?: QuotaChange | null };

/**
 * La clave del catálogo que trae un fallo del motor (`Failure.what.clave` o
 * `message_key`), si la trae. El motor rechaza un traspaso sin ventana con
 * `chat.handover.no_budget`; sin esto, la pantalla enseñaría `command_failed`.
 */
export function failureKey(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const detail = (error as { detail?: unknown }).detail;
  // El `Failure` del motor dentro de `detail` es más específico que el `message_key` genérico del sobre.
  if (detail && typeof detail === "object") {
    const envelope = detail as { what?: unknown; message_key?: unknown };
    const what = envelope.what;
    const key = what && typeof what === "object" ? (what as { clave?: unknown }).clave : what;
    if (typeof key === "string") return key;
    if (typeof envelope.message_key === "string") return envelope.message_key;
  }
  // Una clave en `detail` es más específica que el `message_key` del sobre, que suele ser el genérico.
  if (typeof detail === "string") return detail;
  const direct = (error as { message_key?: unknown }).message_key;
  return typeof direct === "string" ? direct : null;
}

/** Hoy solo la hora; otro día, también la fecha. Un cupo semanal no se dice como «esta tarde». */
export function returnWhen(ms: number, now = Date.now()): string {
  const date = new Date(ms);
  const today = date.toDateString() === new Date(now).toDateString();
  return new Intl.DateTimeFormat(undefined, today ? { timeStyle: "short" } : { dateStyle: "medium", timeStyle: "short" }).format(date);
}

/** La interrupción ya escrita, en el formato viejo o en el nuevo. No es un error del proveedor. */
export function isInterruption(text: string): boolean {
  return text === "Interrumpido." || text === "chat.turn.cancelled" || text.startsWith("Turno interrumpido.");
}

/** El cupo y el saldo agotados quedan resueltos cuando la tarea siguió con otra cuenta. */
export function quotaResolves(clase?: string): boolean {
  return clase === "sin_cupo" || clase === "sin_saldo";
}

/**
 * El gesto que sí sirve. Un cupo agotado no se reintenta: choca con la misma
 * pared. Cambiar de cuenta es lo que esta pantalla puede hacer.
 */
export function failureGesture(clase?: string): { key: "task.failure.other_account" | "task.failure.reconnect" } | null {
  if (clase === "sin_cupo" || clase === "sin_saldo") return { key: "task.failure.other_account" };
  if (clase === "credencial") return { key: "task.failure.reconnect" };
  return null;
}

/** La clase que se reintenta: la caída del proveedor o de la red. Lo demás tiene su gesto o ninguno. */
const RETRIES = new Set(["proveedor_caido", "sin_red"]);

/**
 * Si la fila ofrece «Reintentar», como la ventana (`gestoDeLaFila` en
 * `apps/desktop/src/features/chat/failures.ts`): un fallo sin clase (envío
 * rechazado o sin clasificar), o una caída del proveedor o de la red. Ni la
 * interrupción, que es de la persona, ni el turno que no se guardó.
 */
export function retryable(msg: Notice): boolean {
  if (msg.meta !== "fallo") return false;
  const text = msg.text ?? "";
  if (isInterruption(text) || text === "chat.turn.unsaved") return false;
  const clase = msg.fallo?.clase;
  return !clase || clase === "desconocido" || RETRIES.has(clase);
}

type RetryLine = Notice & { key: string; kind: string; from?: unknown };

/**
 * La fila que ofrece «Reintentar» y el texto que reenvía. Solo la vigente: el
 * fallo más nuevo, sin nada que la persona escribiera después. Reintentar manda
 * el último texto, no el de una fila vieja. Sin texto que reponer (el primer
 * turno murió antes de guardarse), ninguna.
 */
export function retryTarget(lines: readonly RetryLine[]): { key: string; prompt: string } | null {
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (line.kind !== "message") continue;
    if (line.role === "user") return null;
    if (line.meta !== "fallo") continue;
    if (!retryable(line)) return null;
    for (let j = i - 1; j >= 0; j--) {
      const before = lines[j];
      const prompt = (before.text ?? "").trim();
      if (before.kind === "message" && before.role === "user" && !before.from && prompt) return { key: line.key, prompt };
    }
    return null;
  }
  return null;
}

function quotaSentence(change: QuotaChange, say: FailureSay, now: number): string {
  if (change.to && change.from) {
    if (!change.until) return say("task.quota.switched", { to: change.to, from: change.from });
    const time = returnWhen(change.until, now);
    const today = new Date(change.until).toDateString() === new Date(now).toDateString();
    return say(today ? "task.quota.switched_until" : "task.quota.switched_until_day", { to: change.to, from: change.from, time });
  }
  return change.from ? say("task.quota.resumed_account", { account: change.from }) : say("task.quota.resumed");
}

/** La frase de una fila, o `null` si no es un fallo ni un cambio de cupo. */
export function failureSentence(msg: Notice, say: FailureSay, now = Date.now()): string | null {
  const text = msg.text ?? "";
  if (msg.meta === "cupo") return quotaSentence(msg.quota ?? {}, say, now);
  if (msg.meta === "fallo" && isInterruption(text)) return say("task.failure.interrupted");
  const failure = msg.fallo;
  if (!failure || !KNOWN.has(failure.clase)) {
    const raw = text.trim();
    return msg.meta === "fallo" && raw ? raw : null;
  }
  const parts = [say(`task.failure.${failure.clase}`)];
  if (failure.resumes_at) parts.push(say("task.failure.resumes_at", { time: returnWhen(failure.resumes_at, now) }));
  else if (failure.vuelve_en) parts.push(say("task.failure.back_at", { time: returnWhen(failure.vuelve_en, now) }));
  if (failure.reintentos) {
    const count = failure.reintentos;
    parts.push(say(count === 1 ? "task.failure.retries_one" : "task.failure.retries_other", { count }));
  }
  return parts.join(" ");
}

/** Lo último que explica una parada: el fallo o, si ya siguió, la línea del cupo. */
export function latestFailureSentence(turns: readonly Notice[], say: FailureSay, now = Date.now()): string | null {
  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i];
    if (turn.meta !== "fallo" && turn.meta !== "cupo" && !turn.fallo) continue;
    const sentence = failureSentence(turn, say, now);
    if (sentence) return sentence;
  }
  return null;
}
