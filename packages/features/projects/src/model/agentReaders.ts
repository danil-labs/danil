/**
 * Los agentes cuyos lectores se salen de la combinación más común. Una fila
 * que repite lo mismo que las demás no informa. Sin mayoría clara, ninguna
 * combinación es la normal y todas se dicen.
 */
export function agentsWithDifferentReaders(
  agents: readonly { name: string; providers: readonly string[] }[],
): Set<string> {
  const lectores = (agent: { providers: readonly string[] }) => [...agent.providers].sort().join("\n");
  const cuentas = new Map<string, number>();
  for (const agent of agents) {
    const clave = lectores(agent);
    cuentas.set(clave, (cuentas.get(clave) ?? 0) + 1);
  }
  if (cuentas.size < 2) return new Set();
  const mayor = Math.max(...cuentas.values());
  const empatadas = [...cuentas.values()].filter((n) => n === mayor).length > 1;
  return new Set(
    agents
      .filter((agent) => empatadas || cuentas.get(lectores(agent)) !== mayor)
      .map((agent) => agent.name),
  );
}
