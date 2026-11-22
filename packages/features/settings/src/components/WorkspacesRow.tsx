import { Show, createSignal, splitProps, type JSX } from "solid-js";
import { setWorkspaceWorktreesRoot } from "../queries/engine-workspaces";
import { open } from "@tauri-apps/plugin-dialog";
import Cloud from "lucide-solid/icons/cloud";
import Laptop from "lucide-solid/icons/laptop";
import { Button } from "../../../../ui/src/Button";
import { FailureNote, asFailure, type Failure } from "../../../../ui/src/Failure";
import { Pressable } from "../../../../ui/src/Pressable";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { cn } from "../../../../../apps/desktop/src/lib/utils";
import { type Workspace } from "../queries/workspaces-store";

// ------------------------------------------------ la fila de la lista

/**
 * Fila de lista con la gramática de selección de `styles/selection.css`
 * (`marca-seleccion`): plana en reposo, `surface-muted` al hover, y la
 * seleccionada levantada con superficie + sombra + barra de acento. La barra
 * existe por contraste: `surface-raised` sobre `surface` da 1,00:1 en claro y
 * ningún relleno del sistema llega al 3:1 de WCAG 2.2 § 1.4.11; la barra da
 * 6,07:1. La disposición —rejilla, padding— la pone quien la usa, vía `class`.
 */
/**
 * La plantilla `glifo | texto | meta` que usan casi todas las listas de dominio.
 * Un solo dueño: tocar aquí el gap mueve todas las listas a la vez. Una lista
 * con forma genuinamente distinta se queda con su propia `class`.
 */
export const NAV_LIST_ROW_TRIPLE_LAYOUT =
  "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-2.5 py-2";

export function navigationListRowClass(opciones: {
  interactive?: boolean;
  class?: string;
} = {}) {
  return cn(
    "marca-seleccion w-full rounded-md border-0 bg-transparent text-left transition-colors",
    opciones.interactive ?? true
      ? "cursor-pointer hover:bg-surface-muted"
      : "cursor-default",
    "aria-[current=true]:bg-surface-raised aria-[current=true]:shadow-sm",
    opciones.class,
  );
}

export type NavigationListRowProps =
  JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
    /** Pinta la fila como la selección actual. Pone `aria-current`. */
    selected?: boolean;
    /** `false` = fila de solo lectura: sin cursor ni superficie de hover. */
    interactive?: boolean;
  };

export function NavigationListRow(props: NavigationListRowProps) {
  const [propios, resto] = splitProps(props, [
    "selected",
    "interactive",
    "class",
    "type",
  ]);

  return (
    <Pressable
      type={propios.type ?? "button"}
      aria-current={propios.selected ? true : undefined}
      class={navigationListRowClass({
        interactive: propios.interactive,
        class: propios.class,
      })}
      {...resto}
    />
  );
}

/** De dónde sale el workspace: la máquina o un proveedor. */
export function GlifoDeWorkspace(props: { w: Workspace }) {
  return (
    <Show
      when={props.w.git_host}
      fallback={<Laptop size={15} class="shrink-0 text-neutral-500" />}
    >
      <Cloud size={15} class="shrink-0 text-neutral-500" />
    </Show>
  );
}

/**
 * Dónde nacen los árboles de las tareas nuevas de este workspace
 * (`workspaces::Workspace::worktrees_root`). Vacío es la carpeta de datos de la
 * app. Cambiarlo no mueve los árboles que ya existen.
 */
export function CarpetaDeCopias(props: { workspace: Workspace; onCambio: () => void }) {
  const [guardando, setGuardando] = createSignal(false);
  const [fallo, setFallo] = createSignal<Failure | null>(null);

  async function cambiar(restablecer: boolean) {
    setGuardando(true);
    setFallo(null);
    try {
      const root = restablecer
        ? null
        : await open({
            directory: true,
            multiple: false,
            defaultPath: props.workspace.worktrees_root ?? undefined,
            title: t("settings.workspaces.worktrees_root.title"),
          });
      if (!restablecer && typeof root !== "string") return;
      await setWorkspaceWorktreesRoot({ id: props.workspace.id, root });
      props.onCambio();
    } catch (e) {
      setFallo(asFailure(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div class="grid gap-1 pl-[27px] text-xs">
      <span class="text-neutral-500">{t("settings.workspaces.worktrees_root.title")}</span>
      <p class="m-0 break-all font-mono text-neutral-500">
        {props.workspace.worktrees_root ?? t("settings.workspaces.worktrees_root.default")}
      </p>
      <div class="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={guardando()}
          onClick={() => void cambiar(false)}
        >
          {t("settings.workspaces.worktrees_root.change")}
        </Button>
        <Show when={props.workspace.worktrees_root}>
          <Button
            size="sm"
            variant="ghost"
            disabled={guardando()}
            onClick={() => void cambiar(true)}
          >
            {t("settings.workspaces.worktrees_root.reset")}
          </Button>
        </Show>
      </div>
      <Show when={fallo()}>{(f) => <FailureNote f={f()} />}</Show>
    </div>
  );
}
