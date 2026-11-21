import type { JSX } from "solid-js";
import { Server, User } from "@danil/ui";

export interface RailProps {
  activeRoute?: string;
  onSelectRoute?: (route: "machines" | "account" | string) => void;
  slots?: {
    top?: JSX.Element;
    stacks?: JSX.Element;
    bottom?: JSX.Element;
  };
}

/**
 * Rail: marco de navegación lateral con slots.
 * Los stacks y grupos de workspaces son responsabilidad de RailGroups (RV1 #7, RV2 #25).
 * Sin datos inventados ni duplicación de tipos de recurso.
 */
export function Rail(props: RailProps): JSX.Element {
  return (
    <nav
      aria-label="Espacios de trabajo"
      data-workspace-column=""
      class="flex h-full w-12 shrink-0 flex-col border-r border-border bg-surface select-none"
    >
      {/* Botón superior: Máquinas */}
      <div class="flex w-full flex-col items-center gap-1 pt-2">
        {props.slots?.top ? (
          props.slots.top
        ) : (
          <button
            type="button"
            title="Máquinas"
            aria-label="Máquinas"
            onClick={() => props.onSelectRoute?.("machines")}
            class={`grid size-8 shrink-0 place-items-center rounded-md text-neutral-500 outline-none transition-colors hover:bg-neutral-200 hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
              props.activeRoute === "machines"
                ? "border border-border-strong bg-surface-raised font-semibold text-neutral-950 shadow-sm"
                : ""
            }`}
          >
            <Server size={17} aria-hidden="true" />
          </button>
        )}
      </div>

      <span aria-hidden="true" class="my-1.5 h-px w-6 shrink-0 bg-border-strong self-center" />

      {/* Stacks por organización según DS1 v2 (provisto por RailGroups) */}
      <div class="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-x-hidden overflow-y-auto py-1">
        {props.slots?.stacks}
      </div>

      {/* Botón inferior: Cuenta */}
      <div class="flex shrink-0 flex-col items-center gap-1 pt-1 pb-2" data-workspace-column-foot="">
        {props.slots?.bottom ? (
          props.slots.bottom
        ) : (
          <button
            type="button"
            title="Cuenta"
            aria-label="Cuenta"
            onClick={() => props.onSelectRoute?.("account")}
            class={`grid size-8 shrink-0 place-items-center rounded-md text-neutral-500 outline-none transition-colors hover:bg-neutral-200 hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
              props.activeRoute === "account"
                ? "border border-border-strong bg-surface-raised font-semibold text-neutral-950 shadow-sm"
                : ""
            }`}
          >
            <User size={17} aria-hidden="true" />
          </button>
        )}
      </div>
    </nav>
  );
}
