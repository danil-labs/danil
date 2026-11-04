import ChevronRight from "lucide-solid/icons/chevron-right";
import MoreVertical from "lucide-solid/icons/more-vertical";
import Plus from "lucide-solid/icons/plus";
import { createSignal, Show } from "solid-js";
import { destinoEnVuelo } from "../../lib/drag";
import { enfocarYSeleccionar } from "../../lib/focus";
import { t } from "../../lib/i18n";
import type { Project } from "../../lib/model";
import { PROJECT_NAME_MAX_LENGTH } from "../../lib/projectNames";
import { cn } from "../../lib/utils";
import { rolledOutcome } from "@terminus/design";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Input";
import { ITEM_DE_MENU, Popover, PopoverContent, PopoverTrigger } from "../../ui/Popover";
import { SidebarMenuButton } from "../../ui/sidebar";
import { FolderSquare } from "../projects/FolderChip";
import type { SessionRow } from "../projects/Sessions";
import EstadoDeTarea from "../projects/TaskStatus";

/** El rasgo que enciende la cabecera sobre la que se soltaría la tarea que va en la mano. */
const RECIBE_LA_TAREA = ["ring-2", "ring-primary"];

/**
 * La cabecera de un grupo por carpeta, también de una sin tareas; es además
 * el destino del arrastre y la puerta a lo que se hace
 * con la carpeta mientras eso no viva en Ajustes.
 */
export default function FolderGroupHeader(pp: {
  p: Project;
  dragFolder?: string | null;
  /**
   * El rótulo cuando la carpeta se parte por máquina («Terminus · vm-principal»);
   * sin él, el nombre de la carpeta. Renombrar y borrar siguen nombrando la carpeta.
   */
  rotulo?: string;
  /** La máquina del grupo partido; `""` es esta. */
  maquina?: string;
  abierto: boolean;
  tareas: SessionRow[];
  vivas: string[];
  aprobando: string[];
  /** Qué proyecto se está mirando en el panel principal, si alguno. */
  proyectoAbierto: string | null;
  onToggle: () => void;
  onAbrir: () => void;
  onRenombrar: (name: string) => Promise<void> | void;
  onBorrar: () => Promise<void> | void;
  /** Con más de un espacio, la carpeta sale del activo en vez de borrarse. */
  onQuitarDelEspacio?: () => void;
  onNuevaTarea: () => void;
  onNuevoAgente: () => void;
  /** «Llevar a otra máquina…»: con más de una máquina y una carpeta de git. */
  onLlevar?: () => void;
}) {
  const p = () => pp.p;
  const rotulo = () => pp.rotulo ?? p().name;
  const recibiendo = () => (pp.dragFolder ?? destinoEnVuelo()) === p().id;
  const [nombre, setNombre] = createSignal("");
  // El menú tiene dos vistas, las acciones o la confirmación de borrado, en
  // un solo Popover: uno anidado se cerraría con el primero.
  const [menu, setMenu] = createSignal(false);
  const [confirmando, setConfirmando] = createSignal(false);
  const [renombrando, setRenombrando] = createSignal(false);
  return (
    <div
      data-folder-group={p().id}
      data-folder-machine={pp.maquina}
      class={cn(
        "group grid min-w-0 grid-cols-[20px_minmax(0,1fr)_auto_auto] items-center rounded-sm",
        // Abierta, un respiro entre la cabecera y su primera tarea.
        pp.abierto && "mb-1",
        recibiendo() && RECIBE_LA_TAREA,
      )}
      data-destino={p().id}
    >
      <button
        class="relative grid size-5 place-items-center rounded-sm text-neutral-500 outline-none hover:bg-surface-muted hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        aria-expanded={pp.abierto}
        aria-label={
          pp.abierto
            ? t("shell.sidebar.collapse_group", { name: rotulo() })
            : t("shell.sidebar.expand_group", { name: rotulo() })
        }
        onClick={() => pp.onToggle()}
      >
        <span class="transition-opacity group-hover:opacity-0"><FolderSquare id={p().id} /></span>
        <ChevronRight size={14} class={cn("absolute opacity-0 transition-[opacity,transform] group-hover:opacity-100", pp.abierto && "rotate-90")} />
      </button>

      {/* Renombrar pasa dentro de la cabecera, con la misma altura y letra:
          lo único que cambia es que el texto se puede escribir. */}
      <Show
        when={renombrando()}
        fallback={
          <SidebarMenuButton
            data-folder-open=""
            class="h-[34px] min-h-[34px] grid-cols-[minmax(0,1fr)_auto] text-label font-semibold"
            isActive={pp.proyectoAbierto === p().id}
            selectionMark={false}
            onDblClick={() => { setNombre(p().name); setRenombrando(true); }}
            onKeyDown={(e) => { if (e.key === "F2") { e.preventDefault(); setNombre(p().name); setRenombrando(true); } }}
            onClick={() => pp.onAbrir()}
          >
            <span class="truncate">{rotulo()}</span>
            <Show when={!pp.abierto}>
              <EstadoDeTarea
                ambito="plegadas"
                aprobando={pp.tareas.some((x) => pp.aprobando.includes(x.id))}
                viva={pp.tareas.some((x) => pp.vivas.includes(x.id))}
                esperando={pp.tareas.some((x) => x.esperando)}
                outcome={rolledOutcome(pp.tareas.filter((x) => x.sin_ver))}
                sinVer={pp.tareas.some((x) => x.sin_ver)}
              />
            </Show>
          </SidebarMenuButton>
        }
      >
        <form
          class="grid h-[34px] min-w-0 grid-cols-[minmax(0,1fr)] items-center gap-0.5 rounded-sm bg-neutral-200 px-2 text-label font-semibold"
          onSubmit={(e) => {
            e.preventDefault();
            const n = nombre().trim();
            setRenombrando(false);
            if (n && n !== p().name)
              void pp.onRenombrar(n);
          }}
        >
          <Input
            ref={enfocarYSeleccionar}
            variant="ghost"
            class="block h-auto min-h-0 rounded-none border-0 p-0 font-sans text-label leading-[1.25] text-inherit [font-weight:inherit]"
            maxlength={PROJECT_NAME_MAX_LENGTH}
            value={nombre()}
            aria-label={t("shell.sidebar.rename_label", { name: p().name })}
            onInput={(e) => setNombre(e.currentTarget.value)}
            onBlur={() => setRenombrando(false)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setRenombrando(false);
            }}
          />
        </form>
      </Show>

      {/* Borrar vive dentro del menú, con su nombre escrito, y la
          confirmación se pinta en este mismo panel. */}
      <Popover
        open={menu()}
        onOpenChange={(abre) => {
          setMenu(abre);
          if (!abre) setConfirmando(false);
        }}
        placement="right-start"
        gutter={6}
      >
        {/* Sin `onClick` propio: pisaría el que abre el panel. Ver
            la cabecera de `Sessions.tsx`. */}
        <PopoverTrigger
          as={(disparador: object) => (
            <button
              {...disparador}
              class="mr-1 grid size-6 shrink-0 place-items-center rounded-sm text-neutral-500 opacity-0 outline-none hover:bg-surface-muted hover:text-neutral-950 focus-visible:opacity-100 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary group-hover:opacity-100 group-focus-within:opacity-100 data-[expanded]:opacity-100"
              aria-label={t("shell.sidebar.project_actions", { name: rotulo() })}
              aria-haspopup="menu"
              title={t("shell.sidebar.actions")}
            >
              <MoreVertical size={15} />
            </button>
          )}
        />
        {/* Un solo `PopoverContent` con dos vistas: cambiarlo por otro lo
            desmonta a mitad de una decisión que es irreversible. */}
        <PopoverContent
          role={confirmando() ? undefined : "menu"}
          class={confirmando() ? "w-80 p-3" : "w-56 p-1"}
        >
          <Show
            when={confirmando()}
            fallback={
              <>
                <button role="menuitem" class={ITEM_DE_MENU} onClick={() => {
                  setMenu(false);
                  pp.onNuevoAgente();
                }}>{t("projects.agents.new_open")}</button>
                <Show when={pp.onLlevar}>
                  {(llevar) => (
                    <button role="menuitem" class={ITEM_DE_MENU} data-carry-folder onClick={() => {
                      setMenu(false);
                      llevar()();
                    }}>{t("shell.machines.carry_to")}</button>
                  )}
                </Show>
                <button
                  role="menuitem"
                  class={ITEM_DE_MENU}
                  onClick={() => {
                    setMenu(false);
                    setNombre(p().name);
                    setRenombrando(true);
                  }}
                >
                  {t("shell.sidebar.rename")}
                </button>
                <Show
                  when={pp.onQuitarDelEspacio}
                  fallback={
                    <button
                      role="menuitem"
                      class={`${ITEM_DE_MENU} text-error-strong`}
                      onClick={() => setConfirmando(true)}
                    >
                      {t("shell.sidebar.delete_project")}
                    </button>
                  }
                >
                  {(quitar) => (
                    <button
                      role="menuitem"
                      class={ITEM_DE_MENU}
                      onClick={() => {
                        setMenu(false);
                        quitar()();
                      }}
                    >
                      {t("shell.sidebar.remove_from_space")}
                    </button>
                  )}
                </Show>
              </>
            }
          >
            <p class="m-0 text-sm font-semibold text-neutral-950">
              {t("shell.sidebar.delete_title", { name: p().name })}
            </p>
            <p class="mt-1 mb-3 text-xs leading-relaxed text-neutral-700">
              {p().sessions === 0
                ? t("shell.sidebar.delete_empty")
                : t("shell.sidebar.delete_with_tasks", {
                    count: p().sessions,
                  })}{" "}
              {t("shell.sidebar.delete_no_undo")}
            </p>
            <div class="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                class="shrink-0"
                onClick={() => setMenu(false)}
              >
                {t("shell.sidebar.keep")}
              </Button>
              <Button
                variant="danger"
                size="sm"
                class="shrink-0"
                onClick={() => {
                  setMenu(false);
                  void pp.onBorrar();
                }}
              >
                {t("shell.sidebar.delete_project")}
              </Button>
            </div>
          </Show>
        </PopoverContent>
      </Popover>

      <button
        class="mr-1 grid size-6 shrink-0 place-items-center rounded-sm text-neutral-500 opacity-0 outline-none hover:bg-surface-muted hover:text-neutral-950 focus-visible:opacity-100 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary group-hover:opacity-100 group-focus-within:opacity-100"
        aria-label={t("shell.sidebar.new_task_in", { name: rotulo() })}
        title={t("shell.sidebar.new_task_in", { name: rotulo() })}
        onClick={(e) => {
          e.stopPropagation();
          pp.onNuevaTarea();
        }}
      >
        <Plus size={15} />
      </button>
    </div>
  );
}
