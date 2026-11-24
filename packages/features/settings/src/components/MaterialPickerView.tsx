import { For, Match, Show, Switch } from "solid-js";
import { addRepoUrl } from "../queries/engine-git";
import FolderOpen from "lucide-solid/icons/folder-open";
import GitBranch from "lucide-solid/icons/git-branch";
import Search from "lucide-solid/icons/search";
import { Button } from "../../../../ui/src/Button";
import { Input } from "../../../../ui/src/Input";
import { FailureNote } from "../../../../ui/src/Failure";
import { Skeleton } from "../../../../ui/src/Skeleton";
import { RETARDO_TOOLTIP, TooltipContent, TooltipRoot, TooltipTrigger } from "../../../../ui/src/Tooltip";
import { MarcaGitHost } from "../../../../ui/src/icons";
import { repoDe } from "../../../../ui/src/sources";
import { enfocar } from "../../../../ui/src/lib/focus";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { createSelectorDeMaterial } from "./MaterialPickerState";
import { createVistasDeMaterial } from "./MaterialPickerRepos";

export default function MaterialPicker(props: {
  /** Le llega el id de la fuente que quedó en el workspace. */
  onListo: (source: string) => Promise<void> | void;
  onCancelar: () => void;
  /**
   * `"clonar"` deja **solo** el campo de la dirección.
   *
   * **Es el mismo comando y el mismo formulario, no un camino aparte**
   * (`add_repo_url`): lo que cambia es que quien viene a clonar ya tiene el
   * enlace en el portapapeles y no necesita ver la carpeta local ni la
   * navegación por organizaciones. Duplicar el formulario para eso habría dado
   * dos sitios donde arreglar el mismo fallo.
   */
  modo?: "todo" | "clonar";
}) {
  const selector = createSelectorDeMaterial(props);
  const { traer, url, elegidas, setUrl, ocupado, verRamas, objetivoRamas, soloUrl, elegirCarpeta, setObjetivoRamas, ramas, buscaRama, setBuscaRama, ramasVisibles, setElegidas, proveedores, sinConectar, proveedor, area, areas, verAreas, fallo } = selector;
  const { Repos, Areas } = createVistasDeMaterial(selector);
  return (
    <div class="grid gap-2">
      {/* Pegar va arriba y siempre visible: es el camino más corto cuando ya se
          tiene el enlace, y esconderlo detrás de la navegación obligaría a
          recorrer organizaciones para no usarlas. */}
      <form
        class="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void traer(() =>
            addRepoUrl<{ id: string }>({
              cloneUrl: url(),
              branch: elegidas()[url()] || undefined,
            }),
          );
        }}
      >
        <Input
          class="min-h-8"
          value={url()}
          placeholder={t("settings.material.url_placeholder")}
          onInput={(e) => setUrl(e.currentTarget.value)}
        />
        <Show when={url().trim()}>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            class="max-w-40 shrink-0"
            disabled={ocupado()}
            onClick={() =>
              void verRamas({ cloneUrl: url(), name: repoDe(url()) ?? url() })
            }
            title={t("settings.material.pick_branch")}
          >
            <GitBranch size={14} />
            <span class="truncate">
              {elegidas()[url()] || t("settings.material.default_branch")}
            </span>
          </Button>
        </Show>
        <Button type="submit" size="sm" disabled={!url().trim() || ocupado()}>
          {ocupado() ? t("settings.material.fetching") : t("settings.material.fetch")}
        </Button>
      </form>

      <Show when={!objetivoRamas() && !soloUrl()}>
        <div class="grid gap-1">
          <span class="text-caption text-neutral-500">{t("settings.material.or")}</span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            class="justify-start"
            disabled={ocupado()}
            onClick={() => void elegirCarpeta()}
          >
            <FolderOpen size={15} />
            {t("settings.material.pick_folder")}
          </Button>
          <span class="text-caption text-neutral-500">
            {t("settings.material.or_account")}
          </span>
        </div>
      </Show>

      <Switch>
        {/* 1 · Eligiendo rama. Tapa todo lo demás: se vino a contestar una sola
               pregunta y volver. */}
        <Match when={objetivoRamas()}>
          {(objetivo) => (
            <div class="grid gap-1 rounded-md border border-border bg-surface-raised p-2">
              <div class="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  class="min-w-0 shrink flex-1 justify-start"
                  onClick={() => setObjetivoRamas(null)}
                >
                  <GitBranch size={14} />
                  <span class="truncate">{objetivo().name}</span>
                </Button>
              </div>
              <Show
                when={ramas()}
                fallback={
                  <>
                    <Skeleton class="h-8 w-full" />
                    <Skeleton class="h-8 w-full" />
                  </>
                }
              >
                {(rs) => (
                  <>
                    <div class="relative">
                      <Search
                        size={14}
                        class="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-neutral-500"
                      />
                      <Input
                        ref={enfocar}
                        class="min-h-8 pl-7"
                        value={buscaRama()}
                        placeholder={t("settings.material.search_branch")}
                        onInput={(e) => setBuscaRama(e.currentTarget.value)}
                      />
                    </div>
                    <Show
                      when={ramasVisibles()?.length}
                      fallback={
                        <p class="m-0 text-xs text-neutral-500">
                          {t("settings.material.no_branch")}
                        </p>
                      }
                    >
                      <ul class="m-0 grid max-h-[240px] list-none gap-0.5 overflow-y-auto p-0">
                        <For each={ramasVisibles() ?? []}>
                          {(branch) => (
                            <li>
                              <Button
                                variant="ghost"
                                size="sm"
                                class="w-full shrink justify-start font-mono"
                                onClick={() => {
                                  setElegidas((actuales) => ({
                                    ...actuales,
                                    [objetivo().cloneUrl]: branch,
                                  }));
                                  setObjetivoRamas(null);
                                }}
                              >
                                {branch}
                                <Show when={branch === rs().default}>
                                  <span class="ml-auto font-sans text-2xs text-neutral-500">
                                    {t("settings.material.is_default")}
                                  </span>
                                </Show>
                              </Button>
                            </li>
                          )}
                        </For>
                      </ul>
                    </Show>
                  </>
                )}
              </Show>
            </div>
          )}
        </Match>

        {/* 2 · Todavía no se sabe qué cuentas hay. */}
        <Match when={proveedores() === null}>
          <Skeleton class="h-8 w-full" />
        </Match>

        {/* 3 · Ninguna conectada. Las marcas en gris dicen qué HAY sin ocupar
               un párrafo, y el tooltip dice por qué están apagadas.

               **Sin `TooltipProvider`, que Kobalte no tiene**: el retardo va por
               instancia con `RETARDO_TOOLTIP`, que es el mismo número. Lo que se
               pierde es el reloj compartido — pasar de una marca a la otra vuelve
               a esperar (#137). */}
        <Match when={proveedores()?.length === 0}>
          <div class="flex gap-1.5" aria-label={t("settings.material.not_connected")}>
            <For each={sinConectar()}>
              {(p) => (
                <TooltipRoot openDelay={RETARDO_TOOLTIP}>
                  <TooltipTrigger
                    as={(disparador: object) => (
                      <span
                        {...disparador}
                        tabindex={0}
                        aria-label={t("settings.material.provider_off", {
                          name: p.name,
                        })}
                        class="grid size-8 cursor-help place-items-center rounded-sm bg-surface-muted text-neutral-500 opacity-50 grayscale"
                      >
                        <MarcaGitHost id={p.id} size={16} />
                      </span>
                    )}
                  />
                  <TooltipContent>
                    {t("settings.material.provider_off_tip", { name: p.name })}
                  </TooltipContent>
                </TooltipRoot>
              )}
            </For>
          </div>
        </Match>

        {/* 4 · Elegir proveedor. Solo cuando hay más de uno: con uno se entró
               directo a sus organizaciones. */}
        <Match
          when={
            !proveedor() ||
            ((proveedores()?.length ?? 0) > 1 && !area() && !areas())
          }
        >
          <div class="grid gap-1">
            <For each={proveedores() ?? []}>
              {(p) => (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void verAreas(p.id)}
                >
                  <MarcaGitHost id={p.id} size={15} />
                  {p.name}
                </Button>
              )}
            </For>
          </div>
        </Match>

        {/* 5 · Elegir organización. Con el logo y el nombre de la cuenta
               siempre a la vista: es lo que dice, sin ambigüedad, de qué
               proveedor son las organizaciones que siguen. */}
        <Match when={!area()}>
          <Areas />
        </Match>

        {/* 6 · La lista de repos de esa organización. Mismo header que arriba:
               es lo que hace que esta lista se lea «repos de GitHub» y no una
               lista sin dueño. */}
        <Match when={area()}>
          <Repos />
        </Match>
      </Switch>

      <Show when={fallo()}>{(f) => <FailureNote f={f()} />}</Show>

      <Button
        variant="ghost"
        size="sm"
        class="justify-self-start"
        onClick={props.onCancelar}
      >
        {t("settings.material.cancel")}
      </Button>
    </div>
  );
}
