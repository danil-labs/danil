import { For } from "solid-js";
import { cn } from "../../../../../apps/desktop/src/lib/utils";
import { SettingsRow } from "../../../../ui/src/SettingsLayout";

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
            <button
              type="button"
              role="radio"
              aria-checked={props.value === id}
              aria-label={label}
              title={label}
              /* Sin ellos la muestra se pinta con el tema de `<html>`. */
              data-theme={props.theme}
              data-dark-style={props.theme === "dark" ? id : undefined}
              data-light-style={props.theme === "light" ? id : undefined}
              class={cn(
                "grid w-[104px] gap-1.5 overflow-hidden rounded-md bg-bg p-1.5 text-left outline-offset-2 outline-primary focus-visible:outline-2 focus-visible:outline-solid",
                props.value === id ? "border-2 border-primary" : "border border-border-strong",
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
              <span class="truncate px-0.5 text-caption text-neutral-950">{label}</span>
            </button>
          )}
        </For>
      </div>
    </SettingsRow>
  );
}
