// Presupuesto provisional menor que los 30 s del cliente; ajustar con el p99 del despliegue.
// La entrada se retirará con el borde, pero ningún salto legado puede esperar indefinidamente.
const DEFAULT_TIMEOUT_MS = 10_000;

export function upstreamSignal(env, caller) {
  const configured = Number(env.UPSTREAM_TIMEOUT_MS);
  const milliseconds = Number.isSafeInteger(configured) && configured > 0 ? configured : DEFAULT_TIMEOUT_MS;
  const deadline = AbortSignal.timeout(milliseconds);
  return caller ? AbortSignal.any([caller, deadline]) : deadline;
}
