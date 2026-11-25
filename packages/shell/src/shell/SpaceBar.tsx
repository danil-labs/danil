import Plus from "lucide-solid/icons/plus";
import { createSignal, For, Show } from "solid-js";
import { enfocarYSeleccionar } from "../../../ui/src/lib/focus";
import { t } from "../../../ui/src/lib/i18n";
import { type Space, spaceName } from "../../../ui/src/lib/spaces";
import type { Project } from "../../../ui/src/lib/model";
import { cn } from "../../../ui/src/lib/utils";
import { createNavigationReorder } from "../../../ui/src/lib/navigation-order";
import { Button } from "../../../ui/src/Button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuGroupLabel,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "../../../ui/src/ContextMenu";
import { asFailure, type Failure, FailureNote } from "../../../ui/src/Failure";
import { KeyedList } from "../../../ui/src/KeyedList";
import { Input } from "../../../ui/src/Input";
import { Popover, PopoverContent, PopoverTrigger } from "../../../ui/src/Popover";
import type { AttentionState } from "./attention";
import { AttentionBadge } from "./WorkspaceColumn";
import { Pressable } from "../../../ui/src/Pressable";

/** El tope de `spaces::NAME_MAX_CHARS`. */
const NOMBRE_MAX = 30;

/**
 * Los escritorios del workspace, en la fila del título. La elegida no lleva
 * señal: sus tareas ya están en el riel. Las flechas mueven el foco entre
 * píldoras y Enter elige; cambiar de escritorio remonta la pestaña de delante,
 * y no se hace por pasar el foco. Renombrar es doble clic o F2; el clic derecho
 * (o Mayús+F10) abre el menú con renombrar y eliminar.
 */
export default function SpaceBar(props: {
  workspace: string;
  workspaceId: string;
  spaces: Space[];
  activa: string | null;
  proyectos: Project[];
  senal: (id: string) => AttentionState | null;
  onReorder: (ids: string[]) => void;
  reordering: boolean;
  onElegir: (id: string) => void;
  onCrear: (name: string, folders: string[]) => Promise<void>;
  onRenombrar: (id: string, name: string) => Promise<void>;
  onEliminar: (id: string) => void;
}) {
  const [menuDe, setMenuDe] = createSignal<string | null>(null);
  const [renombrando, setRenombrando] = createSignal<string | null>(null);
  const [nombre, setNombre] = createSignal("");
  let lista: HTMLDivElement | undefined;
  let renombrarAlCerrar = false;
  const orderedSpaces = () => props.spaces;
  const reorder = createNavigationReorder({
    scope: () => props.workspaceId,
    list: () => lista,
    attribute: "data-space-pill",
    axis: "x",
    ids: () => props.reordering ? [] : orderedSpaces().map(space => space.id),
    save: props.onReorder,
  });

  const empezarARenombrar = (i: Space) => {
    setNombre(spaceName(i));
    setRenombrando(i.id);
  };
  const terminarDeRenombrar = (i: Space) => {
    const n = nombre().trim();
    setRenombrando(null);
    if (n && n !== spaceName(i)) void props.onRenombrar(i.id, n);
    queueMicrotask(() => lista?.querySelector<HTMLElement>(`[data-space="${i.id}"]`)?.focus());
  };
  const abrirMenuDesdeTeclado = (tab: HTMLElement) => {
    const r = tab.getBoundingClientRect();
    tab.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.left, clientY: r.bottom }));
  };
  const moverFoco = (desde: HTMLElement, paso: number) => {
    const tabs = [...(lista?.querySelectorAll<HTMLElement>('[role="tab"]') ?? [])];
    const i = tabs.indexOf(desde);
    tabs[(i + paso + tabs.length) % tabs.length]?.focus();
  };

  return (
    <>
      <span aria-hidden="true" class="mr-2 ml-1.5 h-4 w-px shrink-0 bg-border-strong" />
      <div
        ref={lista}
        role="tablist"
        aria-label={t("spaces.bar.label", { workspace: props.workspace })}
        data-space-bar=""
        // Sin `overflow`: un menú de Kobalte abierto desde un contenedor con scroll
        // cuelga la página en WebKitGTK. Las que no caben encogen su nombre.
        class="flex min-w-0 items-center gap-0.5"
      >
        <KeyedList each={orderedSpaces()} by={space => space.id}>
          {(i) => {
            const elegida = () => i().id === props.activa;
            const unica = () => props.spaces.length === 1;
            const senal = () => (elegida() ? null : props.senal(i().id));
            return (
              <ContextMenu
                onOpenChange={(abierto) => setMenuDe(abierto ? i().id : null)}
              >
                <ContextMenuTrigger
                  data-space-pill={i().id}
                  data-selected={elegida() ? "true" : "false"}
                  disabled={renombrando() === i().id}
                  class={cn(
                    "group relative inline-flex h-6.5 min-w-0 items-center rounded-md border text-xs whitespace-nowrap select-none",
                    reorder.source() === i().id && "cursor-grabbing opacity-40",
                    elegida()
                      ? "shrink-0 border-border-strong bg-surface-raised font-semibold text-neutral-950 shadow-sm"
                      : "border-transparent font-medium text-neutral-500 hover:bg-neutral-200 hover:text-neutral-950",
                    menuDe() === i().id && !elegida() && "bg-neutral-200 text-neutral-950",
                  )}
                >
                  <Show when={reorder.edge(i().id)}>
                    {(edge) => <span aria-hidden="true" class={cn("pointer-events-none absolute top-0 bottom-0 w-0.5 bg-primary", edge() === "before" ? "-left-0.5" : "-right-0.5")} />}
                  </Show>
                  <Show
                    when={renombrando() === i().id}
                    fallback={
                      <Pressable
                        role="tab"
                        data-space={i().id}
                        aria-selected={elegida()}
                        aria-haspopup="menu"
                        tabIndex={elegida() ? 0 : -1}
                        title={spaceName(i())}
                        class="inline-flex h-full min-w-0 touch-none items-center gap-1.5 rounded-[inherit] px-2.5 outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                        onPointerDown={(e) => reorder.start(i().id, e)}
                        onClick={() => props.onElegir(i().id)}
                        // El primer clic elige la píldora y el segundo ya no hace
                        // nada: el doble clic renombra en el sitio, como el
                        // historial de tareas.
                        onDblClick={() => empezarARenombrar(i())}
                        onKeyDown={(e) => {
                          if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                            e.preventDefault();
                            moverFoco(e.currentTarget, e.key === "ArrowRight" ? 1 : -1);
                          } else if (e.key === "F2") {
                            e.preventDefault();
                            empezarARenombrar(i());
                          } else if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
                            // El menú es de clic derecho; desde el teclado se
                            // abre con las teclas de siempre, bajo la píldora.
                            e.preventDefault();
                            abrirMenuDesdeTeclado(e.currentTarget);
                          }
                        }}
                      >
                        <span class="max-w-40 truncate">{spaceName(i())}</span>
                        <Show when={senal()}>{(s) => <AttentionBadge state={s()} />}</Show>
                      </Pressable>
                    }
                  >
                    <Input
                      ref={enfocarYSeleccionar}
                      variant="ghost"
                      class="mx-2 h-auto min-h-0 w-38 rounded-none border-0 p-0 text-xs font-semibold text-neutral-950"
                      maxlength={NOMBRE_MAX}
                      value={nombre()}
                      aria-label={t("spaces.rename.label", { name: spaceName(i()) })}
                      onInput={(e) => setNombre(e.currentTarget.value)}
                      onBlur={() => setRenombrando(null)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          terminarDeRenombrar(i());
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          setRenombrando(null);
                        }
                      }}
                    />
                  </Show>
                </ContextMenuTrigger>
                <ContextMenuContent
                  class="w-60"
                  data-space-menu={i().id}
                  // El menú retiene el foco mientras está abierto: la caja de
                  // Renombrar se abre al cerrarse, y el foco ya no vuelve a la píldora.
                  onCloseAutoFocus={(e: Event) => {
                    if (!renombrarAlCerrar) return;
                    renombrarAlCerrar = false;
                    e.preventDefault();
                    empezarARenombrar(i());
                  }}
                >
                  <ContextMenuGroup>
                    <ContextMenuGroupLabel>{spaceName(i())}</ContextMenuGroupLabel>
                    <ContextMenuItem class="flex items-center justify-between gap-2" onSelect={() => (renombrarAlCerrar = true)}>
                      {t("spaces.menu.rename")}
                      <kbd class="font-sans text-caption text-neutral-500">F2</kbd>
                    </ContextMenuItem>
                  </ContextMenuGroup>
                  <ContextMenuSeparator />
                  <Show
                    when={unica()}
                    fallback={
                      <ContextMenuItem class="text-error-strong" onSelect={() => props.onEliminar(i().id)}>
                        {t("spaces.menu.delete")}
                      </ContextMenuItem>
                    }
                  >
                    <ContextMenuItem
                      class="text-neutral-500"
                      closeOnSelect={false}
                      aria-disabled="true"
                      aria-describedby={`por-que-no-${i().id}`}
                    >
                      {t("spaces.menu.delete")}
                    </ContextMenuItem>
                    <p id={`por-que-no-${i().id}`} class="m-0 max-w-56 px-2 pt-0.5 pb-1.5 text-caption leading-snug text-neutral-500">
                      {t("spaces.menu.delete_last")}
                    </p>
                  </Show>
                </ContextMenuContent>
              </ContextMenu>
            );
          }}
        </KeyedList>
      </div>
      <NewSpace workspace={props.workspace} proyectos={props.proyectos} onCrear={props.onCrear} />
    </>
  );
}

/** El «+»: nombre y, si se quieren, proyectos para agregar desde el principio. */
function NewSpace(props: {
  workspace: string;
  proyectos: Project[];
  onCrear: (name: string, folders: string[]) => Promise<void>;
}) {
  const [abierta, setAbierta] = createSignal(false);
  // Mientras crea no se cierra: el alta a medias quedaría sin aviso de fallo.
  let creando = false;
  return (
    <Popover open={abierta()} onOpenChange={(si) => (si || !creando) && setAbierta(si)} placement="bottom-start" gutter={4}>
      <PopoverTrigger
        data-new-space=""
        aria-label={t("spaces.new.title")}
        title={t("spaces.new.title")}
        class="ml-1 grid size-6 shrink-0 place-items-center rounded-md border border-dashed border-neutral-500 text-neutral-500 outline-none hover:bg-neutral-200 hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary data-[expanded]:bg-neutral-200 data-[expanded]:text-neutral-950"
      >
        <Plus size={14} aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent class="w-80 p-3" aria-label={t("spaces.new.title")}>
        <NewSpaceForm {...props} onBusy={(b) => (creando = b)} onClose={() => setAbierta(false)} />
      </PopoverContent>
    </Popover>
  );
}

/** El formulario del alta, sin su ventana: lo usan el «+» y el menú de espacios. */
export function NewSpaceForm(props: {
  workspace: string;
  proyectos: Project[];
  onCrear: (name: string, folders: string[]) => Promise<void>;
  onClose: () => void;
  onBusy?: (busy: boolean) => void;
}) {
  const [nombre, setNombre] = createSignal("");
  const [elegidas, setElegidas] = createSignal<string[]>([]);
  const [creando, setCreando] = createSignal(false);
  const [fallo, setFallo] = createSignal<Failure | null>(null);
  // Las últimas que se agregaron a Terminus, delante: lo reciente es lo que se
  // agrega. Solo diez, que son las que caben sin desplazar el resto del alta.
  const recientes = () => [...props.proyectos].reverse().slice(0, 10);
  const crear = async () => {
    const name = nombre().trim();
    if (!name || creando()) return;
    setCreando(true);
    props.onBusy?.(true);
    setFallo(null);
    try {
      await props.onCrear(name, elegidas());
      props.onClose();
    } catch (e) {
      setFallo(asFailure(e));
    } finally {
      setCreando(false);
      props.onBusy?.(false);
    }
  };
  return (
    <>
        <h3 class="m-0 mb-2 text-ui font-semibold">{t("spaces.new.title")}</h3>
        <form
          class="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void crear();
          }}
        >
          <label class="grid gap-1 text-label text-neutral-500">
            {t("spaces.new.name")}
            <Input
              ref={(el: HTMLInputElement) => setTimeout(() => el.focus(), 0)}
              maxlength={NOMBRE_MAX}
              placeholder={t("spaces.new.placeholder")}
              value={nombre()}
              disabled={creando()}
              onInput={(e) => setNombre(e.currentTarget.value)}
            />
          </label>
          <fieldset class="m-0 grid gap-1 border-0 p-0">
            <legend class="mb-1 p-0 text-label text-neutral-500">{t("spaces.new.folders")}</legend>
            <Show
              when={props.proyectos.length > 0}
              fallback={
                <p class="m-0 text-label text-neutral-500">
                  {t("spaces.new.no_folders", { workspace: props.workspace })}
                </p>
              }
            >
              <div class="grid max-h-36 gap-1 overflow-y-auto">
                <For each={recientes()}>
                  {(p) => (
                    <label class="flex min-w-0 items-center gap-2 text-ui">
                      <Input
                        variant="plain"
                        type="checkbox"
                        class="size-4 shrink-0 accent-primary"
                        checked={elegidas().includes(p.id)}
                        disabled={creando()}
                        onChange={(e) =>
                          setElegidas((xs) => (e.currentTarget.checked ? [...xs, p.id] : xs.filter((x) => x !== p.id)))
                        }
                      />
                      <span class="truncate">{p.name}</span>
                    </label>
                  )}
                </For>
              </div>
            </Show>
          </fieldset>
          <Show when={fallo()}>{(f) => <FailureNote f={f()} />}</Show>
          <div class="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" disabled={creando()} onClick={props.onClose}>
              {t("spaces.new.cancel")}
            </Button>
            <Button type="submit" size="sm" disabled={!nombre().trim() || creando()}>
              {t("spaces.new.create")}
            </Button>
          </div>
        </form>
    </>
  );
}
