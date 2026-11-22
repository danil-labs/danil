import ChevronRight from "lucide-solid/icons/chevron-right";
import { createMemo, For, Show } from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { createPref } from "../../../../../apps/desktop/src/lib/prefs";
import { cn } from "../../../../../apps/desktop/src/lib/utils";
import { KeyedList } from "../../../../ui/src/KeyedList";
import { AstroAvatar } from "./AstroAvatar";
import { displayName } from "../queries/profiles";
import EstadoDeTarea from "./TaskStatus";
import { authorKey, authorKeys } from "../model/taskAuthors";
import { descendientes, type Rama as RamaDeTareas } from "../model/taskTree";
import { rolledOutcome } from "../../../../ui/src/index";
import { taskIdentity } from "../../../../ui/src/lib/tasks.ts";
import { Pressable } from "../../../../ui/src/Pressable";
import type { SessionRow, SessionsProps } from "./sessions-model";
import type { SessionsState } from "./sessions-state";
import type { createFila } from "./sessions-row";

/**
 * Qué tareas padre están desplegadas, por id. Una rama nace plegada: las
 * subtareas se levantan solas mientras el turno corre, y desplegadas empujan
 * hacia abajo el resto del historial sin que nadie lo haya pedido. La fila de
 * resumen dice cuántas hay y es la que las abre.
 *
 * **Vive en el módulo y no dentro del componente**, al revés que los proyectos
 * plegados del riel. El motivo es que esta lista se monta varias veces a la vez
 * —una por proyecto en el riel, más la del proyecto abierto en el panel
 * principal— y las mismas tareas salen en dos de ellas. Con una señal por
 * instancia, plegar una tarea en el riel la dejaría desplegada en la vista del
 * proyecto hasta el siguiente arranque: dos listas de lo mismo diciendo cosas
 * distintas de la misma tarea. `chasis/Sidebar.tsx` no tiene ese problema
 * porque su lista de proyectos se pinta en un solo sitio.
 *
 * Se recuerda entre arranques: lo que alguien desplegó es lo que sí quiere ver,
 * y volver a abrirlo en cada arranque es trabajo que nadie pidió.
 */
const [desplegadas, setDesplegadas] = createPref<string[]>(
  "historial.subtareas.abiertas",
  [],
);

const alternarDesplegada = (id: string) =>
  setDesplegadas(
    desplegadas().includes(id)
      ? desplegadas().filter((x) => x !== id)
      : [...desplegadas(), id],
  );

export function createRama(props: SessionsProps, state: SessionsState, Fila: ReturnType<typeof createFila>) {
  const { expansionOverrides, setExpansionOverrides, temporaryExpansion } = state;
  /** Una raíz con su rama de encargos. La pintan las dos listas: activas y archivadas. */
  const Rama = (r: { rama: RamaDeTareas<SessionRow>; hija?: boolean; trasLasFijadas?: boolean }) => {
    const rama = () => r.rama;
    // Cuenta y estado del plegado: todo lo de debajo, a cualquier nivel.
    const escondidas = () => descendientes(rama());
    const expanded = () => expansionOverrides()[taskIdentity(rama().tarea)] ?? (temporaryExpansion().has(taskIdentity(rama().tarea)) || desplegadas().includes(rama().tarea.id));
    const toggle = () => {
      const id = taskIdentity(rama().tarea);
      if (temporaryExpansion().has(id) || expansionOverrides()[id] !== undefined) {
        setExpansionOverrides(previous => ({ ...previous, [id]: !expanded() }));
      } else alternarDesplegada(rama().tarea.id);
    };
    return (
      <li>
        <Show when={r.trasLasFijadas}>
          <span aria-hidden="true" data-pinned-divider class="mx-1.5 my-[5px] block h-px bg-border" />
        </Show>
        <Fila s={rama().tarea} />
        <Show when={rama().hijas.length > 0}>
          <Pressable
            class="mt-0.5 ml-2.5 flex w-[calc(100%-10px)] cursor-pointer items-center gap-1.5 rounded-sm border-0 bg-transparent px-1.5 py-0.5 text-left text-caption leading-[1.2] text-neutral-500 tabular-nums hover:bg-neutral-200 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
            aria-expanded={expanded()}
            aria-label={
              !expanded()
                ? t("projects.sessions.subtasks_expand", {
                    count: escondidas().length,
                    title: rama().tarea.title,
                  })
                : t("projects.sessions.subtasks_collapse", {
                    count: escondidas().length,
                    title: rama().tarea.title,
                  })
            }
            onClick={toggle}
          >
            <ChevronRight
              size={12}
              class={cn(
                "shrink-0 transition-transform",
                expanded() && "rotate-90",
              )}
            />
            {/* El estado de lo escondido va aquí, que es donde está lo
                escondido. El punto del padre sigue siendo suyo. */}
            <EstadoDeTarea
              ambito="plegadas"
              aprobando={escondidas().some((h) =>
                props.aprobando.includes(h.id),
              )}
              viva={escondidas().some((h) => props.vivas.includes(h.id))}
              esperando={escondidas().some((h) => h.esperando)}
              outcome={rolledOutcome(escondidas())}
              sinVer={escondidas().some((h) => h.sin_ver)}
            />
            {/* Sin repetirlo al lector de pantalla: el `aria-label` del
                botón ya dice cuántas son. */}
            <span aria-hidden="true">
              {t("projects.sessions.subtasks_count", {
                count: escondidas().length,
              })}
            </span>
          </Pressable>
        </Show>

        {/* La sangría con su hilo es la relación entera: encargos de
            la fila de arriba, sin rótulo que lo explique. */}
        <Show
          when={
            rama().hijas.length > 0 && expanded()
          }
        >
          <ul class="mt-0.5 ml-2.5 flex min-w-0 list-none flex-col gap-0.5 border-l border-border p-0 pl-1.5 [&>li]:min-w-0">
            <KeyedList each={rama().hijas} by={branch => taskIdentity(branch.tarea)}>{h => <Rama rama={h()} hija />}</KeyedList>
          </ul>
        </Show>
      </li>
    );
  };
  return Rama;
}

export function createAuthorGroups(props: SessionsProps, state: SessionsState, Rama: ReturnType<typeof createRama>) {
  const { profiles, fijada, tarjetaDelRiel } = state;
  const [collapsedAuthors, setCollapsedAuthors] = createPref<string[]>(`taskAuthors.collapsed.${props.de}`, []);
  const toggleAuthor = (key: string) => setCollapsedAuthors(collapsedAuthors().includes(key) ? collapsedAuthors().filter(item => item !== key) : [...collapsedAuthors(), key]);
  const authorLabel = (key: string) => key.startsWith("agent:")
    ? displayName(key.slice(6), profiles()[key.slice(6)])
    : key === "unassigned" ? t("projects.sessions.without_agent")
    : key === "agent" ? t("projects.sessions.launched_by_agent")
    : key === "user" ? t("projects.sessions.launched_by_you")
    : t("projects.sessions.launcher_unknown");
  const AuthorGroups = (groupProps: { branches: RamaDeTareas<SessionRow>[] }) => {
    const keys = createMemo(() => authorKeys(groupProps.branches.map((branch) => branch.tarea), props.groupByHandler));
    // El orden relativo viene del backend; solo las fijadas suben dentro de su agente.
    const ofAuthor = (key: string) => groupProps.branches.filter(branch => authorKey(branch.tarea, props.groupByHandler) === key)
      .sort((a, b) => Number(fijada(b.tarea)) - Number(fijada(a.tarea)));
    const ordenadas = createMemo(() => [...groupProps.branches].sort((a, b) => Number(fijada(b.tarea)) - Number(fijada(a.tarea))));
    // En el riel una línea fina separa las fijadas de las demás: va en la primera que no lo está.
    const trasLasFijadas = createMemo(() => {
      if (!props.sidebar) return null;
      const lista = ordenadas();
      const primera = lista.findIndex((branch) => !fijada(branch.tarea));
      return primera > 0 ? taskIdentity(lista[primera].tarea) : null;
    });
    return <Show when={props.groupByAuthor !== false} fallback={<ul class={cn("m-0 flex min-w-0 list-none flex-col p-0 [&>li]:min-w-0", tarjetaDelRiel() ? "gap-0.5" : "gap-2")}><KeyedList each={ordenadas()} by={branch => taskIdentity(branch.tarea)}>{branch => <Rama rama={branch()} trasLasFijadas={trasLasFijadas() === taskIdentity(branch().tarea)} />}</KeyedList></ul>}>
      <For each={keys()}>{key => <section data-task-author={key} aria-label={authorLabel(key)} class="flex min-w-0 flex-col gap-1">
      <div class="group/task-author flex items-center gap-1.5 px-2 pt-1 text-xs font-medium text-neutral-500">
        <Show
          when={key.startsWith("agent:")}
          fallback={
            <Pressable
              class="relative grid size-[18px] shrink-0 place-items-center rounded-sm focus-visible:outline-2 focus-visible:outline-primary"
              aria-expanded={!collapsedAuthors().includes(key)}
              aria-label={t(collapsedAuthors().includes(key) ? "shell.sidebar.expand_group" : "shell.sidebar.collapse_group", { name: authorLabel(key) })}
              onClick={() => toggleAuthor(key)}>
              <ChevronRight size={14} class={cn("transition-transform", !collapsedAuthors().includes(key) && "rotate-90")} />
            </Pressable>
          }
        >
          <Pressable class="group/author-icon relative grid size-[18px] shrink-0 place-items-center rounded-sm focus-visible:outline-2 focus-visible:outline-primary"
            aria-expanded={!collapsedAuthors().includes(key)}
            aria-label={t(collapsedAuthors().includes(key) ? "shell.sidebar.expand_group" : "shell.sidebar.collapse_group", { name: authorLabel(key) })}
            onClick={() => toggleAuthor(key)}>
            <span class="transition-opacity group-hover/task-author:opacity-0 group-focus-visible/author-icon:opacity-0"><AstroAvatar name={key.slice(6)} status="asleep" body={profiles()[key.slice(6)]?.body} avatar={profiles()[key.slice(6)]?.avatar} size={18} /></span>
            <ChevronRight size={14} class={cn("absolute opacity-0 transition-[opacity,transform] group-hover/task-author:opacity-100 group-focus-visible/author-icon:opacity-100", !collapsedAuthors().includes(key) && "rotate-90")} />
          </Pressable>
        </Show>
        <span class="min-w-0 truncate">{authorLabel(key)}</span>
      </div>
      {/* El hilo sangrado es de quién es la tarea, igual que el del proyecto
          dice de qué carpeta es: sin él, cabecera y tareas están al mismo
          nivel y el grupo no se ve dónde acaba. */}
      <ul hidden={collapsedAuthors().includes(key)} class="m-0 ml-2 flex min-w-0 list-none flex-col gap-2 border-l border-border p-0 pl-1.5 [&>li]:min-w-0">
        <KeyedList each={ofAuthor(key)} by={branch => taskIdentity(branch.tarea)}>{branch => <Rama rama={branch()} />}</KeyedList>
      </ul>
    </section>}</For>
    </Show>;
  };
  return AuthorGroups;
}
