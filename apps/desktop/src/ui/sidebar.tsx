import {
  Show,
  splitProps,
  type JSX,
  type ValidComponent,
} from "solid-js";
import { Dynamic } from "solid-js/web";
import { cn } from "../lib/utils";
import { RETARDO_TOOLTIP, TooltipContent, TooltipRoot, TooltipTrigger } from "./Tooltip";

type SidebarState = "expanded" | "collapsed";

/**
 * El riel de navegación.
 *
 * **No envuelve un `TooltipProvider`:** Kobalte no tiene provider y el retardo
 * va por instancia, así que `SidebarMenuButton` lo aplica con
 * `RETARDO_TOOLTIP`, que es el
 * mismo número que había.
 */
export function Sidebar(
  props: JSX.HTMLAttributes<HTMLElement> & { state?: SidebarState },
) {
  const [propios, resto] = splitProps(props, ["class", "state"]);

  return (
    <aside
      class={cn("grid grid-rows-[auto_minmax(0,1fr)_auto] min-w-0", propios.class)}
      data-state={propios.state ?? "expanded"}
      {...resto}
    />
  );
}

export function SidebarHeader(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const [propios, resto] = splitProps(props, ["class"]);
  return <div class={cn("p-3 min-w-0", propios.class)} {...resto} />;
}

export function SidebarContent(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const [propios, resto] = splitProps(props, ["class"]);
  return (
    <div
      class={cn(
        "flex flex-col min-h-0 min-w-0 overflow-hidden px-3 pb-3 gap-2",
        propios.class,
      )}
      {...resto}
    />
  );
}

export function SidebarMenu(props: JSX.HTMLAttributes<HTMLUListElement>) {
  const [propios, resto] = splitProps(props, ["class"]);
  return (
    <ul
      class={cn("grid gap-0 min-w-0 m-0 p-0 list-none", propios.class)}
      {...resto}
    />
  );
}

export function SidebarMenuItem(props: JSX.HTMLAttributes<HTMLLIElement>) {
  const [propios, resto] = splitProps(props, ["class"]);
  return <li class={cn("min-w-0", propios.class)} {...resto} />;
}

export type SidebarMenuButtonProps =
  JSX.ButtonHTMLAttributes<HTMLButtonElement> &
  /** Con `as="a"`, el enlace. */
  Pick<JSX.AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "target" | "rel"> & {
    type?: "button" | "submit" | "reset";
    /** Qué elemento renderiza. Sustituye al `asChild` de Radix. */
    as?: ValidComponent;
    isActive?: boolean;
    /** La marca vertical distingue la navegación principal; algunos rieles
     * compactos ya dejan claro el activo con su propia superficie. */
    selectionMark?: boolean;
    tooltip?: JSX.Element;
  };

export function SidebarMenuButton(props: SidebarMenuButtonProps) {
  const [propios, resto] = splitProps(props, [
    "as",
    "children",
    "class",
    "isActive",
    "selectionMark",
    "tooltip",
  ]);

  /**
   * **Es un componente y no un elemento, y la diferencia rompe el tooltip.**
   *
   * `as` recibe QUÉ renderizar, y el primitivo le pasa sus props dentro: el
   * `ref` con el que mide dónde ponerse, los manejadores que lo abren, y el
   * `aria-describedby` que lo anuncia. Un elemento ya creado —`as={() => boton}`—
   * los descarta todos.
   *
   * Aquí eso reventó con `useTooltipContext must be used within a Tooltip`, que
   * es suerte: la traducción literal de `asChild` normalmente se lleva las props
   * en silencio y deja un tooltip que nunca abre.
   */
  const Boton = (extra: Record<string, unknown> = {}) => (
    <Dynamic
      component={propios.as ?? "button"}
      class={cn(
        // Longhands: dejan que un riel colapsado sobreescriba el padding
        // horizontal de forma determinista a través de tailwind-merge.
        "relative grid h-[30px] min-h-[30px] w-full min-w-0 grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-0.5 rounded-sm border border-transparent bg-transparent py-0 pl-2 pr-2 text-left font-normal text-inherit text-ui leading-[1.25]",
        // **El relleno va por token.** Un navy crudo al 5 % no lleva variante
        // `dark:`, así que no participa de la inversión: en
        // el negro OLED da `#010102` sobre `#000000` — **1,00:1, medido en el
        // CSS compilado**. La fila abierta no estaba marcada; lo único que la
        // separaba de las demás era la negrita, o sea que había que leer la
        // lista para encontrar dónde estabas.
        //
        // `neutral-200` se separa del fondo en los dos temas (1,20:1 en claro,
        // 1,39:1 en oscuro). No llega a los 3:1 que pide WCAG 1.4.11 para
        // identificar un estado, y no puede: ningún escalón de superficie del
        // sistema llega. Eso lo lleva la barra de `marca-seleccion`.
        propios.selectionMark === false ? undefined : "marca-seleccion",
        "hover:bg-neutral-200",
        "data-[active=true]:bg-neutral-200 data-[active=true]:text-neutral-950 data-[active=true]:font-bold",
        "[&>span:not(.ui-sidebar-menu-badge)]:overflow-hidden [&>span:not(.ui-sidebar-menu-badge)]:text-ellipsis [&>span:not(.ui-sidebar-menu-badge)]:whitespace-nowrap",
        "[&_svg]:justify-self-center [&_svg]:shrink-0 [&_img]:justify-self-center [&_img]:shrink-0",
        propios.class,
      )}
      data-active={propios.isActive ? "true" : undefined}
      data-sidebar-tooltip={propios.tooltip ? "true" : undefined}
      {...resto}
      {...extra}
    >
      {propios.children}
    </Dynamic>
  );

  return (
    <Show when={propios.tooltip} fallback={<Boton />}>
      <TooltipRoot openDelay={RETARDO_TOOLTIP} placement="right">
        <TooltipTrigger {...resto} as={Boton} />
        <TooltipContent class="whitespace-nowrap">
          {propios.tooltip}
        </TooltipContent>
      </TooltipRoot>
    </Show>
  );
}
