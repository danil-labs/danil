import Check from "lucide-solid/icons/check";
import Copy from "lucide-solid/icons/copy";
import FolderOpen from "lucide-solid/icons/folder-open";
import { Show } from "solid-js";
import { t } from "../../../../ui/src/lib/i18n";
import { openExternal } from "../queries";
import { Button } from "../../../../ui/src/Button";
import { Input } from "../../../../ui/src/Input";
import { Panel } from "../../../../ui/src/Panel";
import WorkdirIcon from "../../../../ui/src/WorkdirIcon";
import BaseBranchPicker from "./BaseBranchPicker";
import type { VistaDeProyecto, VistaDeProyectoProps } from "./project-view-state";

const FILA = "grid grid-cols-[minmax(6rem,10.5rem)_minmax(0,1fr)] items-start gap-3 px-3 py-2";
const ETIQUETA = "py-1.5 text-xs text-neutral-500";

export function createPanelDeCarpeta(props: VistaDeProyectoProps, vista: VistaDeProyecto) {
  const { carpeta, copiarRuta, rutaCopiada, elegirCarpeta, idPreparacion, preparacion, setPreparacion, guardarPreparacion, falloDePreparacion } = vista;

  function PanelDeCarpeta() {
    return (
          <Panel title={t("projects.view.work_title")}>
            <dl class="m-0 divide-y divide-border border-t border-border">
              <div class={FILA}>
                <dt class={ETIQUETA}>{t("projects.view.work_path")}</dt>
                <dd class="m-0 grid min-w-0 gap-0.5">
                  <Show
                    when={carpeta()}
                    fallback={<span class="text-xs text-neutral-500">{t("projects.view.work_none")}</span>}
                  >
                    {(dir) => (
                      <span class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
                        <WorkdirIcon
                          kind={props.proyecto.kind} cloud={props.proyecto.cloud}
                          class="text-neutral-500"
                        />
                        <span class="min-w-0 truncate font-mono text-caption text-neutral-950" title={dir()}>
                          {dir()}
                        </span>
                        <span class="flex items-center gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            class="size-7 text-neutral-500"
                            onClick={() => void openExternal(dir()).catch(() => {})}
                            aria-label={t("shell.folder.open")}
                            title={t("shell.folder.open")}
                          >
                            <FolderOpen size={15} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            class="size-7 text-neutral-500"
                            onClick={() => copiarRuta(dir())}
                            aria-label={rutaCopiada() ? t("shell.folder.copied") : t("shell.folder.copy")}
                            title={rutaCopiada() ? t("shell.folder.copied") : t("shell.folder.copy")}
                          >
                            <Show when={rutaCopiada()} fallback={<Copy size={15} />}>
                              <Check size={15} />
                            </Show>
                          </Button>
                        </span>
                      </span>
                    )}
                  </Show>
                  <span class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                    <span class="text-xs text-neutral-500">
                      <Show when={carpeta()}>
                        {props.proyecto.kind === "git"
                          ? t("projects.view.work_git")
                          : t("projects.view.work_folder")}
                      </Show>
                    </span>
                    {/* Cambiarla mueve el `cwd` de toda tarea nueva: acción secundaria, sin icono ni peso de «Añadir». */}
                    <Button
                      variant="ghost"
                      size="compact"
                      class="font-normal text-neutral-500"
                      onClick={() => void elegirCarpeta()}
                    >
                      {t("projects.view.work_pick")}
                    </Button>
                  </span>
                </dd>
              </div>

              {/* Un árbol nuevo sale de `HEAD`: no trae `node_modules`, ni lo
                  construido, ni lo ignorado. Sin este comando el primer test del
                  agente falla por algo ajeno al encargo. */}
              <Show when={props.proyecto.kind === "git"}>
                <div class={FILA}>
                  <dt class={ETIQUETA}>{t("worktrees.base.default")}</dt>
                  <dd class="m-0 min-w-0">
                    <BaseBranchPicker project={props.proyecto.id} directory={carpeta()} preference inlineLabel />
                  </dd>
                </div>
                <div class={FILA}>
                  <dt class={ETIQUETA}>
                    <label for={idPreparacion}>{t("projects.view.setup_title")}</label>
                  </dt>
                  <dd class="m-0 grid min-w-0 gap-1 text-xs">
                    <Input
                      id={idPreparacion}
                      class="font-mono text-caption"
                      placeholder={t("projects.view.setup_placeholder")}
                      value={preparacion()}
                      onInput={(e) => setPreparacion(e.currentTarget.value)}
                      onBlur={() => void guardarPreparacion()}
                    />
                    <span class="text-neutral-500">
                      {t("projects.view.setup_help")}
                    </span>
                    <Show when={falloDePreparacion()}>
                      {(f) => <span class="text-error-strong">{f()}</span>}
                    </Show>
                  </dd>
                </div>
              </Show>
            </dl>
          </Panel>
    );
  }

  return { PanelDeCarpeta };
}
