import {
  createSignal,
  createMemo,
  For,
  Show,
  type Component,
} from "solid-js";
import type { EngineClient } from "@danil/engine-client";
import type { Organization } from "../model.ts";
import {
  useOrganizations,
  useWorkspaces,
  useSelectWorkspace,
  openAddWorkspace,
} from "../queries.ts";
import { WorkspaceErrorView } from "../components/WorkspaceErrorView.tsx";

export interface WorkspacePickerModalProps {
  open: boolean;
  onClose: () => void;
  engineClient?: EngineClient | (() => EngineClient | undefined | null);
  activeWorkspaceId?: string | null;
  onSelectWorkspace?: (workspaceId: string) => void | Promise<void>;
}

/**
 * Modal rápido para buscar, conmutar y agregar workspaces.
 * Reemplaza el antiguo WorkspacePicker desacoplándolo de transportes manuales.
 * El botón «+ Agregar workspace» abre el flujo externo vía host.openExternal (RV1 #8, RV2 #20).
 */
export const WorkspacePickerModal: Component<WorkspacePickerModalProps> = (props) => {
  const [query, setQuery] = createSignal("");
  const [selectionError, setSelectionError] = createSignal<string | null>(null);

  const orgsQuery = useOrganizations();
  const workspacesQuery = useWorkspaces();
  const selectWorkspace = useSelectWorkspace();

  const activeId = () => props.activeWorkspaceId ?? null;

  const filteredWorkspaces = createMemo(() => {
    const list = workspacesQuery.workspaces() || [];
    const q = query().trim().toLowerCase();
    if (!q) return list;
    return list.filter((w) => (w.name || w.id).toLowerCase().includes(q));
  });

  const orgMap = createMemo(() => {
    const map = new Map<string, Organization>();
    for (const org of orgsQuery.organizations() || []) {
      map.set(org.id, org);
    }
    return map;
  });

  const handleSelect = async (wsId: string) => {
    setSelectionError(null);
    try {
      await selectWorkspace(wsId, {
        engineClient: props.engineClient,
      });
      await props.onSelectWorkspace?.(wsId);
      props.onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al cambiar workspace";
      setSelectionError(msg);
    }
  };

  const handleAddWorkspace = () => {
    openAddWorkspace();
    props.onClose();
  };

  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <div class="w-full max-w-md rounded-xl bg-zinc-900 border border-zinc-800 p-4 shadow-2xl text-zinc-100 flex flex-col gap-3">
          <div class="flex items-center justify-between pb-2 border-b border-zinc-800">
            <span class="text-xs font-semibold text-zinc-300">Seleccionar workspace</span>
            <button
              type="button"
              onClick={props.onClose}
              class="text-zinc-400 hover:text-white p-1 text-xs"
            >
              ✕
            </button>
          </div>

          <Show when={selectionError()}>
            <WorkspaceErrorView
              message={selectionError()!}
              onRetry={() => setSelectionError(null)}
            />
          </Show>

          <Show when={orgsQuery.error() || workspacesQuery.error()}>
            <WorkspaceErrorView
              message="Error al sincronizar con la plataforma."
              onRetry={() => {
                orgsQuery.refetch();
                workspacesQuery.refetch();
              }}
            />
          </Show>

          <input
            type="text"
            placeholder="Buscar workspace..."
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
            class="w-full px-3 py-2 rounded-lg bg-zinc-800/80 border border-zinc-700/60 text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-400"
          />

          <div class="max-h-64 overflow-y-auto flex flex-col gap-1 py-1">
            <For
              each={filteredWorkspaces()}
              fallback={
                <div class="py-6 text-center text-xs text-zinc-500">
                  No se encontraron workspaces
                </div>
              }
            >
              {(ws) => {
                const org = ws.org ? orgMap().get(ws.org) : undefined;
                const isSelected = activeId() === ws.id;

                return (
                  <button
                    type="button"
                    onClick={() => handleSelect(ws.id)}
                    class={`flex items-center justify-between p-2 rounded-lg text-left transition-colors ${
                      isSelected
                        ? "bg-zinc-800 text-white"
                        : "hover:bg-zinc-800/60 text-zinc-300"
                    }`}
                  >
                    <div class="flex items-center gap-2 min-w-0">
                      <span
                        class={`w-2 h-2 rounded-full shrink-0 ${
                          isSelected ? "bg-emerald-400" : "bg-zinc-600"
                        }`}
                      />
                      <span class="text-xs font-medium truncate">
                        {ws.name || ws.id}
                      </span>
                    </div>

                    <Show when={org}>
                      <span class="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/50">
                        {org!.planLabel}
                      </span>
                    </Show>
                  </button>
                );
              }}
            </For>
          </div>

          <div class="pt-2 border-t border-zinc-800 flex justify-between items-center">
            <button
              type="button"
              onClick={handleAddWorkspace}
              class="text-xs text-zinc-300 hover:text-white flex items-center gap-1 font-medium"
            >
              <span>+</span>
              <span>Agregar workspace</span>
            </button>
            <button
              type="button"
              onClick={props.onClose}
              class="px-2.5 py-1 text-xs rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
};
