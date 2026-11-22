export { EmptyContext } from "../components/EmptyContext";
import { For, Show, createSignal, type JSX } from "solid-js";
import ChevronDown from "lucide-solid/icons/chevron-down";
import Plus from "lucide-solid/icons/plus";
import Search from "lucide-solid/icons/search";
import SettingsIcon from "lucide-solid/icons/settings";
import {
  ITEM_DE_MENU,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../../../ui/src/Popover";
import { enfocar } from "../../../../../apps/desktop/src/lib/focus";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { cn } from "../../../../../apps/desktop/src/lib/utils";
import { type Project, type Source } from "../../../../../apps/desktop/src/lib/model";
import { lineaDeProcedencia, procedencia } from "../../../../../apps/desktop/src/lib/sourceOrigin";
import { Badge } from "../../../../ui/src/Badge";
import WorkdirIcon, { workdirKindLabel } from "../../../../ui/src/WorkdirIcon";
import PickerRow from "../components/PickerRow";
import { byRecent, type PickedAt, pickerSections, taskCountOf } from "../model/recent";
import { Pressable } from "../../../../ui/src/Pressable";

/**
 * Con qué proyecto se trabaja, debajo de la caja y no en la cabecera: es una
 * decisión del mismo gesto que escribir, como el «Choose project» de ChatGPT.
 */
export function ProjectPicker(props: {
  branch?: JSX.Element;
  /** The conversation already belongs to this project, like one of its agents' chats. */
  locked?: boolean;
  projects: Project[];
  project: string;
  /** Las fuentes del workspace, para poder nombrar las que este proyecto lee. */
  sources: Source[];
  onPick: (id: string) => void;
  /** Abre el diálogo «Añadir un proyecto». */
  onNuevoProyecto: () => void;
  /** Abre Ajustes → Proyectos, donde se renombra, se quita y se borra. */
  onAdministrar?: () => void;
  /** Dónde corre la tarea: va antes del proyecto, que es de esa máquina. */
  machine?: JSX.Element;
  /** Última actividad de las tareas vivas de cada proyecto, en ms. */
  activity?: Record<string, number>;
  /** Última vez que se eligió cada proyecto aquí, en ms. */
  picked?: PickedAt;
  /** Los que la persona apartó: van al final de «Más proyectos…», con «Mostrar». */
  hidden?: ReadonlySet<string>;
  onShow?: (id: string) => void;
  /** Tareas activas (no archivadas) por proyecto; sin entrada, el número no se conoce y no se pinta. */
  taskCounts?: Record<string, number>;
}) {
  const [abierto, setAbiertoCrudo] = createSignal(false);
  const [busca, setBusca] = createSignal("");
  const [todos, setTodos] = createSignal(false);
  const setAbierto = (open: boolean) => {
    if (!open) setTodos(false);
    setAbiertoCrudo(open);
  };

  const actual = () => props.projects.find((p) => p.id === props.project) ?? null;

  /** Sin acentos ni mayúsculas: buscar «administracion» encuentra la con tilde. */
  const plano = (s: string) =>
    s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const ocultos = (): ReadonlySet<string> => props.hidden ?? new Set();
  const recientes = () => pickerSections(props.projects, props.activity ?? {}, props.picked ?? {}, ocultos(), props.project);
  // Con texto se busca en todo, ocultos incluidos, y sin corte.
  const filtradas = () => {
    const q = plano(busca().trim());
    if (q) return byRecent(props.projects.filter((p) => plano(p.name).includes(q)), props.activity ?? {}, props.picked ?? {});
    const { visible, rest, hidden } = recientes();
    return todos() ? [...visible, ...rest, ...hidden] : visible;
  };
  const plegados = () => (busca().trim() || todos() ? 0 : recientes().rest.length + recientes().hidden.length);
  const sinNada = () => filtradas().length === 0;

  function elegir(id: string) {
    setAbierto(false);
    setBusca("");
    props.onPick(id);
  }
  const material = () =>
    actual()
      ?.sources.map((id) => props.sources.find((s) => s.id === id))
      .filter((s): s is Source => Boolean(s)) ?? [];

  return (
    <div class="flex w-full max-w-[860px] flex-wrap items-center gap-x-2 gap-y-1 px-4 pt-1.5">
      {props.machine}
      <WorkdirIcon
        kind={actual()?.kind ?? "folder"} cloud={actual()?.cloud}
        class="shrink-0 text-neutral-500"
      />
      <Show when={!props.locked} fallback={
        <span class="flex min-h-7 max-w-[420px] items-center px-1 text-xs text-neutral-500">
          <span class="truncate">{actual()?.name ?? t("projects.picker.none")}</span>
        </span>
      }>
      <Popover open={abierto()} onOpenChange={setAbierto} placement="top-start" gutter={4}>
        <PopoverTrigger
          class="flex min-h-7 max-w-[420px] items-center gap-1 rounded-sm px-1 text-left text-xs text-neutral-500 hover:text-neutral-950"
          aria-label={t("projects.picker.label")}
        >
          <span class="truncate">
            {actual()?.name ?? t("projects.picker.none")}
          </span>
          <ChevronDown size={11} aria-hidden="true" />
        </PopoverTrigger>

        <PopoverContent class="w-[300px] overflow-hidden p-0 text-caption text-neutral-500 shadow-lg">
          <div class="relative border-b border-border">
            <Search
              size={11}
              class="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              ref={enfocar}
              class="w-full bg-transparent py-1 pr-2 pl-6 text-caption outline-none"
              placeholder={t("projects.picker.search")}
              value={busca()}
              onInput={(e) => setBusca(e.currentTarget.value)}
            />
          </div>

          <div class="max-h-[260px] overflow-y-auto py-1">
            <Show when={!busca().trim()}>
              <Pressable class={ITEM_DE_MENU} onClick={() => elegir("")}>
                {t("projects.picker.none")}
              </Pressable>
            </Show>

            <For each={filtradas()}>
              {(p) => (
                <PickerRow
                  project={p} icon={<WorkdirIcon kind={p.kind} cloud={p.cloud} size={13} class="text-neutral-500" />}
                  kindLabel={workdirKindLabel(p.kind, p.cloud)} tasks={taskCountOf(p, props.taskCounts)} hidden={ocultos().has(p.id)}
                  onPick={() => elegir(p.id)} onShow={props.onShow && (() => props.onShow?.(p.id))}
                />
              )}
            </For>

            <Show when={plegados() > 0}>
              <Pressable class={cn(ITEM_DE_MENU, "text-neutral-700")} data-more-projects="" onClick={() => setTodos(true)}>
                {t("projects.picker.more", { n: plegados() })}
              </Pressable>
            </Show>

            <Show when={sinNada()}>
              <p class="m-0 px-2 py-3 text-center text-caption">
                {t("projects.picker.no_match")}
              </p>
            </Show>
          </div>

          <div class="border-t border-border py-1">
            <Pressable
              class={cn(ITEM_DE_MENU, "flex items-center gap-2 text-neutral-700")}
              onClick={() => {
                setAbierto(false);
                props.onNuevoProyecto();
              }}
            >
              <Plus size={13} aria-hidden="true" />
              {t("projects.picker.add")}
            </Pressable>
            <Show when={props.onAdministrar}>
              {(administrar) => (
                <Pressable
                  class={cn(ITEM_DE_MENU, "grid grid-cols-[14px_minmax(0,1fr)_auto] items-center gap-2 text-neutral-700")}
                  onClick={() => {
                    setAbierto(false);
                    administrar()();
                  }}
                >
                  <SettingsIcon size={13} aria-hidden="true" />
                  <span class="truncate">{t("projects.picker.manage")}</span>
                  <span class="text-caption text-neutral-500">
                    {t("projects.picker.manage_where")}
                  </span>
                </Pressable>
              )}
            </Show>
          </div>
        </PopoverContent>
      </Popover>
      </Show>

      {props.branch}

      {/* Qué va a leer el agente. Es estado, no glosa: sin esto, que el
          proyecto lea tres carpetas o ninguna se ve exactamente igual. */}
      <Show when={actual() && material().length > 0}>
        <span class="flex min-w-0 flex-wrap items-center gap-1">
          <For each={material()}>
            {(s) => (
              <Badge
                forma="dato"
                class="text-2xs"
                title={lineaDeProcedencia(
                  procedencia(s),
                  t("projects.view.origin_folder"),
                )}
              >
                {s.missing
                  ? t("projects.picker.source_missing", { name: s.name })
                  : s.name}
              </Badge>
            )}
          </For>
        </span>
      </Show>

      {/* Sin botón de «Nuevo proyecto» al lado: el selector ya lo ofrece como
          su última opción, y dos puertas al mismo sitio hacen dudar de si van
          al mismo sitio. */}
    </div>
  );
}

/* Aquí vivía `Destino`, el selector de a dónde publica el proyecto. Se fue con
   el campo: ver `workspace/projects.rs`. Prometía Confluence y Repositorio, que no
   existen, a alguien que no programa.

   Y aquí vivían `Project`, `Source` y `Agent`, que ahora están en
   `lib/model.ts`: siete archivos importaban tipos de un módulo que además
   pinta un selector. */
