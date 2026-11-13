import type { InboxSession } from '../../../../../packages/attention/src/inbox.ts';

/** Cómo llegan las vistas de Atención al BFF: la web por su entrada alfa; el escritorio, por la ventana y Computers. */
export type BffTransport = {
  prefix: string;
  request: typeof fetch;
  /** La cuenta activa de la sesión (`active_account_id`), sin que la vista lea el token. */
  active: (session: InboxSession) => Promise<number | null>;
};

let current: BffTransport = {
  prefix: "",
  request: async () => { throw new Error("unavailable"); },
  active: async () => null,
};

export const bffTransport = () => current;
export function setBffTransport(next: BffTransport) { current = next; }
