/**
 * La organización personal de la persona, sea cual sea su plan: puede subir a Pro y sigue
 * siendo la personal, con sus workspaces en esta computadora (decisión de cuentas 2026-11-18).
 * Identity lo dice con `personal`; uno anterior no lo manda y entonces cuenta el plan Free.
 */
export type PersonalSignal = { plan?: string | null; personal?: boolean };
export const isPersonal = (g: PersonalSignal) => g.personal ?? g.plan === "free";
