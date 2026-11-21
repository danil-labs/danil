import { createSignal, For, Show, type Component } from "solid-js";
import type { Workspace, Organization } from "../model.ts";
import { createWorkspace, type ClientResolverOptions } from "../queries.ts";

export interface CreateWorkspaceDialogProps extends ClientResolverOptions {
  open: boolean;
  onClose: () => void;
  organizations?: Organization[];
  defaultOrgId?: string;
  onCreated?: (workspace: Workspace) => void;
}

export const CreateWorkspaceDialog: Component<CreateWorkspaceDialogProps> = (props) => {
  const [name, setName] = createSignal("");
  const [selectedOrgId, setSelectedOrgId] = createSignal(props.defaultOrgId || "");
  const [submitting, setSubmitting] = createSignal(false);
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null);

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    const trimmed = name().trim();
    if (!trimmed) return;

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const orgId = selectedOrgId() || props.defaultOrgId || (props.organizations?.[0]?.id);
      const created = await createWorkspace(
        {
          name: trimmed,
          org: orgId,
        },
        props,
      );
      setName("");
      props.onCreated?.(created);
      props.onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al crear el workspace";
      setErrorMessage(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <div class="w-full max-w-sm rounded-xl bg-zinc-900 border border-zinc-800 p-5 shadow-2xl text-zinc-100 flex flex-col gap-4">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-semibold text-white">Agregar workspace</h3>
            <button
              type="button"
              onClick={props.onClose}
              class="text-zinc-400 hover:text-zinc-200 transition-colors p-1"
            >
              ✕
            </button>
          </div>

          <form onSubmit={handleSubmit} class="flex flex-col gap-4">
            <div class="flex flex-col gap-1.5">
              <label class="text-xs font-medium text-zinc-300">Nombre</label>
              <input
                type="text"
                required
                value={name()}
                onInput={(e) => setName(e.currentTarget.value)}
                placeholder="Nombre del workspace"
                class="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700/80 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-400"
              />
            </div>

            <Show when={(props.organizations?.length ?? 0) > 1}>
              <div class="flex flex-col gap-1.5">
                <label class="text-xs font-medium text-zinc-300">Plan</label>
                <select
                  value={selectedOrgId() || props.defaultOrgId || props.organizations?.[0]?.id}
                  onChange={(e) => setSelectedOrgId(e.currentTarget.value)}
                  class="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700/80 text-sm text-white focus:outline-none focus:ring-1 focus:ring-zinc-400"
                >
                  <For each={props.organizations}>
                    {(org) => (
                      <option value={org.id}>
                        {org.planLabel}
                      </option>
                    )}
                  </For>
                </select>
              </div>
            </Show>

            <Show when={errorMessage()}>
              <div class="p-2.5 rounded-lg bg-red-950/40 border border-red-800/60 text-red-300 text-xs">
                {errorMessage()}
              </div>
            </Show>

            <div class="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={props.onClose}
                disabled={submitting()}
                class="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting() || !name().trim()}
                class="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-white text-zinc-950 hover:bg-zinc-200 disabled:opacity-50 transition-colors flex items-center gap-1.5"
              >
                <Show when={submitting()}>
                  <span class="w-3 h-3 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
                </Show>
                <span>Agregar workspace</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </Show>
  );
};
