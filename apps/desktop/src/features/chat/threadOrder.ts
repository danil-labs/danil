import type { Msg } from "./messageTypes.ts";

/** Salida del agente que el disco todavía no ata a ningún turno ni tramo. */
const sinAtar = (m: Msg) => !m.turno && !m.tramo && (m.role === "agent" || m.meta === "usó");

/**
 * Lo vivo que sigue después de releer. Lo guardado sale, salvo un mensaje de la
 * persona metido en el turno que corre detrás de salida que el disco aún no trae:
 * se queda para marcar dónde va esa salida (`mensajesDelHilo`) y para que lo que
 * el agente diga después entre en una fila nueva debajo de él.
 */
export function vivoTrasLeer(vivo: Msg[], queda: (m: Msg) => boolean, guardado: (m: Msg) => boolean): Msg[] {
  let suelta = false;
  return vivo.filter((m) => {
    const sigue = queda(m) && (!guardado(m) || (suelta && m.role === "user"));
    if (sigue && sinAtar(m)) suelta = true;
    return sigue;
  });
}

/**
 * Lo guardado y lo vivo en el orden en que pasó. Un mensaje de la persona que el
 * disco ya trae y sigue en lo vivo se pinta desde el disco, y lo vivo de antes de
 * él va justo encima: lo que el agente dijo antes de que se le metiera un mensaje
 * no sube por debajo de ese mensaje. Lo vivo que queda va al final.
 */
export function ordenDelHilo(base: Msg[], vivo: Msg[]): Msg[] {
  const enBase = escritosGuardados(base, vivo);
  if (!enBase.size) return vivo.length ? [...base, ...vivo] : base;
  const out: Msg[] = [];
  let desde = 0, antes: Msg[] = [];
  for (const m of vivo) {
    const en = enBase.get(m);
    if (en === undefined) { antes.push(m); continue; }
    const hasta = Math.max(en, desde);
    out.push(...base.slice(desde, hasta), ...antes);
    antes = [];
    desde = hasta;
  }
  out.push(...base.slice(desde), ...antes);
  return out;
}

/**
 * Dónde está en disco cada mensaje vivo de la persona que el disco ya trae: por su
 * `turno`, o, metido sin id (`Msg.inyectado`), el primer turno de la persona con su
 * texto guardado después de `tras`. Cada guardado cuenta una vez, para que dos «sí»
 * seguidos sigan siendo dos.
 */
export function escritosGuardados(base: Msg[], vivo: Msg[]): Map<Msg, number> {
  const enBase = new Map<Msg, number>();
  if (!vivo.some((m) => m.role === "user" && (m.turno || m.inyectado))) return enBase;
  const posicion = new Map(base.flatMap((b, i) => (b.role === "user" && b.turno ? [[b.turno, i] as const] : [])));
  const usados = new Set<number>();
  for (const m of vivo) {
    if (m.role !== "user") continue;
    if (m.turno) {
      const i = posicion.get(m.turno);
      if (i !== undefined) enBase.set(m, i);
      continue;
    }
    if (!m.inyectado) continue;
    const tras = m.inyectado.tras;
    const desde = tras === null ? 0 : base.findIndex((b) => b.turno === tras) + 1;
    if (desde === 0 && tras !== null) continue;
    for (let i = desde; i < base.length; i++) {
      const b = base[i];
      if (usados.has(i) || b.role !== "user" || !b.turno || b.text !== m.text) continue;
      usados.add(i);
      enBase.set(m, i);
      break;
    }
  }
  return enBase;
}
