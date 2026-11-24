import Check from "lucide-solid/icons/check";
import { For, Show } from "solid-js";
import { cn } from "../../../../ui/src/lib/utils";
import { SettingsRow } from "../../../../ui/src/SettingsLayout";
import { Pressable } from "../../../../ui/src/Pressable";

/** Las muestras de un estilo: cada una se pinta con su propio tema y estilo. */
export function StylePicker(props: {
  theme: "light" | "dark";
  title: string;
  description: string;
  options: { id: string; label: string }[];
  value: string;
  onPick: (id: string) => void;
}) {
  return (
    <SettingsRow label={props.title} description={props.description}>
      <div role="radiogroup" aria-label={props.title} class="flex gap-2">
        <For each={props.options}>
          {({ id, label }) => (
            <Pressable
              role="radio"
              aria-checked={props.value === id}
              aria-label={label}
              title={label}
              /* Sin ellos la muestra se pinta con el tema de `<html>`. */
              data-theme={props.theme}
              data-dark-style={props.theme === "dark" ? id : undefined}
              data-light-style={props.theme === "light" ? id : undefined}
              class={cn(
                "grid w-[104px] gap-1.5 overflow-hidden rounded-md border border-border bg-bg p-1.5 text-left outline-none transition-opacity focus:outline-none focus-visible:outline-none",
                props.value === id ? "opacity-100" : "opacity-80 hover:opacity-100",
              )}
              onClick={() => props.onPick(id)}
            >
              <span class="flex h-8 gap-1" aria-hidden="true">
                <span class="w-4 rounded-sm bg-rail" />
                <span class="flex flex-1 flex-col justify-end gap-1 rounded-sm bg-surface p-1">
                  <span class="h-1 w-3/4 rounded-full bg-neutral-500" />
                  <span class="flex items-center justify-between">
                    <span class="h-1 w-1/2 rounded-full bg-neutral-950" />
                    <span class="size-2 rounded-full bg-primary" />
                  </span>
                </span>
              </span>
              <span class="flex items-center justify-between gap-1 px-0.5 text-caption text-neutral-950">
                <span class={cn("truncate", props.value === id && "font-medium")}>{label}</span>
                <Show when={props.value === id}>
                  <Check size={12} class="shrink-0 text-neutral-950" aria-hidden="true" />
                </Show>
              </span>
            </Pressable>
          )}
        </For>
      </div>
    </SettingsRow>
  );
}
