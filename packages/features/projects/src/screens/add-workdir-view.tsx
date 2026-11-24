import { createProject } from "../queries";
import { Show } from "solid-js";
import { Button } from "../../../../ui/src/Button";
import { Dialog, DialogContent, DialogTitle } from "../../../../ui/src/Dialog";
import { FailureNote } from "../../../../ui/src/Failure";
import { Input } from "../../../../ui/src/Input";
import { ProgressBar } from "../../../../ui/src/ProgressBar";
import { enfocar } from "../../../../ui/src/lib/focus";
import { t } from "../../../../ui/src/lib/i18n";
import { capabilities } from "../../../../host/src/platform";
import { LazyPart, retryableLazy } from "../../../../ui/src/LazyPart";
import type { AnadirCarpetaProps } from "./add-workdir-model";
import { createAnadirCarpeta } from "./add-workdir-state";

const RepositoryPicker = retryableLazy(() => import("./RepositoryPicker"));

/**
 * Añadir una carpeta de trabajo: la que ya está en el disco, una clonada de un
 * repositorio, o una vacía.
 *
 * Los tres caminos existían y solo se ofrecía uno: el diálogo proponía una ruta
 * bajo Documentos y un botón de elegir. Quien trae un repositorio tenía que
 * clonarlo fuera y volver.
 */
export default function AnadirCarpeta(props: AnadirCarpetaProps) {
  const { escondido, alCambiar, trabajando, explorar, remota, elegirCamino, setProvider, setRepositoryName, chooseRepository, camino, clone, repositoryName, url, setUrl, destino, directorio, eligiendo, elegirDestino, fallo, provider, operation, phase, progress, cancelling, cancelClone, limpiar, terminar, nombre, setNombre, spaceAlli, enElegida } = createAnadirCarpeta(props);
  return (
    <Dialog open={props.abierto && !escondido()} onOpenChange={alCambiar}>
      <DialogContent class="max-w-[560px]">
        <DialogTitle class="m-0 text-lead font-semibold">
          {t("projects.add.title")}
        </DialogTitle>
        {capabilities().machineOnCreate?.(props.workspace)}

        <div class="grid gap-2 pt-3">
          <Show when={camino() === null}>
            <Show when={props.abierto ? props.workspace : null} keyed>{workspace =>
              <LazyPart fallback={<p role="status" class="m-0 text-xs text-neutral-500">{t("projects.add.loading_repositories")}</p>}>
                <RepositoryPicker workspace={workspace} disabled={trabajando()}
                  onUrl={() => { setProvider(null); setRepositoryName(""); void elegirCamino("clonar"); }}
                  onFolder={remota() ? undefined : () => void explorar()} onEmpty={() => void elegirCamino("vacia")}
                  onRepository={repo => void chooseRepository(repo)} />
              </LazyPart>
            }</Show>
          </Show>

          <Show when={camino() === "clonar"}>
            <form
              class="grid gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void clone();
              }}
            >
              <Show when={repositoryName()}><p class="m-0 text-ui font-medium">{repositoryName()}</p></Show>
              <label class="grid gap-1 text-ui">
                <span class="text-neutral-500">
                  {t("projects.add.clone_url")}
                </span>
                <Input
                  ref={enfocar}
                  class="font-mono text-xs"
                  placeholder="https://github.com/organizacion/repo"
                  value={url()}
                  disabled={trabajando()}
                  onInput={(e) => { setUrl(e.currentTarget.value); setProvider(null); setRepositoryName(""); }}
                />
              </label>
              <div class="grid gap-1">
                <span class="text-ui text-neutral-500">{t("projects.add.clone_directory")}</span>
                <p class="m-0 break-all font-mono text-xs">{destino() ?? directorio()}</p>
                <Show when={remota()}>{(m) => <p class="m-0 text-xs text-neutral-500">{t("projects.add.remote_directory", { name: props.machineName(m().machine) })}</p>}</Show>
                <Show when={!remota()}><Button
                  type="button"
                  variant="outline"
                  size="sm"
                  class="justify-self-start"
                  disabled={trabajando() || eligiendo()}
                  onClick={() => void elegirDestino()}
                >
                  {t("projects.add.change_directory")}
                </Button></Show>
              </div>
              <Show when={fallo()}>{(f) => <FailureNote f={f()} />}</Show>
              <Show when={fallo() && remota() && provider()}>
                <p class="m-0 text-xs text-neutral-500" data-git-host-hint="">{t("projects.add.remote_git_host", { name: props.machineName(remota()?.machine as string) })}</p>
              </Show>
              <Show when={operation()}>
                <div class="grid gap-2">
                  <p class="text-xs text-neutral-500" role="status">{phase()}</p>
                  <Show when={progress()?.percent != null}>
                    <ProgressBar value={progress()?.percent ?? 0} max={100} label={phase()} />
                    <span class="text-xs text-neutral-500">{t("projects.add.percent", { percent: progress()?.percent ?? 0 })}</span>
                  </Show>
                  <div class="flex justify-end gap-2">
                    <Button type="button" variant="ghost" size="sm" onClick={() => alCambiar(false)}>{t("projects.add.hide")}</Button>
                    <Button type="button" variant="outline" size="sm" disabled={!progress() || cancelling()} onClick={() => void cancelClone()}>
                      {cancelling() ? t("projects.add.cancelling") : t("projects.new.cancel")}
                    </Button>
                  </div>
                </div>
              </Show>
              <div class="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={trabajando()}
                  onClick={limpiar}
                >
                  {t("projects.add.back")}
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={!url().trim() || trabajando() || eligiendo()}
                >
                  {trabajando()
                    ? t("projects.add.cloning")
                    : t("projects.add.clone_do")}
                </Button>
              </div>
            </form>
          </Show>

          <Show when={camino() === "vacia"}>
            <form
              class="grid gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void terminar(
                  createProject({
                    name: nombre(), space: spaceAlli(), directory: remota() ? undefined : (destino() ?? undefined),
                  }, enElegida()),
                );
              }}
            >
              <label class="grid gap-1 text-ui">
                <span class="text-neutral-500">
                  {t("projects.add.empty_name")}
                </span>
                <Input
                  ref={enfocar}
                  placeholder={t("projects.new.placeholder")}
                  value={nombre()}
                  disabled={trabajando()}
                  onInput={(e) => setNombre(e.currentTarget.value)}
                />
              </label>
              <div class="grid gap-1">
                <span class="text-ui text-neutral-500">{t("projects.add.clone_directory")}</span>
                <p class="m-0 break-all font-mono text-xs">{destino() ?? directorio()}</p>
                <Show when={remota()}>{(m) => <p class="m-0 text-xs text-neutral-500">{t("projects.add.remote_directory", { name: props.machineName(m().machine) })}</p>}</Show>
                <Show when={!remota()}><Button
                  type="button"
                  variant="outline"
                  size="sm"
                  class="justify-self-start"
                  disabled={trabajando() || eligiendo()}
                  onClick={() => void elegirDestino()}
                >
                  {t("projects.add.change_directory")}
                </Button></Show>
              </div>
              <Show when={fallo()}>{(f) => <FailureNote f={f()} />}</Show>
              <div class="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={trabajando()}
                  onClick={limpiar}
                >
                  {t("projects.add.back")}
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={!nombre().trim() || trabajando()}
                >
                  {t("projects.add.create")}
                </Button>
              </div>
            </form>
          </Show>

          <Show when={camino() === null && fallo()}>
            {(f) => <FailureNote f={f()} />}
          </Show>
        </div>
      </DialogContent>
    </Dialog>
  );
}
