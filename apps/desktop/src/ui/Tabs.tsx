import { Tabs as Kobalte } from "@kobalte/core/tabs";
import { splitProps, type ComponentProps } from "solid-js";
import { cn } from "../lib/utils";

/** Pestañas de página sobre `@kobalte/core`: flechas, foco y roles salen del primitivo. */
export const Tabs = Kobalte;
export const TabsContent = Kobalte.Content;

export function TabsList(props: ComponentProps<typeof Kobalte.List>) {
  const [propios, resto] = splitProps(props, ["class"]);
  return <Kobalte.List class={cn("flex items-end gap-5", propios.class)} {...resto} />;
}

export function TabsTrigger(props: ComponentProps<typeof Kobalte.Trigger>) {
  const [propios, resto] = splitProps(props, ["class"]);
  return (
    <Kobalte.Trigger
      class={cn(
        "-mb-px border-0 border-b-2 border-solid border-transparent bg-transparent px-0 pb-2 text-sm text-neutral-500 outline-none hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary data-[selected]:border-neutral-950 data-[selected]:font-semibold data-[selected]:text-neutral-950",
        propios.class,
      )}
      {...resto}
    />
  );
}
