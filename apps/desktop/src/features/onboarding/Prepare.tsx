import CircleCheck from "lucide-solid/icons/circle-check";
import TriangleAlert from "lucide-solid/icons/triangle-alert";
import { Match, Switch } from "solid-js";
import { t } from "../../lib/i18n";
import { Spinner } from "../../ui/Spinner";

export type EstadoDeEtapa = "waiting" | "running" | "succeeded" | "failed" | "skipped";

export type Instalacion = {
  titulo: string;
  porcentaje: number;
  terminado: boolean;
  fallido: boolean;
};

export function PreparationProgress(props: { i: Instalacion }) {
  return (
    <section class="flex min-h-0 flex-1 flex-col justify-center gap-4 rounded-lg border border-border bg-surface-raised px-5 py-5">
      <div class="flex items-center gap-3" role="status" aria-live="polite">
        <Switch fallback={<Spinner size={24} class="text-primary" />}>
          <Match when={props.i.fallido}>
            <TriangleAlert size={24} class="shrink-0 text-warning-strong" aria-hidden="true" />
          </Match>
          <Match when={props.i.terminado}>
            <CircleCheck size={24} class="shrink-0 text-success-strong" aria-hidden="true" />
          </Match>
        </Switch>
        <h2 class="m-0 text-body font-semibold text-neutral-950">{props.i.titulo}</h2>
      </div>
      <div
        class="h-1.5 overflow-hidden rounded-full bg-surface-muted"
        role="progressbar"
        aria-label={t("setup.progress")}
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={props.i.porcentaje}
      >
        <div class="h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${props.i.porcentaje}%` }} />
      </div>
      <p class="m-0 text-ui text-neutral-500">{t("setup.bundled.description")}</p>
    </section>
  );
}
