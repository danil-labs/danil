/**
 * Sin uso en producto: ningún cliente aparta una máquina por su contrato; solo
 * un `version_mismatch` real del relay o del motor la marca. No es compuerta.
 *
 * Si el motor de una computadora habla el contrato con el que se hizo un
 * cliente: `contract` es el hash que dio su último `hello` (`GET /v1/computers`)
 * y `own`, el de `commands.json` del cliente.
 */
export type Compatibility = "ok" | "outdated" | "unknown";

// Familia auditada: cada contrato solo añade órdenes al anterior y conserva
// las existentes y los eventos byte por byte. El segundo añade
// chat_visual_part; el tercero, las credenciales de la cuenta
// (account_credential*, sync/reseal) y GitHub en la cuenta (github_account_*).
// Una orden nueva contra un motor anterior falla como orden desconocida.
// No se admite ningún otro contrato por semejanza.
const VISUAL_PARTS = [
  "d4541d178c64a065c1a4a0c693817eb84ad17052fd605815295fa1696955ef8f",
  "3972c281dba1b61f9ad06fc82fbf059af3dbc55770b0a1bcb59ce786ec0a56f1",
  "f33064bff6afb3708517c13a90f327af5333cbd82b15a589a2373c80d79e6d51",
  "93b1c32f25c4fb5fd722079a5593f8316125d91e8ecf12e64c3d7e1f7aebae98",
];

export function machineContracts(own: string | null | undefined): string[] {
  const normalized = typeof own === "string" ? own.trim().toLowerCase() : "";
  return VISUAL_PARTS.includes(normalized) ? [...VISUAL_PARTS] : normalized ? [normalized] : [];
}

export function machineCompatibility(contract: string | null | undefined, own: string | null | undefined): Compatibility {
  const theirs = typeof contract === "string" ? contract.trim().toLowerCase() : "";
  const mine = typeof own === "string" ? own.trim().toLowerCase() : "";
  if (!theirs || !mine) return "unknown";
  return machineContracts(mine).includes(theirs) ? "ok" : "outdated";
}
