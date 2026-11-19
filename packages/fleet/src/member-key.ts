/** Solo es una clave interna; los ids públicos de las máquinas nunca cambian. */
export const memberKey = (machine: string, context?: string): string => context ? JSON.stringify([machine, context]) : machine;
export const sameContext = (a?: string, b?: string): boolean => (a ?? "") === (b ?? "");
