import { render } from "solid-js/web";
import { ITEM_DE_MENU, Popover, PopoverContent, PopoverTrigger } from "../../../../packages/ui/src/Popover";

/** Dos menús del riel en miniatura: uno de filas y otro que empieza con un buscador. */
export function mountMenus(root: HTMLElement) {
  return render(
    () => (
      <>
        <Popover placement="bottom-start">
          <PopoverTrigger data-trigger="rows">+</PopoverTrigger>
          <PopoverContent role="menu" data-panel="rows">
            <p>Hay workspaces nuevos para agregar</p>
            <button type="button" role="menuitem" class={ITEM_DE_MENU}>Agregar cuenta u organización</button>
            <button type="button" role="menuitem" class={ITEM_DE_MENU}>Otra opción</button>
          </PopoverContent>
        </Popover>
        <Popover placement="bottom-start">
          <PopoverTrigger data-trigger="search">Buscar</PopoverTrigger>
          <PopoverContent role="menu" data-panel="search">
            <input type="search" aria-label="Buscar" />
            <button type="button" role="menuitem" class={ITEM_DE_MENU}>Pruebas</button>
          </PopoverContent>
        </Popover>
      </>
    ),
    root,
  );
}
