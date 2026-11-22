import { ContextMenu as Kobalte } from "@kobalte/core/context-menu";
import { splitProps, type ComponentProps } from "solid-js";
import { cn } from "../../../apps/desktop/src/lib/utils";

/**
 * Menú de clic derecho sobre `@kobalte/core` 0.13.13, con el portal y los tokens
 * de `Popover.tsx`. Kobalte da el teclado: flechas entre renglones, Esc cierra.
 * El renglón resaltado lleva `data-highlighted` y el deshabilitado `data-disabled`.
 */
export const ContextMenu = Kobalte;
export const ContextMenuTrigger = Kobalte.Trigger;
export const ContextMenuGroup = Kobalte.Group;

/** El panel flotante de un menú de Kobalte; lo comparte `DropdownMenu.tsx`. */
export const PANEL_DE_MENU =
  "z-[70] min-w-48 rounded-lg border border-border bg-surface-raised p-1 text-neutral-950 shadow-md outline-none";

export function ContextMenuContent(props: ComponentProps<typeof Kobalte.Content>) {
  const [propios, resto] = splitProps(props, ["class"]);

  return (
    <Kobalte.Portal>
      <Kobalte.Content
        class={cn(PANEL_DE_MENU, propios.class)}
        {...resto}
      />
    </Kobalte.Portal>
  );
}

/** El renglón de un menú de Kobalte; lo comparte `DropdownMenu.tsx`. */
export const RENGLON_DE_MENU =
  "block w-full cursor-default rounded-sm px-2 py-1.5 text-left text-ui text-neutral-950 outline-none data-[highlighted]:bg-surface-muted focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary data-[disabled]:pointer-events-none data-[disabled]:opacity-60";

export function ContextMenuItem(props: ComponentProps<typeof Kobalte.Item>) {
  const [propios, resto] = splitProps(props, ["class"]);

  return (
    <Kobalte.Item
      class={cn(RENGLON_DE_MENU, propios.class)}
      {...resto}
    />
  );
}

/** El título de un grupo de un menú de Kobalte; lo comparte `DropdownMenu.tsx`. */
export const TITULO_DE_GRUPO = "block truncate px-2 pt-1 pb-1 text-caption font-medium text-neutral-500";

export function ContextMenuGroupLabel(props: ComponentProps<typeof Kobalte.GroupLabel>) {
  const [propios, resto] = splitProps(props, ["class"]);
  return <Kobalte.GroupLabel class={cn(TITULO_DE_GRUPO, propios.class)} {...resto} />;
}

/** La raya entre grupos de un menú de Kobalte; la comparte `DropdownMenu.tsx`. */
export const SEPARADOR_DE_MENU = "my-1 h-px border-0 bg-border";

export function ContextMenuSeparator(props: ComponentProps<typeof Kobalte.Separator>) {
  const [propios, resto] = splitProps(props, ["class"]);
  return <Kobalte.Separator class={cn(SEPARADOR_DE_MENU, propios.class)} {...resto} />;
}
