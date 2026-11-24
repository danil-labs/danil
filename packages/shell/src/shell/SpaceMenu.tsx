import { SignalDot } from "../../../ui/src/SignalDot";
import ChevronDown from "lucide-solid/icons/chevron-down";
import Pencil from "lucide-solid/icons/pencil";
import Plus from "lucide-solid/icons/plus";
import Trash2 from "lucide-solid/icons/trash-2";
import { createSignal, Match, Show, Switch } from "solid-js";
import { t } from "../../../../apps/desktop/src/lib/i18n";
import type { Project } from "../../../../apps/desktop/src/lib/model";
import { type Space, spaceName } from "../../../../apps/desktop/src/lib/spaces";
import { cn } from "../../../ui/src/lib/utils";
import { Button } from "../../../ui/src/Button";
import { Input } from "../../../ui/src/Input";
import { ITEM_DE_MENU, Popover, PopoverContent, PopoverTrigger } from "../../../ui/src/Popover";
import type { AttentionState } from "./attention";
import { NewSpaceForm } from "./SpaceBar";
import { SpaceMenuList } from "./SpaceMenuList";
import { Pressable } from "../../../ui/src/Pressable";

/** El tope de `spaces::NAME_MAX_CHARS`. */
const NOMBRE_MAX = 30;

type Modo = { kind: "list" } | { kind: "new" };

/** El espacio actual en la franja de la ventana; elegir, crear, renombrar y eliminar viven en su menú. */
export default function SpaceMenu(props: {
  workspace: string;
  workspaceId?: string;
  spaces: Space[];
  activa: string | null;
  proyectos: Project[];
  senal: (id: string) => AttentionState | null;
  reordering?: boolean;
  onReorder?: (ids: string[]) => void;
  onElegir: (id: string) => void;
  onCrear: (name: string, folders: string[]) => Promise<void>;
  onRenombrar: (id: string, name: string) => Promise<void>;
  onEliminar: (id: string) => void;
}) {
  const [abierto, setAbierto] = createSignal(false);
  const [modo, setModo] = createSignal<Modo>({ kind: "list" });
  const [nombre, setNombre] = createSignal("");
  // Renombrar se hace sobre el mismo nombre de la franja, no en otra ventana.
  const [editando, setEditando] = createSignal<Space | null>(null);
  let creando = false;
  const actual = () => props.spaces.find((s) => s.id === props.activa) ?? props.spaces[0];
  // Lo que espera en otro espacio se avisa en el disparador: la lista está cerrada casi siempre.
  const esperaEnOtro = () => props.spaces.some((s) => s.id !== props.activa && props.senal(s.id));
  const abrir = (si: boolean) => {
    if (!si && creando) return;
    setAbierto(si);
    if (si) setModo({ kind: "list" });
  };
  const renombrar = (space: Space) => {
    setAbierto(false);
    setNombre(spaceName(space));
    setEditando(space);
  };
  const guardarNombre = () => {
    const space = editando();
    if (!space) return;
    const n = nombre().trim();
    setEditando(null);
    if (n && n !== spaceName(space)) void props.onRenombrar(space.id, n);
  };

  return (
    <Show
      when={editando()}
      fallback={
    <Popover open={abierto()} onOpenChange={abrir} placement="bottom-start" gutter={4}>
      <PopoverTrigger
        as={(p: object) => (
          <Button
            {...p}
            variant="chrome"
            size="compact"
            data-space-menu=""
            class="h-[30px] min-w-0 max-w-44 shrink gap-1.5 px-2 text-ui font-semibold"
            aria-label={t("spaces.bar.label", { workspace: props.workspace })}
            title={actual() ? spaceName(actual()!) : undefined}
            onDblClick={(e: MouseEvent) => {
              e.preventDefault();
              const space = actual();
              if (space) renombrar(space);
            }}
          >
            <span class="min-w-0 truncate">{actual() ? spaceName(actual()!) : t("spaces.default_name")}</span>
            <Show when={esperaEnOtro()}>
              <SignalDot tone="warning" />
            </Show>
            <ChevronDown size={13} aria-hidden="true" class="shrink-0 text-neutral-500" />
          </Button>
        )}
      />
      <PopoverContent class={cn("p-1", modo().kind === "new" ? "w-80 p-3" : "w-64")} data-space-list="">
        <Switch>
          <Match when={modo().kind === "new"}>
            <NewSpaceForm
              workspace={props.workspace}
              proyectos={props.proyectos}
              onCrear={props.onCrear}
              onBusy={(b) => (creando = b)}
              onClose={() => setAbierto(false)}
            />
          </Match>
          <Match when={modo().kind === "list"}>
            <p class="m-0 truncate px-2 pt-1 pb-1 text-caption font-medium text-neutral-500">
              {t("spaces.bar.label", { workspace: props.workspace })}
            </p>
            <SpaceMenuList
              workspaceKey={props.workspaceId ?? props.workspace}
              spaces={props.spaces}
              activa={props.activa}
              senal={props.senal}
              reordering={props.reordering}
              onReorder={props.onReorder}
              onSelect={(id) => {
                setAbierto(false);
                if (id !== props.activa) props.onElegir(id);
              }}
            />
            <div class="my-1 h-px bg-border" />
            <Pressable class={cn(ITEM_DE_MENU, "flex items-center gap-2")} onClick={() => setModo({ kind: "new" })}>
              <Plus size={14} aria-hidden="true" class="shrink-0 text-neutral-500" />
              {t("spaces.new.title")}
            </Pressable>
            <Show when={actual()}>
              {(space) => (
                <>
                  <Pressable class={cn(ITEM_DE_MENU, "flex items-center gap-2")} onClick={() => renombrar(space())}>
                    <Pencil size={14} aria-hidden="true" class="shrink-0 text-neutral-500" />
                    {t("spaces.menu.rename")}
                  </Pressable>
                  <Show when={props.spaces.length > 1}>
                    <Pressable
                      class={cn(ITEM_DE_MENU, "flex items-center gap-2 text-error-strong")}
                      onClick={() => {
                        setAbierto(false);
                        props.onEliminar(space().id);
                      }}
                    >
                      <Trash2 size={14} aria-hidden="true" class="shrink-0" />
                      {t("spaces.menu.delete")}
                    </Pressable>
                  </Show>
                </>
              )}
            </Show>
          </Match>
        </Switch>
      </PopoverContent>
    </Popover>
      }
    >
      {(space) => (
        <Input
          ref={(el: HTMLInputElement) => setTimeout(() => (el.focus(), el.select()), 0)}
          maxlength={NOMBRE_MAX}
          class="h-7 w-44 px-2 text-ui font-semibold"
          aria-label={t("spaces.rename.label", { name: spaceName(space()) })}
          value={nombre()}
          onInput={(e) => setNombre(e.currentTarget.value)}
          onBlur={guardarNombre}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              guardarNombre();
            } else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setEditando(null);
            }
          }}
        />
      )}
    </Show>
  );
}
