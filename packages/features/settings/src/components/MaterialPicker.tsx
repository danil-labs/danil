import { For, Match, Show, Switch, createSignal, onMount } from "solid-js";
import { invoke } from "../../../../engine-client/src/client.ts";
import { open } from "@tauri-apps/plugin-dialog";
import ChevronLeft from "lucide-solid/icons/chevron-left";
import FolderOpen from "lucide-solid/icons/folder-open";
import GitBranch from "lucide-solid/icons/git-branch";
import Search from "lucide-solid/icons/search";
import { Button } from "../../../../ui/src/Button";
import { Input } from "../../../../ui/src/Input";
import { FailureNote, asFailure, type Failure } from "../../../../ui/src/Failure";
import { Skeleton } from "../../../../ui/src/Skeleton";
import {
  RETARDO_TOOLTIP,
  TooltipContent,
  TooltipRoot,
  TooltipTrigger,
} from "../../../../ui/src/Tooltip";
import { MarcaGitHost } from "../../../../ui/src/icons";
import { listGitHosts, type GitHost } from "../../../../../apps/desktop/src/lib/gitHosts";
import { repoDe } from "../../../../ui/src/sources";
import { enfocar } from "../../../../../apps/desktop/src/lib/focus";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { Badge } from "../../../../ui/src/Badge";

/**
 * Traer material al workspace desde **una carpeta local, una cuenta conectada
 * o una dirección de repositorio**.
 *
 * **Los tres orígenes viven en el mismo selector** porque son la misma intención
 * —«quiero que esta tarea lea esto»— con tres formas de llegar: partirlas en
 * selectores hermanos obliga a distinguir controles antes de poder elegir el
 * origen. Solo el adaptador git abre la elección de rama.
 *
 * El campo de pegar **acepta público y privado sin preguntar cuál es**, porque
 * quien pega no tiene por qué saberlo: el backend mira el host y usa el token si
 * hay conexión con ese proveedor (`context::add_repo_url`).
 *
 * **El buscador es un `Input` y una lista filtrada, no un `Command`.** El de
 * shadcn depende de `cmdk`, que no es dependencia del proyecto, y lo que aporta
 * son atajos de teclado sobre una lista que ya se navega con tabulador — la
 * misma cuenta que `ui/icons.tsx` ya hizo.
 *
 * **Los estados excluyentes son un `Switch`** y cada rama nombra su condición:
 * eligiendo rama, cargando proveedores, sin ninguno conectado, eligiendo
 * proveedor, eligiendo organización, o la lista de repos.
 */

type Proveedor = GitHost;
type Area = { key: string; name: string };
type RepoRemoto = {
  slug: string;
  name: string;
  clone_url: string;
  branch: string;
  /**
   * Si esta conexión puede escribir en el repositorio.
   *
   * **`null` es «no lo sé», no «no puedes».** No todos los proveedores lo
   * publican en el listado, y marcar como de solo lectura lo que no se sabe le
   * diría a alguien con escritura que no la tiene. Espeja
   * `git_hosts::RemoteRepo::can_push`.
   */
  can_push: boolean | null;
};
type RamasRemotas = { default: string; branches: string[] };
type ObjetivoRamas = {
  cloneUrl: string;
  provider?: string;
  defaultBranch?: string;
  name: string;
};

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
  const soloUrl = () => props.modo === "clonar";
  const [proveedores, setProveedores] = createSignal<Proveedor[] | null>(null);
  /** Todos los que el motor sabe conectar, para enseñarlos apagados cuando ninguno lo está. */
  const [sinConectar, setSinConectar] = createSignal<Proveedor[]>([]);
  const [proveedor, setProveedor] = createSignal<string | null>(null);
  const [areas, setAreas] = createSignal<Area[] | null>(null);
  const [area, setArea] = createSignal<string | null>(null);
  const [repos, setRepos] = createSignal<RepoRemoto[] | null>(null);
  const [busca, setBusca] = createSignal("");
  const [url, setUrl] = createSignal("");
  const [elegidas, setElegidas] = createSignal<Record<string, string>>({});
  const [objetivoRamas, setObjetivoRamas] = createSignal<ObjetivoRamas | null>(
    null,
  );
  const [ramas, setRamas] = createSignal<RamasRemotas | null>(null);
  const [buscaRama, setBuscaRama] = createSignal("");
  const [ocupado, setOcupado] = createSignal(false);
  const [fallo, setFallo] = createSignal<Failure | null>(null);

  /**
   * Una carpeta de esta computadora.
   *
   * **No se copia**, al revés que un repositorio clonado: `Source::tree()`
   * devuelve la ruta real que eligió la persona. Eso cambia lo que está en
   * juego si la contención se cae —ahí se tocan sus documentos originales, no
   * una copia de Terminus— y por eso el par `--add-dir` + `deny` sale de una
   * sola fuente de verdad en Rust.
   */
  async function elegirCarpeta() {
    setFallo(null);
    try {
      const ruta = await open({ directory: true, multiple: false });
      if (typeof ruta !== "string") return;
      await traer(() => invoke<{ id: string }>("add_folder", { locator: ruta }));
    } catch (e) {
      setFallo(asFailure(e));
    }
  }

  onMount(() => {
    void (async () => {
      try {
        const ps = await listGitHosts();
        setSinConectar(ps);
        // Solo los conectados: uno sin conexión no puede listar nada, y
        // ofrecerlo es un clic que acaba en un error que ya se sabía.
        const vivos = ps.filter((p) => p.connected);
        setProveedores(vivos);
        // Con uno solo no hay nada que elegir: se entra directo a sus
        // organizaciones. Un paso cuya única opción es la siguiente es un paso
        // de más.
        if (vivos.length === 1) void verAreas(vivos[0].id);
      } catch (e) {
        setProveedores([]);
        setFallo(asFailure(e));
      }
    })();
  });

  async function verAreas(id: string) {
    setProveedor(id);
    setAreas(null);
    setArea(null);
    setRepos(null);
    try {
      const as = await invoke<Area[]>("git_host_areas", { id });
      setAreas(as);
      if (as.length === 1) void verRepos(id, as[0].key);
    } catch (e) {
      setFallo(asFailure(e));
    }
  }

  async function verRepos(id: string, a: string) {
    setArea(a);
    setRepos(null);
    setBusca("");
    try {
      setRepos(await invoke<RepoRemoto[]>("git_host_projects", { id, area: a }));
    } catch (e) {
      setFallo(asFailure(e));
    }
  }

  const proveedorActual = () =>
    proveedores()?.find((p) => p.id === proveedor());

  function volverAProveedores() {
    setProveedor(null);
    setAreas(null);
    setArea(null);
    setRepos(null);
  }

  /** Solo hay a dónde volver si hubo más de una cuenta para elegir: con una
   *  sola, el paso de cuentas nunca se pintó. */
  const puedeVolverDesdeAreas = () => (proveedores()?.length ?? 0) > 1;

  /** Con una sola organización el paso de organizaciones tampoco se pintó
   *  (`verAreas` lo salta), así que volver desde repos va directo a cuentas. */
  const puedeVolverDesdeRepos = () =>
    (areas()?.length ?? 0) > 1 || (proveedores()?.length ?? 0) > 1;

  function volverDesdeRepos() {
    if ((areas()?.length ?? 0) > 1) {
      setArea(null);
      setRepos(null);
    } else {
      volverAProveedores();
    }
  }

  async function traer(fn: () => Promise<{ id: string }>) {
    setOcupado(true);
    setFallo(null);
    try {
      const s = await fn();
      await props.onListo(s.id);
    } catch (e) {
      setFallo(asFailure(e));
    } finally {
      setOcupado(false);
    }
  }

  async function verRamas(objetivo: ObjetivoRamas) {
    setObjetivoRamas(objetivo);
    setRamas(null);
    setBuscaRama("");
    setFallo(null);
    try {
      setRamas(
        await invoke<RamasRemotas>("repo_branches", {
          cloneUrl: objetivo.cloneUrl,
          gitHost: objetivo.provider,
          defaultBranch: objetivo.defaultBranch,
        }),
      );
    } catch (e) {
      setObjetivoRamas(null);
      setFallo(asFailure(e));
    }
  }

  /** Filtra por lo escrito, sin distinguir mayúsculas. Una lista de doscientos
   *  repos no se recorre a ojo, y el nombre es lo único que se recuerda. */
  const visibles = () => {
    const lista = repos();
    if (!lista) return null;
    const q = busca().trim().toLowerCase();
    if (!q) return lista;
    return lista.filter(
      (r) =>
        r.name.toLowerCase().includes(q) || r.slug.toLowerCase().includes(q),
    );
  };

  const ramasVisibles = () => {
    const rs = ramas();
    if (!rs) return null;
    const q = buscaRama().trim().toLowerCase();
    return q ? rs.branches.filter((b) => b.toLowerCase().includes(q)) : rs.branches;
  };

  const ramaDe = (repo: RepoRemoto) => elegidas()[repo.clone_url] ?? repo.branch;

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
            invoke<{ id: string }>("add_repo_url", {
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
        </Match>

        {/* 6 · La lista de repos de esa organización. Mismo header que arriba:
               es lo que hace que esta lista se lea «repos de GitHub» y no una
               lista sin dueño. */}
        <Match when={area()}>
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
                              invoke<{ id: string }>("attach_repo", {
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
