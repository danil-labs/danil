/** Una sesión: quién soy. En Desk la llave es (email, organization_id). */
export interface Session {
  /** Llave estable: `${email}|${organization_id}` en Desk; "web" en la web. */
  key: string;
  email: string;
  organization_id: string | null;
  /** true si el borde o el motor dijeron que venció. */
  expired: boolean;
}

/** Referencia a una sesión o a un workspace de ella. */
export interface SessionRef {
  workspaceId?: string;
  sessionKey?: string;
}

/** Fuente única de sesión; web y Desk la implementan. Sin reglas de permisos. */
export interface SessionSource {
  /** Web: una; Desk: varias. */
  list(): Session[];
  /** Web: null (va por cookie). Desk: token corto del motor. */
  tokenFor(workspaceIdOrSessionKey: string): Promise<string | null>;
  /** Token CSRF vigente; se rota si el borde responde 403 csrf (B-027). */
  csrf(): Promise<string>;
  /** Invalida el CSRF en caché para pedir otro. */
  invalidateCsrf(): void;
  /** Web: redirige a /login (B-032). Desk: marca la sesión vencida. */
  onUnauthorized(sessionKey?: string): void;
  /** Desk: pide al motor auth.add. Web: no soportado. */
  add(): Promise<Session>;
  remove(sessionKey: string): Promise<void>;
  /** Suscripción a cambios de la lista. Devuelve la baja. */
  subscribe(fn: () => void): () => void;
}
