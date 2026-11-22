import { SignalDot } from "../../../ui/src/SignalDot";
import { For, Show } from "solid-js";
import { t } from "../../../../apps/desktop/src/lib/i18n";
import { peso } from "../../../../apps/desktop/src/lib/format";
import { haceCuanto } from "../../../../apps/desktop/src/lib/limits";
import { cn } from "../../../../apps/desktop/src/lib/utils";
import Trash2 from "lucide-solid/icons/trash-2";
import ChevronRight from "lucide-solid/icons/chevron-right";
import ChevronDown from "lucide-solid/icons/chevron-down";
import { Pressable } from "../../../ui/src/Pressable";
import { type Machine, machineName } from "./storage-model";
import { Accion, Disk, summaryStale } from "./StorageParts";
import type { StorageProps, StorageState } from "./storage-state";
import type { StorageTasks } from "./storage-tasks";
import type { StorageRows } from "./StorageRows";

/** La pestaña Disco: los discos de la máquina elegida y lo que pesa el workspace. */
export function createDiskView(props: StorageProps, s: StorageState, k: StorageTasks, rows: StorageRows) {
  const { selected, summaries, readError, midiendo, datos, vista, setVista, clearing, compartidoAbierto, setCompartidoAbierto, canClean, liberado, fallo } = s;
  const { tareas, grupos, cuantasTareas, fraccionRecuperable, vaciarCache, recoger } = k;
  const { Fila, GrupoDeProyecto } = rows;

  function MachineDisks(props2: { machine: Machine }) {
    const summary = () => summaries()[props2.machine.id];
    return (
      <>
        <Show when={summary()?.loading}><p class="m-0 mt-1 text-xs text-neutral-500">{t("shell.storage.measuring")}</p></Show>
        <Show when={summary()?.error}><p role="alert" class="m-0 mt-1 whitespace-pre-wrap text-xs text-error-strong">{summary()?.error}</p></Show>
        <Show when={summaryStale(props2.machine, summary())}><p role="status" class="m-0 mt-1 text-xs text-warning-strong">{t("shell.storage.stale")}</p></Show>
        <Show when={summary()?.resources} fallback={<Show when={!summary()?.loading}><p class="m-0 mt-1 text-xs text-neutral-500">{t("shell.storage.capacity_unavailable")}</p></Show>}>
          {(resources) => <>
            <Show when={resources().error}>
              <p role="alert" class="m-0 mt-1 text-xs text-warning-strong">{resources().error === "measurement_failed" ? t("shell.storage.measurement_failed") : t("shell.storage.unsupported")}</p>
            </Show>
            <p class="m-0 mt-1 text-caption text-neutral-500">{resources().error ? t("shell.storage.attempted", { when: haceCuanto(resources().measured_at) }) : t("shell.storage.measured", { when: haceCuanto(resources().measured_at) })}</p>
            <For each={resources().storage}>{(disk) => <Disk disk={disk} />}</For>
            <Show when={resources().storage.length === 0 && !resources().error}><p class="m-0 mt-1 text-xs text-neutral-500">{t("shell.storage.capacity_unavailable")}</p></Show>
          </>}
        </Show>
        <p class="m-0 mt-2 text-caption text-neutral-500">{t("shell.storage.attribution_unknown")}</p>
      </>
    );
  }

  /** La vista de almacenamiento de siempre, ahora en la pestaña Disco. */
  function DiskView() {
    return (
      <>
          <Show when={selected()}>{(m) => (
            <section class="border-b border-border px-3 py-3">
              <h3 class="m-0 text-xs font-semibold text-neutral-950">{machineName(m().id, m().local)}</h3>
              <MachineDisks machine={m()} />
              <p class="m-0 mt-3 text-xs font-semibold text-neutral-950">
                {t("shell.storage.workspace_scope", { workspace: summaries()[m().id]?.workspaceName ?? props.workspace ?? "—" })}
              </p>
              <Show when={!m().on}>
                <p role="status" class="m-0 mt-1 text-xs text-warning-strong">{t("shell.storage.offline")}</p>
              </Show>
              <Show when={m().hosts === false || !props.workspace}>
                <p role="status" class="m-0 mt-1 text-xs text-neutral-500">{t("shell.storage.workspace_missing")}</p>
              </Show>
              <Show when={readError()}>
                <p role="alert" class="m-0 mt-1 whitespace-pre-wrap text-xs text-error-strong">{readError()}</p>
              </Show>
              <Show when={midiendo()}>
                <p role="status" class="m-0 mt-1 text-xs text-neutral-500">{t("shell.storage.measuring")}</p>
              </Show>
              <Show when={datos()?.aviso}>
                <p role="status" class="m-0 mt-1 text-xs text-warning-strong">{t("shell.storage.incomplete")} {datos()?.aviso}</p>
              </Show>
              <Show when={datos()}>
                <p class="m-0 mt-1 text-caption text-neutral-500">{t("shell.storage.measured", { when: haceCuanto(datos()!.medido_en) })}</p>
                <Show when={!m().on || !!readError() || Date.now() - datos()!.medido_en > 300_000}>
                  <p role="status" class="m-0 mt-1 text-xs text-warning-strong">{t("shell.storage.stale")}</p>
                </Show>
              </Show>
            </section>
          )}</Show>
        <Show when={datos()}>
          <div class="flex shrink-0 flex-col gap-2 border-b border-border px-3 py-3">
            <p class="m-0 flex items-baseline gap-2">
              <span class="font-mono text-lg font-semibold tabular-nums text-neutral-950">
                {peso(datos()?.bytes ?? 0)}
              </span>
              <span class="text-caption text-neutral-500">
                {t("shell.storage.in_tasks", { count: cuantasTareas() })}
              </span>
            </p>
            <span class="flex h-2 w-full overflow-hidden rounded-full bg-surface-muted">
              <span class="h-full bg-warning-strong/80" style={{ width: `${fraccionRecuperable() * 100}%` }} />
              <span class="h-full flex-1 bg-neutral-500/45" />
            </span>
            <p class="m-0 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-caption">
              <span class="flex items-center gap-1 font-medium text-warning-strong">
                <SignalDot tone="warning" />
                {t("shell.storage.reclaimable", { size: peso(datos()?.recuperable ?? 0) })}
              </span>
              <span class="flex items-center gap-1 text-neutral-500">
                <SignalDot tone="neutral" />
                {t("shell.storage.permanent", {
                  size: peso(
                    Math.max(0, (datos()?.bytes ?? 0) - (datos()?.recuperable ?? 0)),
                  ),
                })}
              </span>
            </p>
          </div>

          <div class="flex shrink-0 items-center px-3 pt-2">
            <div class="flex items-center gap-0.5 rounded-md bg-surface-muted p-0.5" role="group">
              <For each={["proyecto", "tarea"] as const}>
                {(v) => (
                  <Pressable
                    class={cn(
                      "rounded-sm px-2 py-0.5 text-caption outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary",
                      vista() === v
                        ? "bg-surface font-medium text-neutral-950 shadow-sm"
                        : "text-neutral-500 hover:text-neutral-950",
                    )}
                    aria-pressed={vista() === v}
                    onClick={() => setVista(v)}
                  >
                    {v === "proyecto" ? t("shell.storage.view.by_project") : t("shell.storage.view.by_task")}
                  </Pressable>
                )}
              </For>
            </div>
          </div>

          <div class="px-1.5 pb-1.5 pt-1">
            <Show
              when={tareas().length || (datos()?.archivadas?.cuantas ?? 0)}
              fallback={
                <p class="m-0 px-3 py-4 text-center text-xs text-neutral-500">
                  {clearing()
                    ? t("shell.storage.emptying")
                    : midiendo()
                      ? t("shell.storage.measuring")
                      : t("shell.storage.none")}
                </p>
              }
            >
              <Show
                when={vista() === "proyecto"}
                fallback={
                  <ul class="m-0 list-none p-0">
                    <For each={tareas()}>{(tarea) => <Fila t={tarea} conProyecto />}</For>
                  </ul>
                }
              >
                <ul class="m-0 list-none p-0">
                  <For each={grupos()}>{(g) => <GrupoDeProyecto g={g} />}</For>
                </ul>
              </Show>
              <Show when={(datos()?.archivadas?.cuantas ?? 0) > 0}>
                <section class="mt-1 border-t border-border px-1.5 py-2">
                  <div class="flex items-center gap-2">
                    <span class="min-w-0 flex-1 text-caption font-semibold uppercase tracking-wide text-neutral-500">
                      {t("shell.storage.archived", {
                        n: datos()?.archivadas?.cuantas ?? 0,
                      })}
                    </span>
                    <span class="shrink-0 font-mono text-caption tabular-nums text-neutral-500">
                      {peso(datos()?.archivadas?.bytes ?? 0)}
                    </span>
                  </div>
                  <p class="m-0 mt-0.5 text-caption text-neutral-500">
                    {t("shell.storage.archived.why")}
                  </p>
                </section>
              </Show>
            </Show>

            {/* Plegado por omisión: no es accionable desde aquí. Se abre para
                contestar «¿y el resto de dónde sale?», que es la pregunta que
                deja un total mayor que la suma de las filas. */}
            <section class="border-t border-border">
              <Pressable
                class="flex w-full items-center gap-1.5 px-1.5 py-2 text-left text-caption font-semibold uppercase tracking-wide text-neutral-500 outline-none hover:bg-surface-muted hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
                aria-expanded={compartidoAbierto()}
                onClick={() => setCompartidoAbierto((v) => !v)}
              >
                <Show
                  when={compartidoAbierto()}
                  fallback={<ChevronRight size={12} aria-hidden />}
                >
                  <ChevronDown size={12} aria-hidden />
                </Show>
                <span>{t("shell.storage.shared")}</span>
                <span class="ml-auto font-mono tabular-nums">
                  {peso(
                    (datos()?.compartido ?? []).reduce((n, s) => n + s.bytes, 0),
                  )}
                </span>
              </Pressable>
              <Show when={compartidoAbierto()}>
                {/* El motor limita esta caché al workspace capturado. */}
                <ul
                  class="m-0 list-none px-1.5 pb-2.5"
                  title={t("shell.storage.shared.why")}
                >
                  <For each={datos()?.compartido ?? []}>
                    {(s) => (
                      <li class="flex min-w-0 items-center gap-2 py-0.5">
                        <span class="min-w-0 flex-1 truncate text-caption text-neutral-500">
                          {s.etiqueta}
                        </span>
                        <span class="shrink-0 font-mono text-caption tabular-nums text-neutral-500">
                          {peso(s.bytes)}
                        </span>
                        <Show when={s.rel}>
                          <Accion etiqueta={t("shell.storage.empty_cache")} tono="aviso"
                            disabled={!canClean()} onClick={() => void vaciarCache()}>
                            <Trash2 size={12} aria-hidden />
                          </Accion>
                        </Show>
                      </li>
                    )}
                  </For>
                </ul>
                <Show when={liberado().cache}>
                  <p role="status" class="m-0 px-1.5 pb-2 text-xs text-neutral-500">{liberado().cache}</p>
                </Show>
                <Show when={fallo().cache}>
                  <p role="alert" class="m-0 px-1.5 pb-2 text-xs text-error-strong">{fallo().cache}</p>
                </Show>
              </Show>
            </section>

            <Show when={fallo().orphans}>
              <p role="alert" class="m-0 px-1.5 py-2 text-xs text-error-strong">{fallo().orphans}</p>
            </Show>
            <Show when={liberado().orphans}>
              <p role="status" class="m-0 px-1.5 py-2 text-xs text-neutral-500">{liberado().orphans}</p>
            </Show>
            {/* Lo que quedó de tareas borradas. Solo se pinta si hay: una
                sección permanente que dice «nada» es alto robado. */}
            <Show when={datos()?.sueltos.length}>
              <section class="border-t border-border px-1.5 py-2">
                <div class="flex items-center gap-2">
                  <span class="min-w-0 flex-1 text-caption font-semibold uppercase tracking-wide text-neutral-500">
                    {t("shell.storage.orphans", {
                      n: datos()?.sueltos.length ?? 0,
                    })}
                  </span>
                  <span class="shrink-0 font-mono text-caption tabular-nums text-neutral-500">
                    {peso((datos()?.sueltos ?? []).reduce((n, s) => n + s.bytes, 0))}
                  </span>
                  <Accion
                    etiqueta={t("shell.storage.collect")}
                    tono="aviso"
                    disabled={!canClean()}
                    onClick={() => void recoger()}
                  >
                    <Trash2 size={12} />
                  </Accion>
                </div>
                <p class="m-0 mt-0.5 text-caption text-neutral-500">
                  {t("shell.storage.orphans.why")}
                </p>
              </section>
            </Show>
          </div>
        </Show>
      </>
    );
  }

  return { DiskView };
}
