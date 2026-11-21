import { createSignal, For, Show, type JSX } from "solid-js";
import { Server, User } from "@danil/ui";

export interface WorkspaceItem {
  id: string;
  name: string;
  active?: boolean;
}

export interface OrganizationItem {
  id: string;
  name: string;
  plan: string; // "Personal", "Team", "Enterprise"
  logoUrl?: string;
  workspaces: WorkspaceItem[];
}

export interface RailProps {
  organizations?: OrganizationItem[];
  activeWorkspaceId?: string;
  activeRoute?: string;
  onSelectWorkspace?: (workspaceId: string) => void;
  onSelectRoute?: (route: "machines" | "account" | string) => void;
  onAddWorkspace?: (organizationId?: string) => void;
  slots?: {
    top?: JSX.Element;
    stacks?: JSX.Element;
    bottom?: JSX.Element;
  };
}

/** Formatea el nombre de plan de cara al cliente. NUNCA la palabra «Organización» (B-008, B-009). */
export function formatPlanName(plan?: string): string {
  if (!plan) return "Personal";
  const p = plan.trim().toLowerCase();
  if (p === "personal" || p === "free") return "Personal";
  if (p === "team" || p === "teams") return "Team";
  if (p === "enterprise") return "Enterprise";
  if (p.includes("org")) return "Team";
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}

export function Rail(props: RailProps): JSX.Element {
  // Estado de stacks desplegados hacia abajo por cada organización (DS1 v2)
  const [expandedStacks, setExpandedStacks] = createSignal<Record<string, boolean>>({});

  const isExpanded = (id: string) => {
    const map = expandedStacks();
    return map[id] !== undefined ? map[id] : true; // Desplegado por defecto
  };

  const toggleStack = (id: string) => {
    setExpandedStacks((prev) => ({
      ...prev,
      [id]: !isExpanded(id),
    }));
  };

  const organizations = () => {
    if (props.organizations && props.organizations.length > 0) {
      return props.organizations;
    }
    // Elemento por defecto cuando no se pasan organizaciones por props
    return [
      {
        id: "default-org",
        name: "Personal",
        plan: "Personal",
        workspaces: [
          {
            id: "default-ws",
            name: "Workspace 1",
            active: props.activeWorkspaceId === "default-ws" || !props.activeWorkspaceId,
          },
        ],
      },
    ];
  };

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

      {/* Stacks por organización según DS1 v2 */}
      <div class="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-x-hidden overflow-y-auto py-1">
        {props.slots?.stacks ? (
          props.slots.stacks
        ) : (
          <For each={organizations()}>
            {(org) => {
              const planLabel = () => formatPlanName(org.plan);
              const expanded = () => isExpanded(org.id);

              return (
                <div role="group" data-rail-organization={org.id} class="flex w-full flex-col items-center gap-1">
                  {/* Cabecera del stack: Botón de la organización */}
                  <button
                    type="button"
                    title={`Plan ${planLabel()}`}
                    aria-label={`Plan ${planLabel()}`}
                    onClick={() => toggleStack(org.id)}
                    class="group relative grid size-10 w-full shrink-0 place-items-center outline-none select-none"
                  >
                    <span
                      aria-hidden="true"
                      class="danil-mark relative grid size-8 place-items-center rounded-md border border-border bg-surface text-label font-semibold text-neutral-700 hover:bg-neutral-200 hover:text-neutral-950 group-focus-visible:outline-solid group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-primary transition-colors"
                    >
                      <Show
                        when={org.logoUrl}
                        fallback={<span>{org.name.slice(0, 2).toUpperCase()}</span>}
                      >
                        <img
                          src={org.logoUrl}
                          alt={planLabel()}
                          class="size-6 rounded"
                        />
                      </Show>
                    </span>
                  </button>

                  {/* Workspaces de la organización desplegados hacia abajo */}
                  <Show when={expanded()}>
                    <div class="flex w-full flex-col items-center gap-1">
                      <For each={org.workspaces}>
                        {(ws) => {
                          const isActive = () =>
                            props.activeWorkspaceId === ws.id || ws.active === true;

                          return (
                            <button
                              type="button"
                              title={ws.name}
                              aria-label={ws.name}
                              onClick={() => props.onSelectWorkspace?.(ws.id)}
                              class="marca-seleccion group relative grid size-10 w-full shrink-0 place-items-center outline-none select-none"
                              aria-current={isActive() ? "true" : undefined}
                              data-workspace-tile={ws.id}
                            >
                              <span
                                aria-hidden="true"
                                class={`relative grid size-8 place-items-center rounded-md border text-label font-semibold transition-colors group-focus-visible:outline-solid group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-primary ${
                                  isActive()
                                    ? "border-border-strong bg-surface-raised text-neutral-950 shadow-sm"
                                    : "border-border bg-surface text-neutral-700 hover:bg-neutral-200 hover:text-neutral-950"
                                }`}
                              >
                                {ws.name.slice(0, 2).toUpperCase()}
                              </span>
                            </button>
                          );
                        }}
                      </For>

                      {/* Botón «+» con solo «Agregar workspace» */}
                      <button
                        type="button"
                        title="Agregar workspace"
                        aria-label="Agregar workspace"
                        onClick={() => props.onAddWorkspace?.(org.id)}
                        class="grid size-8 shrink-0 place-items-center rounded-md border border-dashed border-border text-neutral-500 outline-none hover:border-border-strong hover:bg-neutral-200 hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary transition-colors text-sm"
                      >
                        +
                      </button>
                    </div>
                  </Show>
                </div>
              );
            }}
          </For>
        )}
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
