import { DropdownMenu as Kobalte } from "@kobalte/core/dropdown-menu";
import { splitProps, type ComponentProps } from "solid-js";
import { cn } from "./lib/utils";
import { PANEL_DE_MENU, RENGLON_DE_MENU, SEPARADOR_DE_MENU, TITULO_DE_GRUPO } from "./ContextMenu";

/**
 * Menú que abre un botón, sobre `@kobalte/core` 0.13.13, con el panel y los
 * renglones de `ContextMenu.tsx`. Kobalte da el teclado —flecha abajo abre,
 * flechas recorren, Esc cierra y devuelve el foco al botón— y pone
 * `data-expanded` en el disparador abierto.
 */
export const DropdownMenu = Kobalte;
export const DropdownMenuTrigger = Kobalte.Trigger;
export const DropdownMenuGroup = Kobalte.Group;

export function DropdownMenuContent(props: ComponentProps<typeof Kobalte.Content>) {
  const [propios, resto] = splitProps(props, ["class"]);

  return (
    <Kobalte.Portal>
      <Kobalte.Content class={cn(PANEL_DE_MENU, propios.class)} {...resto} />
    </Kobalte.Portal>
  );
}

export function DropdownMenuItem(props: ComponentProps<typeof Kobalte.Item>) {
  const [propios, resto] = splitProps(props, ["class"]);
  return <Kobalte.Item class={cn(RENGLON_DE_MENU, propios.class)} {...resto} />;
}

export function DropdownMenuGroupLabel(props: ComponentProps<typeof Kobalte.GroupLabel>) {
  const [propios, resto] = splitProps(props, ["class"]);
  return (
    <Kobalte.GroupLabel class={cn(TITULO_DE_GRUPO, propios.class)} {...resto} />
  );
}

export function DropdownMenuSeparator(props: ComponentProps<typeof Kobalte.Separator>) {
  const [propios, resto] = splitProps(props, ["class"]);
  return <Kobalte.Separator class={cn(SEPARADOR_DE_MENU, propios.class)} {...resto} />;
}
