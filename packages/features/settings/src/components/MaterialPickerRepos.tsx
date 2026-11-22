import { For, Match, Show, Switch } from "solid-js";
import { attachRepo } from "../queries/engine-git";
import ChevronLeft from "lucide-solid/icons/chevron-left";
import GitBranch from "lucide-solid/icons/git-branch";
import Search from "lucide-solid/icons/search";
import { Button } from "../../../../ui/src/Button";
import { Input } from "../../../../ui/src/Input";
import { Skeleton } from "../../../../ui/src/Skeleton";
import { MarcaGitHost } from "../../../../ui/src/icons";
import { enfocar } from "../../../../../apps/desktop/src/lib/focus";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { Badge } from "../../../../ui/src/Badge";
import type { createSelectorDeMaterial } from "./MaterialPickerState";

export function createVistasDeMaterial(selector: ReturnType<typeof createSelectorDeMaterial>) {
  const { proveedorActual, puedeVolverDesdeRepos, areas, volverDesdeRepos, busca, setBusca, visibles, ocupado, traer, proveedor, ramaDe, verRamas, puedeVolverDesdeAreas, volverAProveedores, verRepos } = selector;
  const Repos = () => (
    <div class="grid gap-1">
      <Show when={proveedorActual()}>
        {(p) => (
          <div class="flex items-center gap-1.5">
            <Show when={puedeVolverDesdeRepos()}>
              {/* La etiqueta nombra el destino real del clic: si hubo
                  más de una organización, vuelve a esa lista; si se
                  saltó por tener una sola, vuelve directo a las
                  cuentas. */}
              <button
                type="button"
                class="grid size-6 shrink-0 place-items-center rounded-sm text-neutral-500 outline-none hover:bg-surface-muted hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                aria-label={
                  (areas()?.length ?? 0) > 1
                    ? t("settings.material.back_to_areas")
                    : t("settings.material.back_to_accounts")
                }
                title={
                  (areas()?.length ?? 0) > 1
                    ? t("settings.material.back_to_areas")
                    : t("settings.material.back_to_accounts")
                }
                onClick={() => volverDesdeRepos()}
              >
                <ChevronLeft size={14} />
              </button>
            </Show>
            <MarcaGitHost id={p().id} size={14} />
            <span class="text-ui font-medium text-neutral-950">
              {p().name}
            </span>
          </div>
        )}
      </Show>
      <div class="relative">
        <Search
          size={14}
          class="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-neutral-500"
        />
        <Input
          ref={enfocar}
          class="min-h-8 pl-7"
          value={busca()}
          placeholder={t("settings.material.search_repo")}
          onInput={(e) => setBusca(e.currentTarget.value)}
        />
      </div>
      <Switch>
        <Match when={visibles() === null}>
          <Skeleton class="h-8 w-full" />
          <Skeleton class="h-8 w-full" />
        </Match>
        <Match when={visibles()?.length === 0}>
          <p class="m-0 text-xs text-neutral-500">{t("settings.material.no_repo")}</p>
        </Match>
        <Match when={visibles()}>
          {/* Con tope de alto: una organización con doscientos repos no
              puede empujar el resto de la pantalla fuera de la ventana. */}
          <ul class="m-0 grid max-h-[240px] list-none gap-0.5 overflow-y-auto p-0">
            <For each={visibles() ?? []}>
              {(r) => (
                <li class="flex min-w-0 gap-0.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    class="min-w-0 shrink flex-1 justify-start"
                    disabled={ocupado()}
                    onClick={() =>
                      void traer(() =>
                        attachRepo<{ id: string }>({
                          project: "",
                          gitHost: proveedor(),
                          cloneUrl: r.clone_url,
                          branch: ramaDe(r) || undefined,
                          name: r.name,
                        }),
                      )
                    }
                  >
                    <span class="truncate">{r.name}</span>
                    {/* **Solo cuando se sabe que NO se puede escribir.**
                        `null` es «el proveedor no lo dijo» y ahí no se
                        marca nada: una marca de solo lectura sobre algo
                        que no se sabe le diría a quien sí puede escribir
                        que no puede, y eso lo manda a pedir un permiso
                        que ya tiene.

                        Y se dice aquí, al elegir el material, porque el
                        sitio donde se descubría era el último: publicar,
                        después de hacer la tarea y aprobar el diff. */}
                    <Show when={r.can_push === false}>
                      <Badge
                        class="shrink-0"
                        title={t("settings.material.read_only_title")}
                      >
                        {t("settings.material.read_only")}
                      </Badge>
                    </Show>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    class="max-w-36 shrink-0 font-mono text-caption"
                    disabled={ocupado()}
                    title={t("settings.material.pick_branch_of", { name: r.name })}
                    aria-label={t("settings.material.pick_branch_of", {
                      name: r.name,
                    })}
                    onClick={() =>
                      void verRamas({
                        cloneUrl: r.clone_url,
                        provider: proveedor() ?? undefined,
                        defaultBranch: r.branch,
                        name: r.name,
                      })
                    }
                  >
                    <GitBranch size={13} />
                    <span class="truncate">
                      {ramaDe(r) || t("settings.material.default_branch")}
                    </span>
                  </Button>
                </li>
              )}
            </For>
          </ul>
        </Match>
      </Switch>
    </div>
  );
  const Areas = () => (
    <div class="grid gap-1">
      <Show when={proveedorActual()}>
        {(p) => (
          <div class="flex items-center gap-1.5">
            <Show when={puedeVolverDesdeAreas()}>
              <button
                type="button"
                class="grid size-6 shrink-0 place-items-center rounded-sm text-neutral-500 outline-none hover:bg-surface-muted hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                aria-label={t("settings.material.back_to_accounts")}
                title={t("settings.material.back_to_accounts")}
                onClick={() => volverAProveedores()}
              >
                <ChevronLeft size={14} />
              </button>
            </Show>
            <MarcaGitHost id={p().id} size={14} />
            <span class="text-ui font-medium text-neutral-950">
              {p().name}
            </span>
          </div>
        )}
      </Show>
      <Show when={areas()} fallback={<Skeleton class="h-8 w-full" />}>
        {(as) => (
          <div class="grid gap-1">
            <For each={as()}>
              {(a) => (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void verRepos(proveedor()!, a.key)}
                >
                  {a.name}
                </Button>
              )}
            </For>
          </div>
        )}
      </Show>
    </div>
  );
  return { Repos, Areas };
}
