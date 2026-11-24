import { t } from "../../../../../../apps/desktop/src/lib/i18n";
import { prosa } from "../../../../../ui/src/lib/prose";
import { type CambioPorCupo, prosaDelCambioPorCupo } from "../../model/failures";

/** El turno dejó de avanzar; lo que produjo ya está arriba en el hilo. */
export function Interrupcion() {
  return (
    <div class="col-start-1 flex items-center gap-3 py-2 text-xs text-neutral-500" role="status">
      <span class="h-px flex-1 bg-border" aria-hidden="true" />
      <span>{t("chat.interrupted")}</span>
      <span class="h-px flex-1 bg-border" aria-hidden="true" />
    </div>
  );
}

/** La tarea siguió con el motor nuevo tras cortar su turno para actualizar (`update_resume.rs`). */
export function LineaDeSistema(props: { texto: string }) {
  return (
    <div class="col-start-1 flex items-center gap-3 py-2 text-xs text-neutral-500" role="status">
      <span class="h-px flex-1 bg-border" aria-hidden="true" />
      <span>{props.texto}</span>
      <span class="h-px flex-1 bg-border" aria-hidden="true" />
    </div>
  );
}

/**
 * El turno que siguió a un cambio de CLI (`provider_handoff_v1`). El motor
 * escribe la prosa —qué agente entró y si retomó su sesión o leyó el texto—;
 * aquí solo se lee como el separador que es.
 */
export function TraspasoDeProveedor(props: { texto: string }) {
  return (
    <div
      class="col-start-1 flex items-center gap-3 py-2 text-xs text-neutral-500"
      role="status"
      data-provider-handover
    >
      <span class="h-px flex-1 bg-border" aria-hidden="true" />
      <span class="min-w-0 break-words text-center">{prosa(props.texto)}</span>
      <span class="h-px flex-1 bg-border" aria-hidden="true" />
    </div>
  );
}

/** La tarea siguió en otra cuenta, o en la misma cuando volvió su cupo. */
export function SiguioTrasElCupo(props: { cambio: CambioPorCupo }) {
  return (
    <div
      class="col-start-1 flex items-center gap-3 py-2 text-xs"
      classList={{
        "text-info-strong": Boolean(props.cambio.to),
        "text-neutral-500": !props.cambio.to,
      }}
      role="status"
      data-quota-row={props.cambio.to ? "switched" : "resumed"}
    >
      <span class="h-px flex-1 bg-border" aria-hidden="true" />
      <span>{prosaDelCambioPorCupo(props.cambio)}</span>
      <span class="h-px flex-1 bg-border" aria-hidden="true" />
    </div>
  );
}
