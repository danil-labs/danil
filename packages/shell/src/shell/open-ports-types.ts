/** Un puerto que hay escuchando. */
export type Puerto = {
  /** Estable mientras el puerto sea el mismo: la clave de la lista. */
  id: string;
  pid: number;
  puerto: number;
  /** Tal como la reporta el sistema: `127.0.0.1:3000`, `*:5173`. */
  direccion: string;
  /** La que un navegador sí puede abrir: `http://localhost:5173`. */
  url: string;
  /** El binario que escucha: `bun`, `node`. */
  comando: string;
};

/** Lo que una tarea dejó corriendo fuera del grupo de su agente. */
export type TaskProcess = {
  id: string;
  pid: number;
  command: string;
  cpu_percent: number;
  elapsed_seconds: number;
  /** Perdió a quien lo lanzó: nadie lo va a recoger. */
  orphan: boolean;
};

type TareaConPuertos = {
  session: string;
  project: string;
  tarea: string;
  proyecto: string | null;
  puertos: Puerto[];
  processes: TaskProcess[];
};

export type Puertos = {
  tareas: TareaConPuertos[];
  externos: Puerto[];
  /** Por qué la lista puede estar vacía: no es lo mismo que no haya nada. */
  aviso: string | null;
};

export type Cierre = { cerrado: boolean; detalle: string };

/** Medio núcleo sostenido: por debajo es un servidor ocioso, por encima trabaja o se quedó en bucle. */
export const HOT_CPU = 50;

export type PuertosProps = {
  /** Si hay un turno corriendo. Su flanco de bajada dispara la consulta. */
  busy: boolean;
  /** Abrirlo como pestaña del espacio principal. Solo lo de una tarea. */
  onAbrirSitio: (url: string, project: string, session: string) => void;
  /** En la columna de organizaciones: icono sobre la cifra y el panel a la derecha. */
  vertical?: boolean;
};
