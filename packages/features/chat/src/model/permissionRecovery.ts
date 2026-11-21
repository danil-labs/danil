/** Solo corre cuando responder a un permiso falla: fuera de la carga inicial. */
import type { PermissionRequest } from "../screens/Chat";
import { mensajeDeFallo } from "./failures.ts";
import { claveDe } from "../../../../../apps/desktop/src/lib/failure.ts";
import { t } from "../../../../../apps/desktop/src/lib/i18n.ts";

type Pendiente = { id?: string; request_id: string; state?: string; closed?: string | null };
type Pendientes = { permissions: Pendiente[]; records?: { permissions: Pendiente[] } };

const RESPONDIDA = new Set(["answering", "sent", "resolved"]);

/**
 * Qué hacer con un gate cuya respuesta falló, según su registro durable.
 * `"respondida"`: otra ventana o esta misma ya decidió; se quita el gate sin fila.
 * Una fila: la petición se cerró sin que nadie pueda contestarla. `null`: sigue esperando y se reintenta.
 */
export function sinRespuesta(p: PermissionRequest, pendientes: Pendientes | null, error: unknown) {
  if (claveDe(error) === "cli.error.pending_already_decided") return "respondida" as const;
  const mine = (x: Pendiente) => (p.durableId ? x.id === p.durableId : x.request_id === p.requestId || x.id === p.requestId);
  if (!pendientes || pendientes.permissions.some(mine)) return null;
  const record = pendientes.records?.permissions.find(mine);
  if (record?.state && RESPONDIDA.has(record.state)) return "respondida" as const;
  return {
    role: "system" as const,
    ...mensajeDeFallo({
      what: record?.state === "delivery_unknown" ? t("shell.turn.permission_delivery_unknown")
        : record?.state === "owner_lost" || record?.closed === "owner_lost" ? { clave: "cli.error.pending_owner_lost" }
        : { clave: "shell.turn.permission_no_reply" },
      detail: { error, record: record ?? null },
    }),
    meta: "fallo",
  };
}
