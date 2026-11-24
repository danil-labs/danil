import FolderOpen from "lucide-solid/icons/folder-open";
import Plus from "lucide-solid/icons/plus";
import X from "lucide-solid/icons/x";
import { For, Show } from "solid-js";
import { t } from "../../../../ui/src/lib/i18n";
import { Badge } from "../../../../ui/src/Badge";
import { Button } from "../../../../ui/src/Button";
import { EmptyState } from "../../../../ui/src/EmptyState";
import { Panel } from "../../../../ui/src/Panel";
import { ITEM_DE_MENU, Popover, PopoverContent, PopoverTrigger } from "../../../../ui/src/Popover";
import { Pressable } from "../../../../ui/src/Pressable";
import type { VistaDeProyecto, VistaDeProyectoProps } from "./project-view-state";
import { SelectorDeRama } from "./project-view-branch-picker";

export function createPanelDeFuentes(props: VistaDeProyectoProps, vista: VistaDeProyecto) {
  const { anadiendo, setAnadiendo, setTrayendo, trayendo, disponibles, distingueCuenta, cuenta, fijo, raiz, origen } = vista;

  function PanelDeFuentes() {
    return (
          <Panel
            title={t("projects.view.sources_title")}
            action={
              <Popover
                open={anadiendo()}
                onOpenChange={(abre) => {
                  setAnadiendo(abre);
                  if (!abre) setTrayendo(false);
                }}
                placement="bottom-end"
                gutter={6}
              >
                <PopoverTrigger
                  as={(p: object) => (
                    <Button {...p} variant="ghost" size="sm">
                      <Plus size={14} />
                      {t("projects.view.add")}
                    </Button>
                  )}
                />
                <PopoverContent class="w-[360px] p-2">
                  <Show
                    when={!trayendo()}
                    fallback={props.material({
                      onCancelar: () => setTrayendo(false),
                      onListo: (source: string) => {
                        setTrayendo(false);
                        setAnadiendo(false);
                        void props.onAdjuntar(source);
                        // El material entró al workspace: lo recarga todo lo
                        // que lo lee, no solo esta pantalla.
                        window.dispatchEvent(new CustomEvent("harness:sources"));
                      },
                    })}
                  >
                    {/* Lo que ya está en el workspace primero: adjuntarlo no
                        copia nada ni pide red, y es el caso normal cuando ya se
                        trabajó con ese material en otro proyecto. */}
                    <Show when={disponibles().length > 0}>
                      <div class="mb-1 grid max-h-56 gap-0.5 overflow-y-auto">
                        <For each={disponibles()}>
                          {(s) => (
                            <Pressable
                              class={`${ITEM_DE_MENU} grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2`}
                              onClick={() => {
                                setAnadiendo(false);
                                void props.onAdjuntar(s.id);
                              }}
                            >
                              <span class="truncate">{s.etiqueta}</span>
                              <Show when={distingueCuenta(s)}>
                                <Badge forma="dato" class="shrink-0">{cuenta(s)}</Badge>
                              </Show>
                              <span class="shrink-0 font-mono text-2xs text-neutral-500">
                                {s.kind === "git"
                                  ? t("projects.view.source_git")
                                  : t("projects.view.source_folder")}
                              </span>
                            </Pressable>
                          )}
                        </For>
                      </div>
                      <span class="my-1 block h-px bg-border" />
                    </Show>
                    <Button
                      variant="ghost"
                      size="sm"
                      class="w-full shrink justify-start"
                      onClick={() => setTrayendo(true)}
                    >
                      <FolderOpen size={12} />
                      {t("projects.view.bring_new")}
                    </Button>
                  </Show>
                </PopoverContent>
              </Popover>
            }
          >
            <p class="m-0 px-3 pb-2 text-xs text-neutral-500">
              {t("projects.view.sources_hint")}
            </p>
            <Show
              when={fijo().length > 0 || raiz()}
              fallback={
                <EmptyState class="mx-3 mb-3" title={t("projects.view.sources_empty")} />
              }
            >
              <ul class="m-0 list-none divide-y divide-border border-t border-border p-0">
                <Show when={raiz()}>
                  {(r) => (
                    <li class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-2">
                      <span class="min-w-0">
                        <span class="block truncate text-ui text-neutral-950">
                          {r().name}
                        </span>
                        <span
                          class="block truncate font-mono text-2xs text-neutral-500"
                          title={r().location}
                        >
                          {origen(r())}
                        </span>
                      </span>
                      {/* No lleva botón de quitar: es del workspace y la leen
                          todos los proyectos. */}
                      <span class="flex shrink-0 items-center gap-2">
                        <SelectorDeRama
                          project={props.proyecto.id}
                          source={r()}
                        />
                        <span class="text-caption text-neutral-500">
                          {t("projects.view.from_workspace")}
                        </span>
                      </span>
                    </li>
                  )}
                </Show>
                <For each={fijo()}>
                  {(s) => (
                    <li class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-2">
                      <span class="min-w-0">
                        <span class="block truncate text-ui text-neutral-950">
                          {s.name}
                        </span>
                        <span
                          class={`block truncate font-mono text-2xs ${
                            s.missing ? "text-error-strong" : "text-neutral-500"
                          }`}
                          title={s.location}
                        >
                          {s.missing
                            ? `${origen(s)} · ${t("projects.view.source_missing")}`
                            : origen(s)}
                        </span>
                      </span>
                      <span class="flex shrink-0 items-center gap-1">
                        <SelectorDeRama
                          project={props.proyecto.id}
                          source={s}
                        />
                        <Pressable
                          class="grid size-7 shrink-0 place-items-center rounded-sm text-neutral-500 outline-none hover:bg-surface-muted hover:text-error-strong focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                          aria-label={t("projects.view.remove_source_named", {
                            name: s.name,
                          })}
                          title={t("projects.view.remove_source")}
                          onClick={() => void props.onQuitar(s.id)}
                        >
                          <X size={14} />
                        </Pressable>
                      </span>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </Panel>
    );
  }

  return { PanelDeFuentes };
}
