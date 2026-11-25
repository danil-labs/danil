import { Show } from "solid-js";
import { type SenderTask } from "../../../../ui/src/lib/recipients";
import { t } from "../../../../ui/src/lib/i18n";
import { gestoDeLaFila, prosaDelFallo } from "../model/failures";
import { citaInforme, idDeLaEntregaAntigua, prosaDeLaFila } from "../model/inboxRows";
import type { Msg } from "../model/messageTypes";
import { Pressable } from "../../../../ui/src/Pressable";
import { OpenSenderTask } from "../components/OpenSenderTask";


/**
 * Lo que la Bandeja de un agente recibe cuando termina una tarea que lanzó, y
 * la línea del turno con que Terminus la despierta. El informe de la hija va
 * citado debajo: es lo que ella dijo, no la app.
 */
function FilaDeLaBandeja(props: {
  msg: Msg;
  onOpenTask?: (folder: string, task: string, machine?: string | null) => void;
  tareaPorId?: (id: string) => SenderTask | null;
}) {
  const informe = () => (citaInforme(props.msg.meta) ? props.msg.text.trim() : "");
  const tarea = () => {
    if (props.msg.fromTask || props.msg.meta !== "respondido") return props.msg.fromTask ?? null;
    const id = idDeLaEntregaAntigua(props.msg.text);
    return id ? (props.tareaPorId?.(id) ?? null) : null;
  };
  return (
    <div
      class="col-start-1 flex items-start gap-3 py-2 text-xs text-neutral-500"
      role="status"
      data-sender="system"
      data-inbox-row={props.msg.meta}
    >
      <span class="mt-[0.45rem] h-px w-6 shrink-0 bg-border" aria-hidden="true" />
      <span class="flex min-w-0 flex-col items-start gap-1">
        <span class="break-words">
          {prosaDeLaFila(props.msg.meta ?? "", tarea()?.title ?? null, props.msg.woke_by?.length ?? 0)}
          <Show when={props.onOpenTask ? tarea() : null}>
            {(sender) => <OpenSenderTask sender={sender} onOpenTask={props.onOpenTask} />}
          </Show>
        </span>
        <Show when={informe()}>
          {(texto) => (
            <blockquote class="m-0 border-l-2 border-border pl-2 break-words whitespace-pre-wrap text-neutral-700">
              {texto()}
            </blockquote>
          )}
        </Show>
      </span>
      <span class="mt-[0.45rem] h-px flex-1 bg-border" aria-hidden="true" />
    </div>
  );
}

/**
 * Lo que le pasó al hilo y no lo dijo el agente: un turno que murió, un
 * aviso de la app. Misma forma que la interrupción, solo cambia el
 * color; el panel se queda en la transcripción para siempre
 * (`runtime/chat/`, el cierre). `role="alert"` interrumpe al lector de
 * pantalla: correcto para un fallo, no para un aviso. El texto sale de
 * `failures::Fallo`, traducido; con un gesto que sirva son dos botones. */
function HitoDelHilo(props: {
  msg: Msg;
  /** Si es el fallo de lo último que se escribió: solo ése ofrece reintentar. */
  vigente: boolean;
  /** Volver a mandar lo último que se escribió. */
  onReintentar: () => void;
  /** Llevar a donde se conectan y se cambian las cuentas. */
  onCuentas: () => void;
  /** Abre la tarea que firmó la fila (`Turn::from_task`). */
  onOpenTask?: (folder: string, task: string, machine?: string | null) => void;
}) {
  const esFallo = () => props.msg.meta === "fallo";
  const textoDelFallo = () => prosaDelFallo(props.msg);
  const prefijo = () => t("chat.failure.prefix");
  const mostrarPrefijo = () => esFallo() && !textoDelFallo().toLowerCase().startsWith(prefijo().toLowerCase());
  return (
    <div
      class="col-start-1 flex items-start gap-3 py-2 text-xs"
      classList={{
        "text-warning-strong": esFallo(),
        "text-neutral-500": !esFallo(),
      }}
      role={esFallo() ? "alert" : "status"}
      data-sender="system"
    >
      <span class="mt-[0.45rem] h-px w-6 shrink-0 bg-border" aria-hidden="true" />
      <span class="flex min-w-0 flex-col items-start gap-0.5">
        <span class="break-words">
          <Show when={mostrarPrefijo()}>
            <strong class="font-medium">{prefijo()} </strong>
          </Show>
          {textoDelFallo()}
          <Show when={gestoDeLaFila(props.msg, props.vigente)}>
            {(g) => (
              <>
                {" — "}
                <Pressable
                  class="cursor-pointer underline underline-offset-2"
                  onClick={() =>
                    g().accion === "reintentar"
                      ? props.onReintentar()
                      : props.onCuentas()
                  }
                >
                  {t(g().clave)}
                </Pressable>
              </>
            )}
          </Show>
          <Show when={props.onOpenTask ? props.msg.fromTask : null}>
            {(sender) => <OpenSenderTask sender={sender} onOpenTask={props.onOpenTask} />}
          </Show>
        </span>
        <Show
          when={props.msg.fallo?.detail && props.msg.fallo.detail !== prosaDelFallo(props.msg)
            ? props.msg.fallo : null}
        >
          {(f) => (
            <details class="text-neutral-500">
              <summary class="cursor-pointer text-caption">{t("common.failure.detail")}</summary>
              <p class="m-0 font-mono text-[0.7rem] break-all whitespace-pre-wrap">{f().detail}</p>
            </details>
          )}
        </Show>
      </span>
      <span class="mt-[0.45rem] h-px flex-1 bg-border" aria-hidden="true" />
    </div>
  );
}
export { FilaDeLaBandeja, HitoDelHilo };
