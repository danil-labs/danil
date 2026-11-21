import type { Machine } from "../../../machines/src/queries/store";

type SecretMachine = Pick<Machine, "id" | "active" | "features">;
export type SecretsRoute = "worker" | "unsupported" | `engine:${string}`;

/** Sin cabecera de máquina, las órdenes del workspace van al motor marcado `active`. */
export function secretsRoute(where: "engine" | "worker", machines: readonly SecretMachine[]): SecretsRoute {
  if (where === "worker") return "worker";
  const target = machines.find((machine) => machine.active);
  return target?.features?.includes("secrets_v1") ? `engine:${target.id}` : "unsupported";
}
