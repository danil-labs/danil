/**
 * «Sincronizar credenciales»: dispara en Rust (`danil_credentials_sync`) la
 * primera copia sellada de las claves de la bóveda local hacia las máquinas de la
 * persona. La webview no ve el Bearer, el secreto ni la copia sellada: solo
 * recibe conteos. `unavailable` es un 404 o un 501 del servicio (se reintenta
 * solo cuando aparezca, sin otra versión de Desk).
 */
import { invoke } from "../../../lib/invoke.ts";

export type MachineCredentialsSync =
  | { state: "unavailable" }
  | { state: "done"; sent: number; already: number; skipped: number; failed: string[] };

export function syncMachineCredentials(context?: string): Promise<MachineCredentialsSync> {
  return invoke<MachineCredentialsSync>("danil_credentials_sync", context === undefined ? {} : { context });
}
