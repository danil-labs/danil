/** Espejo de `Opcion` en `src-tauri/src/runtime/questions.rs`. */
export type Opcion = { value: string; label: string; detail?: string | null };

/** Espejo de `Pregunta`. Lo que el agente necesita saber y no puede deducir. */
export type Pregunta = {
  id: string;
  question: string;
  /** El rótulo corto que Claude le pone. Las del archivo no lo traen. */
  header?: string | null;
  options: Opcion[];
  multiple: boolean;
  free_text: boolean;
};

/**
 * Espejo de `Respuesta`. Lleva a qué pregunta contesta y de dónde salió:
 * conserva quién la dijo y cuándo.
 */
export type Respuesta = {
  turn: string;
  question: string;
  question_text: string;
  chosen: string[];
  text: string;
  source: string;
  when: number;
};

/** Lo que se manda al contestar: referencias, no texto ya resuelto. */
export type RespuestaEnviada = {
  turn: string;
  question: string;
  chosen: string[];
  free_text: string | null;
};

/**
 * Lo elegido para una pregunta, mientras se contesta. «Otra» es una opción
 * más: elegirla apaga la selección y elegir otra la apaga a ella, y lo que se
 * ve es exactamente lo que se manda.
 */
export type Estado = { elegidas: string[]; otra: boolean; texto: string };

/** Una tarjeta contestada a medias: lo elegido por pregunta y la página. */
export type PreguntasAMedias = { estado: Record<string, Estado>; en: number };

/**
 * Dónde vive lo contestado a medias, por turno. Vive fuera de la tarjeta:
 * desmontarla con su pestaña no puede tirar lo que ya se eligió.
 */
export type AlmacenDePreguntas = {
  leer: (turno: string) => PreguntasAMedias | undefined;
  escribir: (turno: string, aMedias: PreguntasAMedias) => void;
};

const SIN_CONTESTAR: PreguntasAMedias = { estado: {}, en: 0 };

function inicial(p: Pregunta): Estado {
  // Sin opciones la pregunta es abierta: «otra» es lo único que hay.
  return { elegidas: [], otra: p.options.length === 0, texto: "" };
}

function contestada(e: Estado) {
  return e.elegidas.length > 0 || (e.otra && e.texto.trim().length > 0);
}

function editable(destino: EventTarget | null) {
  return (
    destino instanceof HTMLTextAreaElement ||
    destino instanceof HTMLInputElement ||
    (destino instanceof HTMLElement && destino.isContentEditable)
  );
}

export type PreguntasProps = {
  turno: string;
  items: Pregunta[];
  onResponder: (turno: string, enviadas: RespuestaEnviada[]) => Promise<boolean>;
  /** Pliega la pregunta sin perder lo que ya se eligió. */
  onPlegar?: () => void;
  /** Cierra la pregunta sin contestarla y devuelve la caja de escribir. */
  onCancelar?: () => void;
  almacen: AlmacenDePreguntas;
};

export { SIN_CONTESTAR, inicial, contestada, editable };
