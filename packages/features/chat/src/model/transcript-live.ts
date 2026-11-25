/** El hilo vivo: los fragmentos, razonamientos e imágenes que llegan mientras el turno corre. */
import { escritosGuardados, ordenDelHilo } from "./threadOrder.ts";
import type { Author, Msg, Razonamiento } from "./messageTypes";

/**
 * Mete un fragmento de respuesta en el hilo vivo.
 *
 * Los fragmentos del mismo mensaje se concatenan SIN separador, y
 * `startsMessage` abre otro globo. `messageId` —que ACP publica— dice a cuál
 * pertenece el fragmento: si ya hay un globo de ese mensaje se le pega aunque
 * una herramienta haya quedado en medio, y el mensaje no sale partido.
 */
export function anexarDelta(
  msgs: Msg[],
  d: {
    text: string;
    messageId?: string;
    segmentId?: string;
    startsMessage?: boolean;
    author: Author | null;
    /** Con qué se lanzó el turno; el cierre lo cambia por el observado. */
    model?: string | null;
  },
): Msg[] {
  const nuevo = (text: string): Msg[] => [
    ...msgs,
    {
      role: "agent",
      text,
      author: d.author,
      nativeMessageId: d.messageId,
      ...(d.segmentId ? { tramo: d.segmentId } : {}),
      ...(d.model ? { reported_model: d.model } : {}),
    },
  ];
  if (d.startsMessage) return nuevo(d.text.replace(/^\n+/, ""));
  if (d.messageId) {
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (!d.segmentId && (msgs[i].role === "user" || msgs[i].meta === "task_launched" || msgs[i].tramo)) break;
      if (msgs[i].role === "agent" && msgs[i].tramo === d.segmentId && msgs[i].nativeMessageId === d.messageId) {
        const copia = [...msgs];
        copia[i] = { ...msgs[i], text: msgs[i].text + d.text };
        return copia;
      }
    }
    // La imagen puede llegar antes que el primer token. Sin pegarla a este
    // mensaje, el PNG se queda en un globo vacío y el texto abre otro.
    const ultimo = msgs[msgs.length - 1];
    if (
      ultimo?.role === "agent" &&
      !ultimo.turno &&
      ultimo.tramo === d.segmentId &&
      !ultimo.nativeMessageId &&
      !ultimo.text &&
      ultimo.images?.length
    ) {
      return [
        ...msgs.slice(0, -1),
        { ...ultimo, text: d.text, nativeMessageId: d.messageId },
      ];
    }
    return nuevo(d.text);
  }
  const ultimo = msgs[msgs.length - 1];
  // Un ID nativo reutilizado por el proveedor no une segmentos distintos.
  if (ultimo?.role === "agent" && ultimo.tramo === d.segmentId) {
    return [...msgs.slice(0, -1), { ...ultimo, text: ultimo.text + d.text }];
  }
  return nuevo(d.text);
}

/** Un fragmento de respuesta tal como lo recibe `anexarDelta`. */
export type Delta = Parameters<typeof anexarDelta>[1];

/**
 * Varios fragmentos seguidos de un hilo en una sola pasada, con el mismo
 * resultado que aplicarlos uno a uno. Los que caen en el mismo globo se pegan
 * antes: el hilo se copia una vez por tanda y no una por token.
 */
export function anexarDeltas(msgs: Msg[], deltas: readonly Delta[]): Msg[] {
  const juntos: Delta[] = [];
  for (const d of deltas) {
    const previo = juntos.at(-1);
    if (
      previo &&
      !d.startsMessage &&
      // Un globo que abre solo con saltos se los quita: pegarle más texto cambiaría qué se quita.
      !(previo.startsMessage && /^\n*$/.test(previo.text)) &&
      d.messageId === previo.messageId &&
      d.segmentId === previo.segmentId &&
      d.author === previo.author &&
      d.model === previo.model
    )
      juntos[juntos.length - 1] = { ...previo, text: previo.text + d.text };
    else juntos.push(d);
  }
  return juntos.reduce((m, d) => anexarDelta(m, d), msgs);
}

/**
 * Mete un fragmento de razonamiento en el hilo vivo, en su bloque.
 *
 * Con `messageId` se pega al mensaje de ese id aunque una herramienta haya
 * quedado en medio. Sin él —Codex y Claude no lo publican— cada ráfaga es un
 * bloque: el texto o una herramienta la cierran.
 */
export function anexarRazonamiento(
  msgs: Msg[],
  r: {
    text: string;
    messageId?: string;
    segmentId?: string;
    author: Author | null;
  },
): Msg[] {
  const bloque: Razonamiento = { text: r.text };
  const nuevo = (): Msg[] => [
    ...msgs,
    {
      role: "agent",
      text: "",
      author: r.author,
      nativeMessageId: r.messageId,
      ...(r.segmentId ? { tramo: r.segmentId } : {}),
      razonamiento: [bloque],
    },
  ];
  const pegar = (m: Msg): Msg => {
    const previos = m.razonamiento ?? [];
    const ultimo = previos.at(-1);
    return {
      ...m,
      razonamiento: ultimo
        ? [...previos.slice(0, -1), { ...ultimo, text: ultimo.text + r.text }]
        : [bloque],
    };
  };
  if (r.messageId) {
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (!r.segmentId && (msgs[i].role === "user" || msgs[i].meta === "task_launched" || msgs[i].tramo)) break;
      if (msgs[i].role === "agent" && msgs[i].tramo === r.segmentId && msgs[i].nativeMessageId === r.messageId) {
        const copia = [...msgs];
        copia[i] = pegar(msgs[i]);
        return copia;
      }
    }
    return nuevo();
  }
  const ultimo = msgs[msgs.length - 1];
  if (ultimo?.role === "agent" && ultimo.tramo === r.segmentId && !ultimo.text && ultimo.razonamiento?.length) {
    return [...msgs.slice(0, -1), pegar(ultimo)];
  }
  return nuevo();
}

/**
 * Pega imágenes a la respuesta que se está escribiendo.
 *
 * Van en el último globo del agente que todavía no cerró. Si la herramienta
 * terminó antes del primer token, el globo nace vacío y el delta siguiente
 * le escribe el texto: si no, la imagen y la frase quedan en dos mensajes.
 */
export function anexarImagen(msgs: Msg[], images: string[], segmentId?: string): Msg[] {
  if (images.length === 0) return msgs;
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m.role !== "agent" || m.turno || m.tramo !== segmentId) continue;
    const previas = m.images ?? [];
    const nuevas = images.filter((url) => !previas.includes(url));
    if (nuevas.length === 0) return msgs;
    const copia = [...msgs];
    copia[i] = { ...m, images: [...previas, ...nuevas] };
    return copia;
  }
  return [...msgs, { role: "agent", text: "", images: images.slice(), ...(segmentId ? { tramo: segmentId } : {}) }];
}

/** Marca lo vivo que el motor guardó en el tramo `turno`; no lo quita: un `tool_done` tardío busca su fila. */
export function tramoGuardado(msgs: Msg[], turno: string): Msg[] {
  const suyo = (m: Msg) => !m.turno && !m.tramo && (m.role === "agent" || m.meta === "usó");
  return msgs.some(suyo) ? msgs.map((m) => (suyo(m) ? { ...m, tramo: turno } : m)) : msgs;
}

/** Lo guardado y lo vivo que el disco no trae, en su orden: releer con el turno corriendo no repite sus tramos. */
export function mensajesDelHilo(h: { base: Msg[]; vivo: Msg[]; guardados?: ReadonlySet<string> }): Msg[] {
  const guardados = h.guardados;
  const enDisco = (id?: string) => id !== undefined && guardados!.has(id);
  const enBase = escritosGuardados(h.base, h.vivo);
  return ordenDelHilo(h.base, guardados?.size ? h.vivo.filter((m) => enBase.has(m) || (!enDisco(m.turno) && !enDisco(m.tramo))) : h.vivo);
}
