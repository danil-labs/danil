/**
 * Una acción de la persona que necesita su VM (abrir Cuentas de IA, Control de código o Proyectos).
 * La ventana enciende la máquina del workspace con `wake: true`; el sondeo de fondo nunca la manda.
 */
export const MACHINE_ACTION = "harness:machine-action";

export function machineAction(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(MACHINE_ACTION));
}
