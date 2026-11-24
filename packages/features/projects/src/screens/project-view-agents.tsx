import ChevronRight from "lucide-solid/icons/chevron-right";
import Eye from "lucide-solid/icons/eye";
import Plus from "lucide-solid/icons/plus";
import { For, Show } from "solid-js";
import { t } from "../../../../ui/src/lib/i18n";
import { Button } from "../../../../ui/src/Button";
import { EmptyState } from "../../../../ui/src/EmptyState";
import { Panel } from "../../../../ui/src/Panel";
import { AstroAvatar } from "./AstroAvatar";
import { displayName } from "../queries/profiles";
// Solo al crear un encargado: fuera de la carga inicial.
import { LazyPart, retryableLazy } from "../../../../ui/src/LazyPart";
import { SectionLabel } from "../../../../ui/src/SectionLabel";
import { Pressable } from "../../../../ui/src/Pressable";
import type { VistaDeProyecto, VistaDeProyectoProps } from "./project-view-state";
const NewAgent = retryableLazy(() => import("./NewAgent"));

export function createPanelDeAgentes(props: VistaDeProyectoProps, vista: VistaDeProyecto) {
  const { setCreando, creando, releerEncargados, visibles, estadoDe, perfiles, lectoresDistintos, ocultos, encargados, mostrar } = vista;

  function PanelDeAgentes() {
    return (
          <Panel
            title={t("projects.view.agents_title")}
            action={
              <Button size="sm" variant="ghost" onClick={() => setCreando(true)}>
                <Plus size={14} />
                {t("projects.agents.new_open")}
              </Button>
            }
          >
            <Show when={creando()}>
              <LazyPart>
                <NewAgent
                  abierto
                  onAbrir={setCreando}
                  project={props.proyecto.id}
                  modelos={props.modelos}
                  createFreeRouterConsent={props.createFreeRouterConsent}
                  onCreado={releerEncargados}
                />
              </LazyPart>
            </Show>
            <Show
              when={visibles().length > 0}
              fallback={
                <EmptyState class="mx-3 mb-3" title={t("projects.view.agents_empty")} />
              }
            >
              <ul class="m-0 list-none divide-y divide-border border-t border-border p-0">
                <For each={visibles()}>
                  {(uno) => {
                    const lectores = () => t("projects.view.agents_read_by", { agents: uno.providers.join(", ") });
                    return (
                      <li>
                        <Pressable
                          class="grid min-h-10 w-full grid-cols-[auto_minmax(0,7.5rem)_minmax(0,1fr)_auto_auto] items-center gap-x-2.5 bg-transparent px-3 py-1 text-left outline-none hover:bg-surface-muted focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
                          title={`${uno.description}\n${lectores()}`}
                          onClick={() => props.onHablarCon(uno.name)}
                        >
                          {/* La cara va aquí y no en un rótulo: sin ella, un agente se
                              lee como una fila de configuración. */}
                          <AstroAvatar
                            name={uno.name}
                            status={estadoDe(uno.name)}
                            body={perfiles()[uno.name]?.body}
                            avatar={perfiles()[uno.name]?.avatar}
                            size={24}
                          />
                          <span class="truncate font-mono text-xs text-neutral-950">
                            {uno.name}
                          </span>
                          <span class="truncate text-xs text-neutral-500">
                            {uno.description}
                          </span>
                          <span class="max-w-52 truncate text-2xs text-neutral-500">
                            <Show when={lectoresDistintos().has(uno.name)}>{lectores()}</Show>
                          </span>
                          <ChevronRight size={14} class="text-neutral-500" aria-hidden="true" />
                        </Pressable>
                      </li>
                    );
                  }}
                </For>
              </ul>
            </Show>
            <Show when={ocultos().length > 0 || encargados().rechazados.length > 0}>
              <div class="grid gap-2 border-t border-border px-3 py-2">
                {/* Los ocultos, aquí y en ningún otro sitio: es la lista completa
                    del proyecto, y el único camino de vuelta para uno del
                    repositorio al que se le quitó la fila del riel. */}
                <Show when={ocultos().length > 0}>
                  <SectionLabel as="h3">
                    {t("projects.view.agents_hidden")}
                  </SectionLabel>
                  <ul class="m-0 grid list-none gap-1 p-0">
                    <For each={ocultos()}>
                      {(uno) => (
                        <li class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-sm border border-border px-2 py-1">
                          <span class="overflow-hidden text-ellipsis whitespace-nowrap text-xs text-neutral-500">
                            {displayName(uno.name, perfiles()[uno.name])}
                          </span>
                          <Button size="compact" variant="ghost" onClick={() => void mostrar(uno.name)}>
                            <Eye size={13} />
                            {t("projects.view.agents_show")}
                          </Button>
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
                {/* Lo rechazado se pinta: una declaración que desapareciera en
                    silencio se diagnostica como que el proyecto no la tiene. */}
                <For each={encargados().rechazados}>
                  {(roto) => (
                    <p class="m-0 text-xs text-error-strong">
                      {t("projects.view.agents_broken", {
                        origin: roto.origin,
                        reason: roto.reason,
                      })}
                    </p>
                  )}
                </For>
              </div>
            </Show>
          </Panel>
    );
  }

  return { PanelDeAgentes };
}
