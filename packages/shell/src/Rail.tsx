import { createSignal, For, Show, type JSX } from "solid-js";

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
      aria-label="Navegación principal"
      style={{
        width: "64px",
        height: "100%",
        display: "flex",
        "flex-direction": "column",
        "align-items": "center",
        padding: "12px 0",
        background: "#12141a",
        "border-right": "1px solid #1f2128",
        "user-select": "none",
        "box-sizing": "border-box",
      }}
    >
      {/* Botón superior: Máquinas */}
      <div style={{ display: "flex", "flex-direction": "column", "align-items": "center", gap: "8px", width: "100%" }}>
        {props.slots?.top ? (
          props.slots.top
        ) : (
          <button
            type="button"
            title="Máquinas"
            aria-label="Máquinas"
            onClick={() => props.onSelectRoute?.("machines")}
            style={{
              width: "40px",
              height: "40px",
              "border-radius": "10px",
              display: "flex",
              "align-items": "center",
              "justify-content": "center",
              background: props.activeRoute === "machines" ? "#2a2d38" : "transparent",
              color: props.activeRoute === "machines" ? "#ffffff" : "#8b8f9e",
              border: "none",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            {/* Icono de máquina / computadoras */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
          </button>
        )}
      </div>

      <div
        style={{
          width: "32px",
          height: "1px",
          background: "#1f2128",
          margin: "12px 0",
        }}
      />

      {/* Stacks por organización según DS1 v2 */}
      <div
        style={{
          flex: "1",
          width: "100%",
          display: "flex",
          "flex-direction": "column",
          "align-items": "center",
          gap: "12px",
          "overflow-y": "auto",
        }}
      >
        {props.slots?.stacks ? (
          props.slots.stacks
        ) : (
          <For each={organizations()}>
            {(org) => {
              const planLabel = () => formatPlanName(org.plan);
              const expanded = () => isExpanded(org.id);

              return (
                <div
                  style={{
                    display: "flex",
                    "flex-direction": "column",
                    "align-items": "center",
                    width: "100%",
                    gap: "6px",
                  }}
                >
                  {/* Cabecera del stack: Logo de la organización que despliega hacia abajo */}
                  <button
                    type="button"
                    title={`Plan ${planLabel()}`}
                    aria-label={`Plan ${planLabel()}`}
                    onClick={() => toggleStack(org.id)}
                    style={{
                      width: "42px",
                      height: "42px",
                      "border-radius": "12px",
                      background: "#1c1e26",
                      border: "1px solid #282a36",
                      color: "#e2e4ed",
                      display: "flex",
                      "align-items": "center",
                      "justify-content": "center",
                      "font-weight": "600",
                      "font-size": "14px",
                      cursor: "pointer",
                      position: "relative",
                      transition: "transform 0.15s ease",
                    }}
                  >
                    <Show
                      when={org.logoUrl}
                      fallback={<span>{org.name.slice(0, 2).toUpperCase()}</span>}
                    >
                      <img
                        src={org.logoUrl}
                        alt={planLabel()}
                        style={{ width: "24px", height: "24px", "border-radius": "6px" }}
                      />
                    </Show>

                    {/* Indicador sutil de despliegue */}
                    <span
                      style={{
                        position: "absolute",
                        bottom: "2px",
                        right: "4px",
                        "font-size": "8px",
                        color: "#6b7082",
                        transform: expanded() ? "rotate(0deg)" : "rotate(-90deg)",
                        transition: "transform 0.15s ease",
                      }}
                    >
                      ▼
                    </span>
                  </button>

                  {/* Workspaces de la organización desplegados hacia abajo */}
                  <Show when={expanded()}>
                    <div
                      style={{
                        display: "flex",
                        "flex-direction": "column",
                        "align-items": "center",
                        gap: "6px",
                        width: "100%",
                        padding: "2px 0",
                      }}
                    >
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
                              style={{
                                width: "34px",
                                height: "34px",
                                "border-radius": "8px",
                                background: isActive() ? "#2f68f6" : "#181a22",
                                color: isActive() ? "#ffffff" : "#a1a5b5",
                                border: isActive() ? "1px solid #4a7ef9" : "1px solid #232530",
                                display: "flex",
                                "align-items": "center",
                                "justify-content": "center",
                                "font-size": "12px",
                                "font-weight": "500",
                                cursor: "pointer",
                                transition: "all 0.15s ease",
                              }}
                            >
                              {ws.name.slice(0, 2).toUpperCase()}
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
                        style={{
                          width: "30px",
                          height: "30px",
                          "border-radius": "8px",
                          background: "transparent",
                          color: "#6b7082",
                          border: "1px dashed #2a2d38",
                          display: "flex",
                          "align-items": "center",
                          "justify-content": "center",
                          "font-size": "16px",
                          cursor: "pointer",
                          transition: "all 0.15s ease",
                        }}
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
      <div style={{ display: "flex", "flex-direction": "column", "align-items": "center", gap: "8px", width: "100%" }}>
        {props.slots?.bottom ? (
          props.slots.bottom
        ) : (
          <button
            type="button"
            title="Cuenta"
            aria-label="Cuenta"
            onClick={() => props.onSelectRoute?.("account")}
            style={{
              width: "40px",
              height: "40px",
              "border-radius": "10px",
              display: "flex",
              "align-items": "center",
              "justify-content": "center",
              background: props.activeRoute === "account" ? "#2a2d38" : "transparent",
              color: props.activeRoute === "account" ? "#ffffff" : "#8b8f9e",
              border: "none",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            {/* Icono de usuario / cuenta */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </button>
        )}
      </div>
    </nav>
  );
}
