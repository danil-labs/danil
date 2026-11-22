import GitBranch from "lucide-solid/icons/git-branch";
import { createSignal, For, Show } from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { listSourceBranches, setSourceBranch } from "../queries";
import type { Source } from "../../../../../apps/desktop/src/lib/model";
import { prosaDe } from "../../../../ui/src/Failure";
import { Popover, PopoverContent, PopoverTrigger } from "../../../../ui/src/Popover";
import { Pressable } from "../../../../ui/src/Pressable";

export function SelectorDeRama(props: { project: string; source: Source }) {
  const [abierto, setAbierto] = createSignal(false);
  const [ramas, setRamas] = createSignal<string[] | null>(null);
  const [actualizando, setActualizando] = createSignal(false);
  const [fallo, setFallo] = createSignal<string | null>(null);

  async function abrir() {
    setAbierto(true);
    setRamas(null);
    setFallo(null);
    try {
      setRamas(
        await listSourceBranches({
          source: props.source.id,
        }),
      );
    } catch (error) {
      setFallo(prosaDe(error));
    }
  }

  async function cambiar(branch: string) {
    if (branch === props.source.branch) return;
    setActualizando(true);
    setFallo(null);
    try {
      await setSourceBranch({
        project: props.project,
        source: props.source.id,
        branch,
      });
      setAbierto(false);
      window.dispatchEvent(new CustomEvent("harness:sources"));
    } catch (error) {
      setFallo(prosaDe(error));
    } finally {
      setActualizando(false);
    }
  }

  return (
    <Show when={props.source.branch}>
      {(branch) => (
        <Popover
          open={abierto()}
          onOpenChange={(open) => {
            if (open) return void abrir();
            setAbierto(false);
          }}
          placement="bottom-end"
          gutter={4}
        >
          <PopoverTrigger
            class="flex max-w-40 items-center gap-1 rounded-sm px-1.5 py-1 font-mono text-2xs text-neutral-500 outline-none hover:bg-surface-muted hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-wait disabled:opacity-60"
            disabled={actualizando()}
            aria-label={t("projects.view.source_branch_change", {
              name: props.source.name,
            })}
            title={t("projects.view.source_branch_change", {
              name: props.source.name,
            })}
          >
            <GitBranch size={12} aria-hidden="true" />
            <span class="truncate">
              {actualizando()
                ? t("projects.view.source_branch_updating")
                : branch()}
            </span>
          </PopoverTrigger>
          <PopoverContent class="w-72 p-2">
            <p class="m-0 px-1 pb-2 text-caption text-neutral-500">
              {t("projects.view.source_branch_shared")}
            </p>
            <Show
              when={ramas()}
              fallback={
                <p class="m-0 px-1 py-2 text-xs text-neutral-500">
                  {fallo() ?? t("projects.view.source_branch_loading")}
                </p>
              }
            >
              {(items) => (
                <ul class="m-0 grid max-h-56 list-none gap-0.5 overflow-y-auto p-0">
                  <For each={items()}>
                    {(item) => (
                      <li>
                        <Pressable
                          class="flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left font-mono text-caption hover:bg-surface-muted hover:text-neutral-950 disabled:cursor-default disabled:opacity-60"
                          disabled={item === props.source.branch || actualizando()}
                          onClick={() => void cambiar(item)}
                        >
                          <span class="min-w-0 flex-1 truncate">{item}</span>
                          <Show when={item === props.source.branch}>
                            <span class="font-sans text-2xs">
                              {t("projects.view.source_branch_current")}
                            </span>
                          </Show>
                        </Pressable>
                      </li>
                    )}
                  </For>
                </ul>
              )}
            </Show>
            <Show when={ramas() && fallo()}>
              {(error) => (
                <p class="m-0 border-t border-border px-1 pt-2 text-xs text-error-strong">
                  {error()}
                </p>
              )}
            </Show>
          </PopoverContent>
        </Popover>
      )}
    </Show>
  );
}
