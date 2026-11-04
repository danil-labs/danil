import Check from "lucide-solid/icons/check";
import { SignalDot } from "../../ui/SignalDot";
import ChevronDown from "lucide-solid/icons/chevron-down";
import Pencil from "lucide-solid/icons/pencil";
import Plus from "lucide-solid/icons/plus";
import Trash2 from "lucide-solid/icons/trash-2";
import { createSignal, For, Match, Show, Switch } from "solid-js";
import { t } from "../../lib/i18n";
import type { Project } from "../../lib/model";
import { type Space, spaceName } from "../../lib/spaces";
import { cn } from "../../lib/utils";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Input";
import { ITEM_DE_MENU, Popover, PopoverContent, PopoverTrigger } from "../../ui/Popover";
import type { AttentionState } from "./attention";
import { NewSpaceForm } from "./SpaceBar";
import { AttentionBadge } from "./WorkspaceColumn";

/** El tope de `spaces::NAME_MAX_CHARS`. */
const NOMBRE_MAX = 30;

type Modo = { kind: "list" } | { kind: "new" };

/** El espacio actual en la franja de la ventana; elegir, crear, renombrar y eliminar viven en su menú. */
export default function SpaceMenu(props: {
  workspace: string;
  spaces: Space[];
  activa: string | null;
  proyectos: Project[];
  senal: (id: string) => AttentionState | null;
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
            <For each={props.spaces}>
              {(space) => {
                const elegida = () => space.id === props.activa;
                const senal = () => (elegida() ? null : props.senal(space.id));
                return (
                  <button
                    type="button"
                    class={cn(ITEM_DE_MENU, "flex items-center gap-2")}
                    data-space={space.id}
                    aria-current={elegida() ? "true" : undefined}
                    onClick={() => {
                      setAbierto(false);
                      if (!elegida()) props.onElegir(space.id);
                    }}
                  >
                    <span class="grid w-3.5 shrink-0 text-neutral-950">
                      <Show when={elegida()}><Check size={14} aria-hidden="true" /></Show>
                    </span>
                    <span class="min-w-0 flex-1 truncate">{spaceName(space)}</span>
                    <Show when={senal()}>{(s) => <AttentionBadge state={s()} />}</Show>
                  </button>
                );
              }}
            </For>
            <div class="my-1 h-px bg-border" />
            <button type="button" class={cn(ITEM_DE_MENU, "flex items-center gap-2")} onClick={() => setModo({ kind: "new" })}>
              <Plus size={14} aria-hidden="true" class="shrink-0 text-neutral-500" />
              {t("spaces.new.title")}
            </button>
            <Show when={actual()}>
              {(space) => (
                <>
                  <button type="button" class={cn(ITEM_DE_MENU, "flex items-center gap-2")} onClick={() => renombrar(space())}>
                    <Pencil size={14} aria-hidden="true" class="shrink-0 text-neutral-500" />
                    {t("spaces.menu.rename")}
                  </button>
                  <Show when={props.spaces.length > 1}>
                    <button
                      type="button"
                      class={cn(ITEM_DE_MENU, "flex items-center gap-2 text-error-strong")}
                      onClick={() => {
                        setAbierto(false);
                        props.onEliminar(space().id);
                      }}
                    >
                      <Trash2 size={14} aria-hidden="true" class="shrink-0" />
                      {t("spaces.menu.delete")}
                    </button>
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
