/** Lo que «Ejecutar en» sabe de una máquina en el workspace abierto (`machine_list`). */
export type WorkspaceHost = { hosts: boolean | null; materializes?: boolean; refuses?: boolean };

/** Si «Ejecutar en» la ofrece en el workspace abierto: la que no tiene permiso ahí no sale. */
export const runsWorkspace = (m: WorkspaceHost) => !(m.hosts === false && !m.materializes && m.refuses);
