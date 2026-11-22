import { For, Show, createSignal, onMount } from "solid-js";
import { deleteProject, listProjects, renameProject } from "../queries/engine-workspaces";
import Trash2 from "lucide-solid/icons/trash-2";
import { Button } from "../../../../ui/src/Button";
import { Input } from "../../../../ui/src/Input";
import type { Project } from "../../../../../apps/desktop/src/lib/model";
import { PROJECT_NAME_MAX_LENGTH } from "../../../../../apps/desktop/src/lib/projectNames";
import { FailureNote, asFailure, type Failure } from "../../../../ui/src/Failure";
import { enfocar } from "../../../../../apps/desktop/src/lib/focus";
import { t } from "../../../../../apps/desktop/src/lib/i18n";

// ----------------------------------------------------------------- proyectos

/**
 * Los proyectos del workspace activo: renombrar y borrar.
 *
 * **Borrar un proyecto se lleva sus tareas y sus artefactos, y no se puede
 * deshacer.** Por eso el botón dice cuántas se lleva en vez de decir «Borrar»:
 * un proyecto con doce tareas y uno vacío se borran con el mismo gesto y no son
 * la misma consecuencia. Las fuentes adjuntas no se tocan — son del workspace y
 * pueden estar en otros proyectos.
 */
export function Proyectos(props: { onCambio: () => void }) {
  const [lista, setLista] = createSignal<Project[] | null>(null);
  const [editando, setEditando] = createSignal<string | null>(null);
  const [borrador, setBorrador] = createSignal("");
  const [porBorrar, setPorBorrar] = createSignal<string | null>(null);
  const [fallo, setFallo] = createSignal<Failure | null>(null);

  async function cargar() {
    try {
      setLista(await listProjects<Project[]>());
    } catch (e) {
      setFallo(asFailure(e));
    }
  }

  onMount(() => void cargar());

  async function hacer(fn: () => Promise<unknown>) {
    try {
      await fn();
      setEditando(null);
      setPorBorrar(null);
      await cargar();
      // El conteo de tareas del workspace se deriva del disco, así que borrar un
      // proyecto lo cambia.
      props.onCambio();
    } catch (e) {
      setFallo(asFailure(e));
    }
  }

  return (
    <Show when={lista()?.length}>
      <ul class="m-0 grid list-none gap-0.5 p-0 pl-[27px]">
        <For each={lista() ?? []}>
          {(p) => {
            const renombrar = () =>
              void hacer(() =>
                renameProject({ id: p.id, name: borrador() }),
              );

            return (
              <li class="flex items-center gap-1">
                <Show
                  when={editando() === p.id}
                  fallback={
                    <button
                      class="min-h-8 min-w-0 flex-1 truncate rounded-md px-1 py-1 text-left text-xs hover:bg-surface-muted"
                      onClick={() => {
                        setBorrador(p.name);
                        setEditando(p.id);
                        setPorBorrar(null);
                      }}
                    >
                      {p.name}
                    </button>
                  }
                >
                  <Input
                    ref={enfocar}
                    class="min-h-8 text-xs"
                    maxlength={PROJECT_NAME_MAX_LENGTH}
                    value={borrador()}
                    onInput={(e) => setBorrador(e.currentTarget.value)}
                    onBlur={renombrar}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") renombrar();
                      if (e.key === "Escape") setEditando(null);
                    }}
                  />
                </Show>
                <Show
                  when={porBorrar() === p.id}
                  fallback={
                    <Button
                      variant="ghost"
                      size="icon"
                      class="size-8 shrink-0 text-error-strong"
                      onClick={() => setPorBorrar(p.id)}
                      aria-label={t("settings.projects.delete", { name: p.name })}
                      title={t("settings.projects.delete_title")}
                    >
                      <Trash2 size={14} />
                    </Button>
                  }
                >
                  <Button
                    variant="danger"
                    size="sm"
                    class="shrink-0"
                    onClick={() =>
                      void hacer(() => deleteProject({ id: p.id }))
                    }
                  >
                    {p.sessions === 0
                      ? t("settings.projects.delete_now")
                      : t("settings.projects.delete_with", { count: p.sessions })}
                  </Button>
                </Show>
              </li>
            );
          }}
        </For>
        <Show when={fallo()}>{(f) => <FailureNote f={f()} />}</Show>
      </ul>
    </Show>
  );
}
