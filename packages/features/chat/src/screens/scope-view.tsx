import { For, Match, Show, Switch } from "solid-js";
import { t } from "../../../../ui/src/lib/i18n";
import ChevronLeft from "lucide-solid/icons/chevron-left";
import GitBranch from "lucide-solid/icons/git-branch";
import Plus from "lucide-solid/icons/plus";
import X from "lucide-solid/icons/x";
import { MarcaFuente } from "../../../../ui/src/sources";
import { MarcaGitHost } from "../../../../ui/src/icons";
import { Popover, PopoverTrigger } from "../../../../ui/src/Popover";
import { enfocar } from "../../../../ui/src/lib/focus";
import { Badge } from "../../../../ui/src/Badge";
import { Button } from "../../../../ui/src/Button";
import { Pressable } from "../../../../ui/src/Pressable";
import { Panel } from "../components/scope-panel";
import type { AlcanceProps } from "../components/scope-types";
import { createAlcance } from "./scope-state";
import { createPiezas } from "./scope-pieces";
import { Input } from "../../../../ui/src/Input";

/**
 * Las fuentes de la tarea, encima de la caja: lo que el agente lee, con su
 * chip para quitarlas y el de la rama para cambiarla. Adjuntar no pregunta la
 * rama: se trae la principal y se cambia desde su chip. Cambiar de rama
 * sustituye la fuente: otra rama es otra fuente (`context::repo_identity`).
 * El árbol donde el agente escribe no es una fuente: es la carpeta de trabajo
 * del proyecto, y la enseña el panel `features/code/Code.tsx`.
 */

export default function Alcance(props: AlcanceProps) {
  const s = createAlcance(props);
  const { eligiendo, paso, setPaso, proveedores, areas, url, setUrl, fallo, ocupado, cerrar, abrirRamas, cambiarDeRama, abrirAnadir, verAreas, verRepos, traerRepo, traerEscrito, coincide, ramasVisibles, reposVisibles } = s;
  const { vacio, buscador, extras } = createPiezas(s);

  return (
    // **La fila se pinta aunque esté vacía, y eso es el punto.** Escondida hasta
    // tener una fuente, la forma de añadir contexto o código no existía en
    // pantalla: vivía dentro del menú del `+` de la caja, donde hay que ir a
    // buscarla sabiendo ya que está.
    <div class="flex flex-wrap items-center gap-1.5 px-1 pb-1 text-caption text-neutral-500">
      <span class="shrink-0">{props.rotulo}:</span>

      <For each={props.items}>
        {(f) => (
          <span class="flex items-center gap-0.5 rounded-md bg-surface-muted pl-1.5">
            <span
              class="flex min-w-0 items-center gap-1 py-0.5"
              title={f.missing ? t("chat.scope.source.missing_at", { path: f.path }) : f.path}
            >
              <MarcaFuente location={f.location} kind={f.kind} />
              <span class="max-w-[160px] truncate">{f.name}</span>
              <Show when={f.missing}>
                <span>· {t("chat.scope.source.missing")}</span>
              </Show>
            </span>

            {/* La rama, como control propio. Solo la tienen los repositorios:
                una carpeta local no está en ninguna. */}
            <Show when={f.branch}>
              {(rama) => (
                // Anclado al chip que se pulsó. Sin `onClick` propio en el
                // disparador: Kobalte pasa el suyo dentro y en JSX gana el
                // último, así que ponerlo aquí borraría el que abre — es lo que
                // vigila `tests/unit/triggers.test.mjs`. Abrir y cerrar viajan
                // por `onOpenChange`.
                <Popover
                  open={eligiendo()?.id === f.id}
                  onOpenChange={(abierto) => {
                    if (abierto) return void abrirRamas(f);
                    // Solo si sigue siendo el suyo: abrir otro ya llamó a
                    // `cerrar()`, y este cierre es el eco de aquello.
                    if (eligiendo()?.id === f.id) cerrar();
                  }}
                  placement="top-start"
                  gutter={4}
                >
                  <PopoverTrigger
                    class="flex items-center gap-1 rounded-sm px-1 py-0.5 font-mono hover:bg-surface hover:text-neutral-950 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={props.bloqueado}
                    aria-label={t("chat.scope.branch.change", { name: f.name })}
                    title={t("chat.scope.branch.change", { name: f.name })}
                  >
                    <GitBranch size={12} aria-hidden="true" />
                    <span class="max-w-[120px] truncate">{rama()}</span>
                  </PopoverTrigger>

                  <Panel>
                    <div class="flex items-center gap-1 border-b border-border px-2 py-1">
                      <GitBranch size={12} aria-hidden="true" />
                      <span class="truncate font-medium text-neutral-950">
                        {f.name}
                      </span>
                    </div>
                    <Show
                      when={ramasVisibles()}
                      fallback={vacio(fallo() ?? t("chat.scope.branch.loading"))}
                    >
                      {(rs) => (
                        <>
                          <ul class="m-0 grid max-h-[220px] list-none gap-0.5 overflow-y-auto p-1">
                            <For
                              each={rs()}
                              fallback={vacio(t("chat.scope.branch.no_match"))}
                            >
                              {(b) => (
                                <li>
                                  <Pressable
                                    class="flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left font-mono hover:bg-surface-muted hover:text-neutral-950 disabled:cursor-default disabled:opacity-60"
                                    disabled={b === f.branch || ocupado()}
                                    onClick={() => void cambiarDeRama(f, b)}
                                  >
                                    <span class="min-w-0 flex-1 truncate">{b}</span>
                                    <Show when={b === f.branch}>
                                      <span class="font-sans">{t("chat.scope.branch.current")}</span>
                                    </Show>
                                  </Pressable>
                                </li>
                              )}
                            </For>
                          </ul>
                          {buscador(t("chat.scope.branch.search"))}
                        </>
                      )}
                    </Show>
                    {/* La lista se pudo enseñar y aun así la rama pudo no entrar:
                        traerla habla con el remoto. El fallback de arriba solo cubre
                        el caso de que no hubiera lista. */}
                    <Show when={ramasVisibles() && fallo()}>
                      {(f) => (
                        <p class="m-0 border-t border-border px-2 py-1.5 text-error-strong">
                          {f()}
                        </p>
                      )}
                    </Show>
                  </Panel>
                </Popover>
              )}
            </Show>

            <Pressable
              class="grid size-4 place-items-center rounded-sm hover:bg-surface hover:text-neutral-950 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={props.bloqueado}
              aria-label={t("chat.scope.source.remove", { name: f.name })}
              title={t("chat.scope.source.remove", { name: f.name })}
              onClick={() => props.onQuitar(f.id)}
            >
              <X size={11} aria-hidden="true" />
            </Pressable>

          </span>
        )}
      </For>

      <Popover
        open={Boolean(paso())}
        onOpenChange={(abierto) => {
          if (abierto) return void abrirAnadir();
          if (paso()) cerrar();
        }}
        placement="top-start"
        gutter={4}
      >
        {/* **Solo el `+`.** Lo que se añade ya lo dice la fila en la que está;
            repetirlo en el botón es decir dos veces lo mismo en el mismo
            renglón. El nombre viaja en `aria-label` y en el título, que es
            donde lo necesitan quien no ve el renglón y quien duda. */}
        <PopoverTrigger
          class="grid size-5 place-items-center rounded-sm hover:bg-surface-muted hover:text-neutral-950 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={props.bloqueado}
          aria-label={props.agregar}
          title={props.agregar}
        >
          <Plus size={12} aria-hidden="true" />
        </PopoverTrigger>

        <Panel>
          <Show when={paso()}>
            {(p) => (
              <>
              <Switch>
                {/* 1 · De qué cuenta. Con una sola conectada no se ve: se entra
                       directo a sus organizaciones. */}
                <Match when={p().que === "proveedores"}>
                  <div class="border-b border-border px-2 py-1 font-medium text-neutral-950">
                    {t("chat.scope.accounts.title")}
                  </div>
                  <Show
                    when={proveedores()}
                    fallback={vacio(t("chat.scope.accounts.loading"))}
                  >
                    {(ps) => (
                      <ul class="m-0 grid max-h-[220px] list-none gap-0.5 overflow-y-auto p-1">
                        <For each={ps()}>
                          {(pr) => (
                            <li>
                              <Pressable
                                class="flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left hover:bg-surface-muted hover:text-neutral-950"
                                onClick={() => void verAreas(pr.id)}
                              >
                                <MarcaGitHost id={pr.id} size={12} />
                                <span class="min-w-0 flex-1 truncate">
                                  {pr.name}
                                </span>
                              </Pressable>
                            </li>
                          )}
                        </For>
                        {extras()}
                      </ul>
                    )}
                  </Show>
                </Match>

                {/* 2 · La organización. */}
                <Match when={p().que === "areas"}>
                  <div class="flex items-center gap-1 border-b border-border px-1.5 py-1">
                    <Show when={(proveedores()?.length ?? 0) > 1}>
                      <Pressable
                        class="grid size-5 place-items-center rounded-sm hover:bg-surface-muted hover:text-neutral-950"
                        aria-label={t("chat.scope.accounts.back")}
                        onClick={() => setPaso({ que: "proveedores" })}
                      >
                        <ChevronLeft size={12} aria-hidden="true" />
                      </Pressable>
                    </Show>
                    <span class="font-medium text-neutral-950">
                      {t("chat.scope.orgs.title")}
                    </span>
                  </div>
                  <Show when={areas()} fallback={vacio(t("chat.scope.loading"))}>
                    {(as) => (
                      <>
                        <ul class="m-0 grid max-h-[220px] list-none gap-0.5 overflow-y-auto p-1">
                          <For
                            each={as().filter((x) => coincide(x.name))}
                            fallback={vacio(t("chat.scope.branch.no_match"))}
                          >
                            {(x) => (
                              <li>
                                <Pressable
                                  class="flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left hover:bg-surface-muted hover:text-neutral-950"
                                  onClick={() =>
                                    void verRepos(
                                      (p() as { proveedor: string }).proveedor,
                                      x.key,
                                    )
                                  }
                                >
                                  <span class="min-w-0 flex-1 truncate">
                                    {x.name}
                                  </span>
                                </Pressable>
                              </li>
                            )}
                          </For>
                          {extras()}
                        </ul>
                        {buscador(t("chat.scope.orgs.search"))}
                      </>
                    )}
                  </Show>
                </Match>

                {/* 3 · El repositorio. Aquí termina: la rama se elige después. */}
                <Match when={p().que === "repos"}>
                  <div class="flex items-center gap-1 border-b border-border px-1.5 py-1">
                    <Pressable
                      class="grid size-5 place-items-center rounded-sm hover:bg-surface-muted hover:text-neutral-950"
                      aria-label={t("chat.scope.orgs.back")}
                      onClick={() =>
                        void verAreas((p() as { proveedor: string }).proveedor)
                      }
                    >
                      <ChevronLeft size={12} aria-hidden="true" />
                    </Pressable>
                    <span class="font-medium text-neutral-950">
                      {t("chat.scope.repos.title")}
                    </span>
                  </div>
                  <Show when={reposVisibles()} fallback={vacio(t("chat.scope.loading"))}>
                    {(rs) => (
                      <>
                        <ul class="m-0 grid max-h-[220px] list-none gap-0.5 overflow-y-auto p-1">
                          <For
                            each={rs()}
                            fallback={vacio(t("chat.scope.repos.no_match"))}
                          >
                            {(x) => (
                              <li>
                                <Pressable
                                  class="flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left hover:bg-surface-muted hover:text-neutral-950 disabled:opacity-60"
                                  disabled={ocupado()}
                                  onClick={() =>
                                    traerRepo(
                                      (p() as { proveedor: string }).proveedor,
                                      x,
                                    )
                                  }
                                >
                                  <span class="min-w-0 flex-1 truncate">
                                    {x.name}
                                  </span>
                                  {/* **Solo cuando se sabe que NO se puede
                                      escribir.** `null` es «el proveedor no lo
                                      dijo», y marcarlo de solo lectura mandaría
                                      a pedir un permiso que ya se tiene. */}
                                  <Show when={x.can_push === false}>
                                    <Badge class="shrink-0">
                                      {t("chat.scope.repos.read_only")}
                                    </Badge>
                                  </Show>
                                </Pressable>
                              </li>
                            )}
                          </For>
                        </ul>
                        {buscador(t("chat.scope.repos.search"))}
                      </>
                    )}
                  </Show>
                </Match>

                {/* 4 · Pegar una dirección. Público o privado sin preguntar
                       cuál: el backend mira el host y usa el token si hay
                       conexión (`context::add_repo_url`). */}
                <Match when={p().que === "direccion"}>
                  <div class="flex items-center gap-1 border-b border-border px-1.5 py-1">
                    <Pressable
                      class="grid size-5 place-items-center rounded-sm hover:bg-surface-muted hover:text-neutral-950"
                      aria-label={t("chat.scope.back")}
                      onClick={() => void abrirAnadir()}
                    >
                      <ChevronLeft size={12} aria-hidden="true" />
                    </Pressable>
                    <span class="font-medium text-neutral-950">
                      {t("chat.scope.address_or_path")}
                    </span>
                  </div>
                  <form
                    class="flex items-center gap-1 p-1.5"
                    onSubmit={(e) => {
                      e.preventDefault();
                      traerEscrito();
                    }}
                  >
                    <Input
                      variant="plain"
                      ref={enfocar}
                      class="min-w-0 flex-1 rounded-sm border border-border bg-transparent px-2 py-1 font-mono text-caption outline-none focus:border-border-strong"
                      placeholder={t("chat.scope.address_or_path_placeholder")}
                      value={url()}
                      onInput={(e) => setUrl(e.currentTarget.value)}
                    />
                    <Button
                      type="submit"
                      size="compact"
                      class="shrink-0"
                      disabled={!url().trim() || ocupado()}
                    >
                      {ocupado() ? t("chat.scope.fetching") : t("chat.scope.fetch")}
                    </Button>
                  </form>
                </Match>
              </Switch>
                <Show when={fallo()}>
                  {(f) => (
                    <p class="m-0 border-t border-border px-2 py-1.5 text-error-strong">
                      {f()}
                    </p>
                  )}
                </Show>
              </>
            )}
          </Show>
        </Panel>
      </Popover>
    </div>
  );
}
