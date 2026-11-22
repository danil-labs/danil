import { createMemo, createSignal } from "solid-js";
import { SIN_CONTESTAR, inicial, contestada, type Estado, type Pregunta, type PreguntasProps } from "./questions-types";

export function createPreguntas(props: PreguntasProps) {
  const [mandando, setMandando] = createSignal(false);
  // Se lee por turno: los ids se repiten entre turnos (`q1`, `q2`…).
  const aMedias = () => props.almacen.leer(props.turno) ?? SIN_CONTESTAR;
  const estado = () => aMedias().estado;
  // Memo: el efecto que enfoca al cambiar de página no puede correr con cada tecla de «Otra».
  const en = createMemo(() => aMedias().en);
  const setEstado = (siguiente: Record<string, Estado>) =>
    props.almacen.escribir(props.turno, { ...aMedias(), estado: siguiente });
  const setEn = (pagina: number) => props.almacen.escribir(props.turno, { ...aMedias(), en: pagina });

  function de(p: Pregunta) {
    return estado()[p.id] ?? inicial(p);
  }

  function tocar(p: Pregunta, cambio: Partial<Estado>) {
    setEstado({ ...estado(), [p.id]: { ...de(p), ...cambio } });
  }

  const actual = () => props.items[Math.min(en(), props.items.length - 1)];
  const total = () => props.items.length;
  const varias = () => total() > 1;
  const ultima = () => en() >= total() - 1;
  const respondidas = () => props.items.filter((p) => contestada(de(p))).length;
  const listo = () => contestada(de(actual()));

  function ir(i: number) {
    setEn(Math.max(0, Math.min(i, total() - 1)));
  }

  function elegir(p: Pregunta, valor: string) {
    if (mandando()) return;
    const ahora = de(p);
    if (p.multiple) {
      const ya = ahora.elegidas.includes(valor);
      tocar(p, {
        elegidas: ya
          ? ahora.elegidas.filter((v) => v !== valor)
          : [...ahora.elegidas, valor],
      });
      return;
    }
    // Una sola: elegir es avanzar, como en la terminal.
    const siguiente = {
      ...estado(),
      [p.id]: { ...ahora, elegidas: [valor], otra: false },
    };
    setEstado(siguiente);
    if (total() === 1) {
      void responder(siguiente);
      return;
    }
    avanzar(siguiente);
  }

  function alternarOtra(p: Pregunta) {
    if (mandando() || !p.free_text) return;
    const e = de(p);
    tocar(p, p.multiple ? { otra: !e.otra } : { otra: !e.otra, elegidas: [] });
  }

  const faltanEn = (estados: Record<string, Estado>) =>
    props.items.filter((p) => !contestada(estados[p.id] ?? inicial(p))).length;

  async function responder(estados = estado()) {
    if (faltanEn(estados) > 0 || mandando()) return;
    setMandando(true);
    try {
      await props.onResponder(
        props.turno,
        props.items.map((p) => {
          const e = estados[p.id] ?? inicial(p);
          return {
            turn: props.turno,
            question: p.id,
            chosen: e.elegidas,
            free_text: e.otra && e.texto.trim() ? e.texto.trim() : null,
          };
        }),
      );
    } finally {
      setMandando(false);
    }
  }

  /** Siguiente sin contestar; en la última, la primera que falte o enviar. */
  function avanzar(estados = estado()) {
    if (!ultima()) {
      ir(en() + 1);
      return;
    }
    const falta = props.items.findIndex((p) => !contestada(estados[p.id] ?? inicial(p)));
    if (falta >= 0) {
      ir(falta);
      return;
    }
    void responder(estados);
  }
  return { mandando, en, de, tocar, actual, total, varias, ultima, respondidas, listo, ir, elegir, alternarOtra, avanzar };
}
