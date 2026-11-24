import type { JSX } from "solid-js";
import { Show } from "solid-js";
import { t } from "../../../ui/src/lib/i18n";
import { elapsed, percent } from "../../../ui/src/lib/format";
import { cn } from "../../../ui/src/lib/utils";
import Copy from "lucide-solid/icons/copy";
import ExternalLink from "lucide-solid/icons/external-link";
import Globe from "lucide-solid/icons/globe";
import Square from "lucide-solid/icons/square";
import { TooltipAction } from "../../../ui/src/TooltipAction";
import { HOT_CPU, type Puerto, type PuertosProps, type TaskProcess } from "./open-ports-types";
import type { EstadoDePuertos } from "./open-ports-state";

/** Las filas del panel: la de un puerto, la de un proceso y su botón de icono. */
export function createFilasDePuertos(props: PuertosProps, estado: EstadoDePuertos) {
  const { setAbierto, abrir, copiado, copiar, cerrando, cerrar, stop } = estado;

  /** Un botón de icono de la fila, con su globo. Los tres se pintan igual. */
  function Accion(props2: {
    etiqueta: string;
    onClick: () => void;
    disabled?: boolean;
    children: JSX.Element;
  }) {
    return (
      <TooltipAction class="flex size-5 shrink-0 items-center justify-center rounded-sm text-neutral-500 outline-none hover:bg-surface-muted hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary disabled:opacity-60" etiqueta={props2.etiqueta} onClick={props2.onClick} disabled={props2.disabled}>
        {props2.children}
      </TooltipAction>
    );
  }

  /**
   * Una fila de puerto. `session` vacío es un externo: sin botón de cerrar y
   * **sin «Abrir aquí»**.
   *
   * Una pestaña de sitio pertenece a una tarea, igual que la de un archivo o la
   * de un artefacto (`lib/tabs.ts`): se cierra con ella y va pegada a ella
   * en la tira. Un puerto externo no lo abrió ninguna, así que no hay contexto
   * de tarea que conservar — que es justo lo que la pestaña existe para no
   * perder. Ese se abre donde ya se abría: en el navegador del sistema.
   */
  function Fila(props2: { p: Puerto; session?: string; project?: string }) {
    return (
      <li class="flex min-w-0 items-center gap-2 py-0.5">
        <span class="shrink-0 font-mono text-xs tabular-nums text-neutral-950">
          {props2.p.direccion}
        </span>
        <span class="min-w-0 flex-1 truncate text-xs text-neutral-500">
          {props2.p.comando}
        </span>
        <Show when={props2.session && props2.project !== undefined}>
          <Accion
            etiqueta={t("shell.ports.open_here")}
            onClick={() => {
              // Se cierra el panel: es un popover, o sea un hijo de `<body>`, y
              // mientras esté abierto la capa nativa del sitio se queda
              // escondida a propósito para no taparlo (`lib/sites.ts`). Sin
              // esto, pulsar «Abrir aquí» abre la pestaña y no enseña nada.
              setAbierto(false);
              props.onAbrirSitio(
                props2.p.url,
                props2.project ?? "",
                props2.session ?? "",
              );
            }}
          >
            <Globe size={12} />
          </Accion>
        </Show>
        <Accion etiqueta={t("shell.ports.open_browser")} onClick={() => void abrir(props2.p)}>
          <ExternalLink size={12} />
        </Accion>
        <Accion
          etiqueta={copiado() === props2.p.id ? t("shell.ports.copied") : t("shell.ports.copy")}
          onClick={() => void copiar(props2.p)}
        >
          <Copy size={12} class={copiado() === props2.p.id ? "text-primary" : ""} />
        </Accion>
        <Show when={props2.session}>
          {(s) => (
            <Accion
              etiqueta={t("shell.ports.close")}
              disabled={cerrando()[props2.p.pid]}
              onClick={() => void cerrar(props2.p, s())}
            >
              <Square size={12} />
            </Accion>
          )}
        </Show>
      </li>
    );
  }

  function ProcessRow(props2: { p: TaskProcess; session: string }) {
    return (
      <li class="flex min-w-0 items-center gap-2 py-0.5">
        <span class="shrink-0 font-mono text-xs text-neutral-950">{props2.p.command}</span>
        <span
          class={cn(
            "shrink-0 font-mono text-xs tabular-nums",
            props2.p.cpu_percent >= HOT_CPU ? "text-warning-strong" : "text-neutral-500",
          )}
        >
          {percent(Math.round(props2.p.cpu_percent))}
        </span>
        <span class="min-w-0 flex-1 truncate text-xs text-neutral-500">
          {elapsed(props2.p.elapsed_seconds)}
          <Show when={props2.p.orphan}> · {t("shell.processes.orphan")}</Show>
        </span>
        <Accion
          etiqueta={t("shell.processes.close")}
          disabled={cerrando()[props2.p.pid]}
          onClick={() => void stop(props2.p, props2.session)}
        >
          <Square size={12} />
        </Accion>
      </li>
    );
  }

  return { Fila, ProcessRow };
}
