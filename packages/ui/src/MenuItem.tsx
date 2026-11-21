// port: nuevo — ítem de menú compartido: unifica los >80 `<button class={ITEM_DE_MENU}>` crudos de apps/desktop (ui-inventory.md)
import { type JSX, splitProps } from "solid-js";
import { cn } from "./lib/utils.ts";
import { ITEM_DE_MENU } from "./Popover.tsx";

/** Una fila de menú o de popover: misma altura, radio y foco en todos los menús. Las clases extra (`flex gap-2`…) se suman. */
export function MenuItem(props: JSX.ButtonHTMLAttributes<HTMLButtonElement>) {
  const [propios, resto] = splitProps(props, ["class", "type"]);
  return <button type={propios.type ?? "button"} class={cn(ITEM_DE_MENU, propios.class)} {...resto} />;
}
