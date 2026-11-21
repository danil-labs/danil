/**
 * Qué dice y qué ofrece la fila de un turno que falló. Es una tabla —clase →
 * frase, clase → gesto— y vive fuera del componente para leerse de un vistazo
 * y probarse sin montar el chat.
 */
// Con extensión: este módulo se carga también desde `node --test`, que no tiene
// el resolvedor de Vite. Es el mismo motivo escrito en `lib/prose.ts`.
import { asFailure, prosaDe } from "../../../../apps/desktop/src/lib/failure.ts";
import { prosa } from "../../../../apps/desktop/src/lib/prose.ts";
import { df } from "../../../../apps/desktop/src/lib/format.ts";
import { clavesConocidas, t } from "../../../../apps/desktop/src/lib/i18n.ts";

/**
 * Por qué el proveedor no contestó, tal como lo guardó Rust
 * (`failures::Fallo`). Es un dato y no una frase: la frase se elige aquí, en la
 * lengua de quien mira, y el gesto que se ofrece sale de la clase.
 */
export type FalloDelTurno = {
  /** `failures::Clase`, en `snake_case`. `"desconocido"` es un valor legítimo. */
  clase: string;
  /** Dato de máquina, sin traducir: códigos, host, lo que dijo el proceso. */
  detail: string;
  /** Epoch ms, si el proveedor dijo cuándo vuelve el cupo. */
  vuelve_en?: number;
  /** Cuántas veces reintentó el CLI antes de rendirse. */
  reintentos?: number;
  /** Epoch ms en que Terminus la retoma sola, sin otra cuenta con cupo. */
  resumes_at?: number;
};

/** Con qué cuenta siguió una tarea cortada por cupo. Ver `quota::QuotaResume`. */
export type CambioPorCupo = {
  from?: string | null;
  to?: string | null;
  until?: number | null;
};

/**
 * Una hora de vuelta, con la fecha cuando no es hoy: un cupo semanal dicho como
 * «vuelve a las 3:03 PM» manda a reintentar esta tarde contra una pared que
 * sigue en pie una semana.
 */
export function horaDeVuelta(ms: number) {
  const fecha = new Date(ms);
  const hoy = fecha.toDateString() === new Date().toDateString();
  return df(hoy ? { timeStyle: "short" } : { dateStyle: "medium", timeStyle: "short" }).format(
    fecha,
  );
}

/** Lo mínimo que hace falta para pintar la fila. Ver `Msg`. */
type ConFallo = { text: string; meta?: string; fallo?: FalloDelTurno };

/** Conserva el diagnóstico también cuando el fallo ocurre antes de abrir el turno. */
export function mensajeDeFallo(error: unknown, datos?: Record<string, string | number>) {
  const failure = asFailure(error, datos);
  return {
    text: prosa(failure.what),
    fallo: { clase: "desconocido", detail: failure.detail },
  };
}

/** El aviso de encargado en la lengua de la ventana; el motor lo guarda en la suya. */
export function avisoDeEncargado(msg: ConFallo): string | null {
  // Los que traduce la ventana son las claves de `chat.notice.json`, un trozo perezoso: sin su frase vale la prosa del motor.
  if (!msg.meta || !clavesConocidas().has(`chat.notice.${msg.meta}`)) return null;
  const notice = t(`chat.notice.${msg.meta}`);
  const tool = msg.meta === "handler_requires_tool_missing" ? /`([^`]+)`/.exec(msg.text)?.[1] : null;
  return tool ? `${notice} (${tool})` : notice;
}

/** Los mensajes antiguos pasan por el mismo respaldo que los fallos nuevos. */
export function prosaDelFallo(msg: ConFallo) {
  if (msg.text === "chat.mentions.in_code") return t("chat.mentions.in_code");
  const aviso = avisoDeEncargado(msg);
  if (aviso) return aviso;
  const f = msg.fallo;
  if (!f || !clavesConocidas().has(`chat.failure.${f.clase}`)) return prosaDe(msg.text);
  const partes = [t(`chat.failure.${f.clase}`)];
  // Cuándo sigue sola gana a cuándo vuelve: puede volver antes otra cuenta.
  if (f.resumes_at) partes.push(t("chat.failure.resumes_at", { time: horaDeVuelta(f.resumes_at) }));
  else if (f.vuelve_en) partes.push(t("chat.failure.back_at", { time: horaDeVuelta(f.vuelve_en) }));
  // Cuántas veces lo intentó el CLI antes de rendirse: la diferencia entre
  // «falló» y «falló cinco veces seguidas».
  if (f.reintentos) partes.push(t("chat.failure.retries", { count: f.reintentos }));
  return partes.join(" ");
}

/**
 * El único gesto que ofrece cada clase, o ninguno. Uno y no un menú: esta fila
 * es un hito entre dos hairlines, no una tarjeta.
 *
 * Y solo donde el gesto sirve. Un cupo agotado no ofrece «reintentar»: choca
 * contra la misma pared y, si el proveedor pidió esperar, cada intento renueva
 * el castigo (`runtime/limits.rs`); lo que sirve ahí es la otra cuenta. Retomarla
 * cuando vuelva el cupo lo hace el servicio solo (`runtime/quota.rs`).
 *
 * Un tope de gasto, un contexto lleno, un modelo que no existe y una política
 * del proveedor no ofrecen nada a propósito: no hay gesto que esta pantalla
 * pueda hacer por quien mira.
 */
export function gestoDelFallo(clase?: string) {
  switch (clase) {
    case "proveedor_caido":
    case "sin_red":
      return { accion: "reintentar" as const, clave: "chat.failure.retry" };
    case "credencial":
      return { accion: "cuentas" as const, clave: "chat.failure.reconnect" };
    case "sin_cupo":
    case "sin_saldo":
      return { accion: "cuentas" as const, clave: "chat.failure.other_account" };
    default:
      return null;
  }
}

/** Lo que la fila necesita para elegir su gesto. Ver `Msg`. */
type FilaDeFallo = { meta?: string; text: string; fallo?: FalloDelTurno };

/**
 * Sin clase (envío rechazado o fallo sin clasificar) ofrece reintentar. Solo la
 * fila vigente: reintentar manda el último texto, no el de una fila vieja.
 */
export function gestoDeLaFila(msg: FilaDeFallo, vigente: boolean) {
  if (msg.meta !== "fallo") return null;
  if (msg.text === "chat.turn.unsaved" || msg.text === t("chat.turn.unsaved")) return null;
  const clase = msg.fallo?.clase;
  const gesto =
    clase && clase !== "desconocido"
      ? gestoDelFallo(clase)
      : { accion: "reintentar" as const, clave: "chat.failure.retry" };
  if (gesto?.accion === "reintentar" && !vigente) return null;
  return gesto;
}

/** Los fallos que la línea del cupo deja resueltos: la tarea ya siguió. */
export function cupoResuelveElFallo(clase?: string) {
  return clase === "sin_cupo" || clase === "sin_saldo";
}

/** Qué dice la línea de una tarea que siguió tras quedarse sin cupo. */
export function prosaDelCambioPorCupo(c: CambioPorCupo) {
  if (c.to && c.from) {
    if (!c.until) return t("chat.quota.switched", { to: c.to, from: c.from });
    const datos = { to: c.to, from: c.from, time: horaDeVuelta(c.until) };
    return new Date(c.until).toDateString() === new Date().toDateString()
      ? t("chat.quota.switched_until", datos)
      : t("chat.quota.switched_until_day", datos);
  }
  return c.from ? t("chat.quota.resumed_account", { account: c.from }) : t("chat.quota.resumed");
}
