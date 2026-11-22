import { For, Show } from "solid-js";
import { t } from "../../../../apps/desktop/src/lib/i18n";
import { peso } from "../../../../apps/desktop/src/lib/format";
import { cn } from "../../../../apps/desktop/src/lib/utils";
import Trash2 from "lucide-solid/icons/trash-2";
import ChevronRight from "lucide-solid/icons/chevron-right";
import ChevronDown from "lucide-solid/icons/chevron-down";
import Folder from "lucide-solid/icons/folder";
import SquareArrowOutUpRight from "lucide-solid/icons/square-arrow-out-up-right";
import { Badge } from "../../../ui/src/Badge";
import { Pressable } from "../../../ui/src/Pressable";
import { type Grupo, type TareaConPeso, actividadDe, nombreBloque } from "./storage-model";
import { Accion, Barra } from "./StorageParts";
import type { StorageProps, StorageState } from "./storage-state";
import type { StorageTasks } from "./storage-tasks";

/** Las filas de tareas y los grupos por proyecto de la pestaña Disco. */
export function createStorageRows(props: StorageProps, s: StorageState, k: StorageTasks) {
  const { selected, abiertas, setAbiertas, setGruposAbiertos, abrirTarea, canClean, fallo, liberado } = s;
  const { tope, grupoAbierto, vaciar } = k;

  function Estado(props2: { session: string }) {
    return (
      <Show when={selected()?.active}>
      <Show
        when={props.trabajando.includes(props2.session)}
        fallback={
          <Show when={props.conPestana.includes(props2.session)}>
            <Badge class="px-1.5 py-0 text-2xs">{t("shell.storage.state.open_tab")}</Badge>
          </Show>
        }
      >
        <Badge tone="success" class="px-1.5 py-0 text-2xs">{t("shell.storage.state.working")}</Badge>
      </Show>
      </Show>
    );
  }

  /**
   * Una tarea: su título, cuándo se tocó, su peso y su barra; abierta, sus
   * bloques con nombre. Al pasar por encima, el peso cede a abrir y vaciar.
   */
  function Fila(props2: { t: TareaConPeso; conProyecto?: boolean }) {
    const clave = () => `${props2.t.project}/${props2.t.session}`;
    const abierta = () => !!abiertas()[clave()];
    const tirables = () => props2.t.bloques.filter((b) => b.clase === "recuperable");
    const vaciarTodo = () => void vaciar(props2.t, tirables().map((b) => b.rel));
    return (
      <li class={cn("group rounded-md", abierta() && "bg-surface-muted/60")}>
        <div class="flex min-w-0 items-center gap-1 rounded-md pr-1.5 hover:bg-surface-muted focus-within:bg-surface-muted">
          <Pressable
            class="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 pl-1.5 text-left outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
            aria-expanded={abierta()}
            onClick={() =>
              setAbiertas((a) => ({ ...a, [clave()]: !a[clave()] }))
            }
          >
            <Show when={abierta()} fallback={<ChevronRight size={12} class="shrink-0 text-neutral-500" aria-hidden />}>
              <ChevronDown size={12} class="shrink-0 text-neutral-500" aria-hidden />
            </Show>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-xs font-medium text-neutral-950">
                {props2.t.tarea}
              </span>
              <span class="flex min-w-0 items-center gap-1.5 text-caption text-neutral-500">
                <Show when={props2.conProyecto && props2.t.proyecto}>
                  {(p) => <span class="truncate">{p()}</span>}
                </Show>
                <Show when={actividadDe(props2.t.actividad)}>
                  {(a) => <span class="shrink-0">{a()}</span>}
                </Show>
                <Estado session={props2.t.session} />
              </span>
            </span>
          </Pressable>
          <span class="shrink-0 font-mono text-xs tabular-nums text-neutral-950 group-hover:hidden group-focus-within:hidden">
            {peso(props2.t.bytes)}
          </span>
          <span class="hidden shrink-0 items-center gap-0.5 group-hover:flex group-focus-within:flex">
            <Accion disabled={!selected()?.active} etiqueta={t("shell.storage.open_task")} onClick={() => abrirTarea(props2.t)}>
              <SquareArrowOutUpRight size={12} aria-hidden />
            </Accion>
            <Show when={tirables().length}>
              <Accion
                etiqueta={t("shell.storage.empty_task", { size: peso(props2.t.recuperable) })}
                tono="aviso"
                disabled={!canClean()}
                onClick={vaciarTodo}
              >
                <Trash2 size={12} aria-hidden />
              </Accion>
            </Show>
          </span>
        </div>
        {/* La escala es el peso de la tarea más gorda, no el total del
            workspace: comparadas contra el total, todas las filas salen
            igual de cortas y la barra deja de decir nada. */}
        <div class="pb-1.5 pl-6 pr-1.5">
          <Barra bytes={props2.t.bytes} recuperable={props2.t.recuperable} escala={tope()} />
        </div>

        <Show when={abierta()}>
          <ul class="m-0 list-none pb-2 pl-6 pr-1.5">
            <For each={props2.t.bloques}>
              {(b) => (
                <li class="flex min-w-0 items-center gap-2 py-1">
                  <span class="min-w-0 flex-1">
                    <span
                      class={cn(
                        "block truncate text-xs",
                        b.clase === "recuperable" ? "text-neutral-950" : "text-neutral-700",
                      )}
                    >
                      {nombreBloque(b)}
                    </span>
                    <span class="block truncate font-mono text-2xs text-neutral-500">
                      {b.rel}
                    </span>
                  </span>
                  <span class="shrink-0 font-mono text-caption tabular-nums text-neutral-500">
                    {peso(b.bytes)}
                  </span>
                  {/* Solo lo recuperable lleva botón. Un bloque de fuente o de
                      `.git` no tiene gesto de tirarlo, y esa ausencia es la
                      explicación. */}
                  <Show
                    when={b.clase === "recuperable"}
                    fallback={<span class="size-6 shrink-0" aria-hidden />}
                  >
                    <Accion
                      etiqueta={t("shell.storage.empty_one")}
                      tono="aviso"
                      disabled={!canClean()}
                      onClick={() => void vaciar(props2.t, [b.rel])}
                    >
                      <Trash2 size={12} aria-hidden />
                    </Accion>
                  </Show>
                </li>
              )}
            </For>

            <li class="flex flex-wrap items-center gap-2 pt-1.5">
              <Pressable
                class="flex items-center gap-1.5 rounded-md border border-border-strong bg-surface px-2 py-1 text-caption font-medium text-neutral-950 outline-none hover:bg-surface-muted focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
                disabled={!selected()?.active}
                onClick={() => abrirTarea(props2.t)}
              >
                <SquareArrowOutUpRight size={12} aria-hidden />
                {t("shell.storage.open_task")}
              </Pressable>
              <Show when={tirables().length}>
                <Pressable
                  class="flex items-center gap-1.5 rounded-md border border-warning-strong/40 bg-warning/10 px-2 py-1 text-caption font-medium text-warning-strong outline-none hover:bg-warning/20 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary disabled:opacity-60"
                  disabled={!canClean()}
                  onClick={vaciarTodo}
                >
                  <Trash2 size={12} aria-hidden />
                  {t("shell.storage.empty_task", {
                    size: peso(props2.t.recuperable),
                  })}
                </Pressable>
              </Show>
            </li>

            {/* Lo que pasó cuando no se pudo, en la fila que lo pidió: un botón
                que no hace nada y no dice por qué manda a pulsarlo otra vez. */}
            <Show when={fallo()[clave()]}>
              {(f) => (
                <li class="py-0.5 text-caption text-warning-strong">{f()}</li>
              )}
            </Show>
            <Show when={liberado()[clave()]}>
              {(l) => (
                <li class="py-0.5 text-caption text-neutral-500">{l()}</li>
              )}
            </Show>
          </ul>
        </Show>
      </li>
    );
  }

  function GrupoDeProyecto(props2: { g: Grupo }) {
    const abiertoG = () => grupoAbierto(props2.g.clave);
    return (
      <li>
        <Pressable
          class="flex w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1.5 text-left outline-none hover:bg-surface-muted focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
          aria-expanded={abiertoG()}
          onClick={() =>
            setGruposAbiertos((g) => ({ ...g, [props2.g.clave]: !abiertoG() }))
          }
        >
          <Show when={abiertoG()} fallback={<ChevronRight size={12} class="shrink-0 text-neutral-500" aria-hidden />}>
            <ChevronDown size={12} class="shrink-0 text-neutral-500" aria-hidden />
          </Show>
          <Folder size={12} class="shrink-0 text-neutral-500" aria-hidden />
          <span class="truncate text-xs font-semibold text-neutral-950">{props2.g.nombre}</span>
          <span class="shrink-0 text-caption text-neutral-500">
            {t("shell.storage.group.tasks", { count: props2.g.tareas.length })}
          </span>
          <span class="ml-auto flex shrink-0 items-center gap-2">
            <Show when={props2.g.recuperable > 0}>
              <span class="text-caption text-warning-strong">
                {t("shell.storage.group.reclaimable", { size: peso(props2.g.recuperable) })}
              </span>
            </Show>
            <span class="font-mono text-xs font-semibold tabular-nums text-neutral-950">
              {peso(props2.g.bytes)}
            </span>
          </span>
        </Pressable>
        <Show when={abiertoG()}>
          <ul class="m-0 list-none pl-3">
            <For each={props2.g.tareas}>{(tarea) => <Fila t={tarea} />}</For>
          </ul>
        </Show>
      </li>
    );
  }

  return { Fila, GrupoDeProyecto };
}

export type StorageRows = ReturnType<typeof createStorageRows>;
