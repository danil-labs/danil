import TriangleAlert from "lucide-solid/icons/triangle-alert";
import { For, Show } from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { Button } from "../../../../ui/src/Button";
import { type Failure, FailureNote } from "../../../../ui/src/Failure";
import { type Falla, funcion, motivo, remedio } from "../model/bundled";

/** Las funciones que no pasaron la comprobación, con lo que las arregla: reparar, reiniciar o reinstalar. */
export function FuncionesAfectadas(props: {
  fallas: Falla[];
  reparando: boolean;
  error: Failure | null;
  onReparar: () => void;
  onReiniciar: () => void;
}) {
  const caso = () => remedio(props.fallas);
  return (
    <div class="grid gap-2.5 rounded-lg border border-warning/40 bg-surface-raised px-4 py-3" data-setup-functions="">
      <p class="m-0 flex items-center gap-2 text-ui font-semibold text-neutral-950">
        <TriangleAlert size={15} class="shrink-0 text-warning-strong" aria-hidden="true" />
        {t("setup.functions.title")}
      </p>
      <ul class="m-0 grid list-none gap-1 p-0">
        <For each={props.fallas}>
          {(f) => (
            <li class="grid text-ui" data-function={f.id ?? "environment"} data-reason={f.reason}>
              <span class="text-neutral-950">{funcion(f.id)}</span>
              <span class="text-caption text-neutral-500">{motivo(f.reason)}</span>
            </li>
          )}
        </For>
      </ul>
      <Show when={caso() !== "repair"}>
        <p class="m-0 text-xs text-neutral-500">
          {caso() === "restart" ? t("setup.functions.restart_hint") : t("setup.functions.reinstall_hint")}
        </p>
      </Show>
      <div class="flex flex-wrap gap-2">
        <Show when={caso() === "restart"}>
          <Button size="sm" onClick={props.onReiniciar}>
            {t("setup.functions.restart")}
          </Button>
        </Show>
        <Button size="sm" variant={caso() === "repair" ? "primary" : "secondary"} disabled={props.reparando} onClick={props.onReparar}>
          {props.reparando ? t("setup.functions.repairing") : t("setup.functions.repair")}
        </Button>
      </div>
      <Show when={props.error}>{(e) => <FailureNote f={e()} />}</Show>
    </div>
  );
}
