import Check from "lucide-solid/icons/check";
import Copy from "lucide-solid/icons/copy";
import { For, Show } from "solid-js";
import { df } from "../../../../../ui/src/lib/format";
import { t } from "../../../../../ui/src/lib/i18n";
import type { AgentModels, Source } from "../../../../../ui/src/lib/model";
import { modelBrand, nombreDeModelo } from "../../../../../ui/src/lib/models";
import { Button } from "../../../../../ui/src/Button";
import { MarcaAgente } from "../../../../../ui/src/icons";
import { MarcaFuente } from "../../../../../ui/src/sources";
import { RETARDO_TOOLTIP, TooltipContent, TooltipRoot, TooltipTrigger } from "../../../../../ui/src/Tooltip";


export function HoraDelTurno(props: { at?: number }) {
  return (
    <Show when={props.at}>
      {(at) => (
        <time
          datetime={new Date(at()).toISOString()}
          tabindex={0}
          class="cursor-default rounded-sm px-1 text-caption leading-4 whitespace-nowrap text-neutral-500 outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {mostrarHoraDeTurno(at())}
        </time>
      )}
    </Show>
  );
}


/**
 * De dónde salió un turno —logo del agente y modelo—, tras la hora.
 *
 * **No se inventa el modelo con el que se contestaría hoy**: usa el que el
 * cierre observó en ese turno. El nombre del proveedor no se escribe —el logo
 * ya lo dice—; sin modelo solo queda el logo, con el nombre en el título.
 */
export function LineaDeProveedor(props: {
  agent: string;
  provider?: string;
  /** El modelo observado en ese turno, no el elegido ahora. */
  model?: string;
  catalogo: AgentModels | null;
  /** Cómo se llama el agente, para el título cuando no hay proveedor. */
  agentLabel: string;
}) {
  // El nombre del proveedor no se escribe: el logo ya lo dice y el modelo va
  // solo. Queda en el `title` para quien pase el cursor por encima.
  const titulo = () => modelBrand(props.agent, props.model, props.catalogo) === "danil" ? t("surfaces.label.free") : props.provider ?? props.agentLabel;
  return (
    <span
      class="flex items-center gap-1 whitespace-nowrap rounded-sm px-1 text-caption leading-4 text-neutral-500"
      title={titulo()}
      aria-label={t("chat.actions.provider")}
      data-provider={props.provider}
    >
      <span class="flex size-3.5 shrink-0 items-center justify-center">
        <MarcaAgente id={modelBrand(props.agent, props.model, props.catalogo)} size={12} />
      </span>
      <Show when={props.model}>
        {(id) => (
          <span class="max-w-[16rem] truncate" title={id()}>
            {nombreDeModelo(id(), props.catalogo)}
          </span>
        )}
      </Show>
    </span>
  );
}


export function BotonCopiar(props: {
  copiando: boolean;
  copiado: boolean;
  onCopiar: () => void;
}) {
  return (
    <TooltipRoot openDelay={RETARDO_TOOLTIP} placement="top">
      <TooltipTrigger
        as={(p: object) => (
          <Button
            {...p}
            type="button"
            variant="ghost"
            size="iconCompact"
            class="text-neutral-500"
            disabled={props.copiando}
            aria-label={props.copiado ? t("chat.actions.copied") : t("chat.actions.copy")}
            onClick={(e: MouseEvent) => {
              (p as { onClick?: (e: MouseEvent) => void }).onClick?.(e);
              props.onCopiar();
            }}
          >
            <Show when={props.copiado} fallback={<Copy size={14} />}>
              <Check size={14} />
            </Show>
          </Button>
        )}
      />
      <TooltipContent class="whitespace-nowrap">
        {props.copiado ? t("chat.actions.copied") : t("chat.actions.copy")}
      </TooltipContent>
    </TooltipRoot>
  );
}


/** «27 ago, 11:12»; el año solo si no es el actual. */
function mostrarHoraDeTurno(at: number, ahora: Date = new Date()) {
  const fecha = new Date(at);
  const mismoAnio = fecha.getFullYear() === ahora.getFullYear();
  return df({
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    ...(mismoAnio ? {} : { year: "numeric" }),
  }).format(fecha);
}


/**
 * Qué material se empezó a ofrecer, en el punto del hilo donde pasó. No hay
 * contrapartida de salida: lo que el agente leyó sigue en la sesión
 * (`--resume`) y solo una sesión nueva lo retira.
 */
export function CambioDeContexto(props: {
  cambio: { entraron: string[] };
  catalogo: Source[];
}) {
  const Marca = (p: { id: string }) => {
    const s = () => props.catalogo.find((f) => f.id === p.id);

    return (
      <span class="flex items-center gap-1">
        <Show when={s()}>
          {(f) => <MarcaFuente location={f().location} kind={f().kind} />}
        </Show>
        <span class="min-w-0 truncate">
          {s() ? s()!.etiqueta : t("chat.context.gone_source")}
        </span>
      </span>
    );
  };

  return (
    <div class="flex items-center gap-2 text-caption text-neutral-500">
      <span class="h-px flex-1 bg-border" />
      <div class="flex min-w-0 flex-col gap-1">
        <Show when={props.cambio.entraron.length}>
          <div class="flex min-w-0 flex-wrap items-center gap-2">
            <span class="font-semibold text-neutral-700">
              {t("chat.context.added")}
            </span>
            <For each={props.cambio.entraron}>{(id) => <Marca id={id} />}</For>
          </div>
        </Show>
      </div>
      <span class="h-px flex-1 bg-border" />
    </div>
  );
}
