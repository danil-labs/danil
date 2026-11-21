import type { RetryOptions, Transport } from "@danil/platform-client";

/**
 * Una sesión: una persona (correo) en una organización. En Desk hay varias
 * (una por contexto del motor, modelo Slack); en la web, una (09, 02).
 */
export interface Session {
  /** Llave estable: el `context_id` del motor en Desk; "web" en la web. */
  key: string;
  email: string;
  name?: string | null;
  organization_id: string | null;
  /** Nombre de la organización tal como lo da identity (nunca se muestra la palabra «Organización»). */
  organization_name: string | null;
  /** Plan de la organización (free, team, enterprise…). */
  plan: string | null;
  /** true si el borde o el motor dijeron que venció. */
  expired: boolean;
}

/** Resultado de leer la sesión: con o sin sesión, o un error que NO es «sin sesión» (M8). */
export type SessionState =
  | { kind: "signed_in"; sessions: Session[] }
  | { kind: "signed_out" }
  | { kind: "error"; error: unknown };

/** Inicio de sesión en curso (Desk): la liga para el navegador y cómo terminarlo a mano. */
export interface PendingLogin {
  url: string;
  /** Desk sin navegador en este equipo: la dirección a la que llegó el navegador, o solo el código. */
  complete(pasted: string): Promise<void>;
  /** Resuelve cuando la sesión nueva quedó lista; rechaza con el código del motor. */
  done: Promise<Session>;
  cancel(): void;
}

/** Fuente única de sesión; web y Desk la implementan. Sin reglas de permisos. */
export interface SessionSource {
  /** Web: una; Desk: varias. */
  list(): Session[];
  /** Lee la sesión del servidor (web) o del motor (Desk). */
  refresh(): Promise<SessionState>;
  /** La sesión con la que habla la app ahora (la organización del workspace abierto). */
  active(): string | null;
  setActive(key: string): void;
  /** El transporte del borde con esta sesión: cookie + CSRF en la web, el motor en Desk. */
  transport(o?: RetryOptions): Transport;
  /** Web: manda a /v1/identity/login. Desk: marca vencida esa sesión. */
  onUnauthorized(sessionKey?: string): void;
  /** Desk: agrega otra cuenta u organización (login en el navegador). Web: no soportado. */
  add(): Promise<PendingLogin>;
  remove(sessionKey: string): Promise<void>;
  /** Suscripción a cambios de la lista. Devuelve la baja. */
  subscribe(fn: () => void): () => void;
}
