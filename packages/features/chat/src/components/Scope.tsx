import {
  For,
  Match,
  Show,
  Switch,
  createSignal,
  type JSX,
} from "solid-js";
import type { InvokeOptions } from "@tauri-apps/api/core";
import {
  getRepoBranches,
  getGitHostAreas,
  getGitHostProjects,
  attachRepo,
  addRepoUrl,
  addFolder,
  type RepoRemoto,
  type Area,
} from "../queries";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { open } from "@tauri-apps/plugin-dialog";
import ChevronLeft from "lucide-solid/icons/chevron-left";
import FolderOpen from "lucide-solid/icons/folder-open";
import GitBranch from "lucide-solid/icons/git-branch";
import Link from "lucide-solid/icons/link";
import Plus from "lucide-solid/icons/plus";
import Search from "lucide-solid/icons/search";
import X from "lucide-solid/icons/x";
import { MarcaFuente } from "../../../../ui/src/sources";
import { MarcaGitHost } from "../../../../ui/src/icons";
import { listGitHosts, type GitHost } from "../../../../../apps/desktop/src/lib/gitHosts";
import { Popover, PopoverContent, PopoverTrigger } from "../../../../ui/src/Popover";
import { enfocar } from "../../../../../apps/desktop/src/lib/focus";
import type { Source } from "../../../../../apps/desktop/src/lib/model";
import { prosaDe } from "../../../../ui/src/Failure";
import { Badge } from "../../../../ui/src/Badge";
import { Button } from "../../../../ui/src/Button";

/**
 * Las fuentes de la tarea, encima de la caja: lo que el agente lee, con su
 * chip para quitarlas y el de la rama para cambiarla. Adjuntar no pregunta la
 * rama: se trae la principal y se cambia desde su chip. Cambiar de rama
 * sustituye la fuente: otra rama es otra fuente (`context::repo_identity`).
 * El árbol donde el agente escribe no es una fuente: es la carpeta de trabajo
 * del proyecto, y la enseña el panel `features/code/Code.tsx`.
 */

type Proveedor = GitHost;

/** Por dónde va el panel de añadir. */
type Paso =
  | { que: "proveedores" }
  | { que: "areas"; proveedor: string }
  | { que: "repos"; proveedor: string; area: string }
  | { que: "direccion" };

/**
 * La caja de los dos desplegables de esta fila, en una sola pieza.
 *
 * **Sale por el átomo compartido `Popover`**, no por un `div` absoluto ni por un
 * `createEffect` con `document.addEventListener`. Un `div` no descarta nada —sin
 * listener de puntero, de `Escape` ni capa que intercepte el clic, lo único que
 * lo cierra es volver a pulsar el disparador—, y el listener a mano tendría que
 * reimplementar la exclusión del disparador, el foco de vuelta y el portal.
 * Kobalte excluye el disparador del «fuera» (`excludedElements`), así que
 * pulsarlo con el panel abierto **cierra y no reabre**, sin el parpadeo de
 * cerrar en `pointerdown` y reabrir en el `click` de detrás. Y sale del portal,
 * así que no se pinta detrás de la capa nativa de un sitio abierto
 * (`lib/sites.ts` esconde el webview cuando hay portal; un `div` no lo es).
 *
 * Dos cosas que le cambia al átomo:
 *
 * 1. **El foco no va al primer tabulable**, que aquí es el primer renglón de la
 *    lista: con el del átomo se pierde «abrir y escribir para filtrar». Se
 *    enfoca el buscador **solo si nadie dentro lo tomó ya** (`ref={enfocar}`),
 *    que resuelve el orden sin depender de quién corra primero. Entrar tiene que
 *    entrar: con el foco en el `textarea` del chat, `Escape` lo cobra su
 *    manejador, donde significa *vacía el borrador*.
 * 2. **Perder el foco de la ventana no cierra.** «Elegir una carpeta» abre un
 *    diálogo del sistema, que no es un clic en otra parte de la app; si cerrara,
 *    un fallo al traer la carpeta se quedaría sin dónde decirse.
 *
 * Queda **no modal**: el clic que cierra también activa lo que hay debajo, igual
 * que en `SelectorDeModelo`, `SelectorDeModo` y los menús del riel. Los dos
 * flotan sobre la caja de escribir y el clic que los cierra casi siempre es
 * «vuelvo a escribir»; tragarlo cobraría dos clics.
 */
function Panel(props: { children: JSX.Element }) {
  let caja: HTMLElement | undefined;

  return (
    <PopoverContent
      ref={caja}
      tabindex="-1"
      // Portado a `<body>`, así que no hereda el tamaño ni el color de la fila:
      // lo que allí venía del contenedor, aquí hay que decirlo.
      class="w-[300px] overflow-hidden p-0 text-caption text-neutral-500 shadow-lg"
      onOpenAutoFocus={(e: Event) => {
        e.preventDefault();
        queueMicrotask(() => {
          if (caja && !caja.contains(document.activeElement)) caja.focus();
        });
      }}
      onFocusOutside={(e: Event) => e.preventDefault()}
    >
      {props.children}
    </PopoverContent>
  );
}

export default function Alcance(props: {
  /** Lo que nombra la fila. */
  rotulo: string;
  /** Lo que se lee en el botón de añadir, después del `+`. */
  agregar: string;
  items: Source[];
  materialOptions?: InvokeOptions;
  materialTarget: string;
  materialAvailable: boolean;
  /**
   * Le llega el id de la fuente que quedó en el workspace. **Rechaza si el
   * material entró pero no se pudo traer a la tarea**, y entonces este panel se
   * queda abierto con el motivo en vez de cerrarse como si hubiera ido bien.
   */
  onTraer: (source: string) => Promise<void>;
  onQuitar: (source: string) => void;
  onCambiarRama: (source: Source, rama: string) => Promise<void>;
  /** Con un turno en marcha no se toca el alcance: se resuelve en cada turno. */
  bloqueado?: boolean;
}) {
  const [eligiendo, setEligiendo] = createSignal<Source | null>(null);
  const [ramas, setRamas] = createSignal<string[] | null>(null);
  const [paso, setPaso] = createSignal<Paso | null>(null);
  const [proveedores, setProveedores] = createSignal<Proveedor[] | null>(null);
  const [areas, setAreas] = createSignal<Area[] | null>(null);
  const [repos, setRepos] = createSignal<RepoRemoto[] | null>(null);
  const [url, setUrl] = createSignal("");
  const [busca, setBusca] = createSignal("");
  const [fallo, setFallo] = createSignal<string | null>(null);
  const [ocupado, setOcupado] = createSignal(false);

  const decir = (e: unknown) => setFallo(prosaDe(e));

  function cerrar() {
    setPaso(null);
    setEligiendo(null);
    setFallo(null);
    setBusca("");
  }

  // ------------------------------------------------------------------ ramas

  async function abrirRamas(f: Source) {
    // Sin alternar: el disparador del popover ya lo hace. Tenerlo aquí además
    // era cerrar dos veces y volver a abrir.
    cerrar();
    setEligiendo(f);
    setRamas(null);
    try {
      const r = await getRepoBranches(f.location);
      setRamas(r.branches);
    } catch (e) {
      // Sin red o sin permiso no hay lista que enseñar, y callarlo dejaría un
      // panel vacío que se lee como «este repo no tiene ramas».
      decir(e);
    }
  }

  /**
   * Cambiar de rama es **sustituir la fuente**, y eso puede fallar a mitad: la
   * nueva rama se trae del remoto. Se trata como traer material —el panel se
   * queda abierto con el motivo— porque es lo mismo con otro nombre.
   */
  async function cambiarDeRama(f: Source, rama: string) {
    setOcupado(true);
    setFallo(null);
    try {
      await props.onCambiarRama(f, rama);
      cerrar();
    } catch (e) {
      decir(e);
    } finally {
      setOcupado(false);
    }
  }

  // ------------------------------------------------------------------ añadir

  /** Un paso cuya única opción es la siguiente es un paso de más. */
  function saltarSiUnico(ps: Proveedor[]) {
    if (ps.length === 1) void verAreas(ps[0].id);
  }

  // **Sin alternar, y eso además arregla el botón «Volver».** El paso
  // «Dirección o ruta» vuelve llamando aquí, y con el `if (paso()) return
  // cerrar()` de antes el botón rotulado *Volver* cerraba el panel entero.
  async function abrirAnadir() {
    cerrar();
    setPaso({ que: "proveedores" });
    const ya = proveedores();
    if (ya) return saltarSiUnico(ya);
    try {
      const ps = await listGitHosts();
      // Solo los conectados: uno sin conexión no puede listar nada, y ofrecerlo
      // es un clic que acaba en un error que ya se sabía.
      const vivos = ps.filter((p) => p.connected);
      setProveedores(vivos);
      saltarSiUnico(vivos);
    } catch (e) {
      setProveedores([]);
      decir(e);
    }
  }

  async function verAreas(proveedor: string) {
    setPaso({ que: "areas", proveedor });
    setAreas(null);
    setBusca("");
    try {
      const as = await getGitHostAreas(proveedor);
      setAreas(as);
      if (as.length === 1) void verRepos(proveedor, as[0].key);
    } catch (e) {
      decir(e);
    }
  }

  async function verRepos(proveedor: string, area: string) {
    setPaso({ que: "repos", proveedor, area });
    setRepos(null);
    setBusca("");
    try {
      setRepos(
        await getGitHostProjects(proveedor, area),
      );
    } catch (e) {
      decir(e);
    }
  }

  /**
   * Todo lo que trae material acaba aquí: se trae, se avisa y se cierra.
   *
   * **El panel se cierra solo si se pudo.** Traerlo son dos actos —darlo de alta
   * en el workspace y traerlo a la tarea— y el segundo puede fallar solo: si el
   * repositorio ya no está en el disco, si la copia no se pudo clonar. Cerrando
   * a ciegas, ese fallo se leía como que había funcionado.
   */
  async function traer(fn: () => Promise<{ id: string }>, target = props.materialTarget) {
    setOcupado(true);
    setFallo(null);
    try {
      if (!props.materialAvailable) throw { what: t("projects.context.task_unavailable") };
      const s = await fn();
      if (target !== props.materialTarget) throw { what: t("projects.context.target_changed") };
      await props.onTraer(s.id);
      cerrar();
    } catch (e) {
      decir(e);
    } finally {
      setOcupado(false);
    }
  }

  const traerRepo = (proveedor: string, r: RepoRemoto) =>
    void traer(() =>
      attachRepo({
        project: "",
        gitHost: proveedor,
        cloneUrl: r.clone_url,
        // **La principal, y sin preguntar.** La rama se cambia después desde su
        // chip; preguntarla aquí sería decidir dos veces lo mismo.
        branch: r.branch || undefined,
        name: r.name,
      }, props.materialOptions),
    );

  /**
   * Una dirección de repositorio **o** una ruta de carpeta, en el mismo campo.
   *
   * Se decide por la forma y no se pregunta: quien pega algo sabe qué pegó, y
   * obligarle a decir de qué tipo es antes de pegarlo es un paso que solo existe
   * para el programa. Una URL va por `add_repo_url` —que además resuelve solo si
   * es público o privado— y cualquier otra cosa se trata como ruta.
   */
  const esDireccionWeb = (t: string) =>
    /^(https?:\/\/|git@|ssh:\/\/)/i.test(t.trim());

  const traerEscrito = () => {
    const t = url().trim();
    if (!t) return;
    const options = props.materialOptions;
    if (esDireccionWeb(t)) {
      return void traer(() =>
        addRepoUrl({ cloneUrl: t }, options),
      );
    }
    void traer(() => addFolder({ locator: t }, options));
  };

  async function traerCarpeta() {
    const target = props.materialTarget;
    const options = props.materialOptions;
    setFallo(null);
    try {
      if (!props.materialAvailable) throw { what: t("projects.context.task_unavailable") };
      const ruta = await open({ directory: true, multiple: false });
      if (typeof ruta !== "string") return;
      if (target !== props.materialTarget) throw { what: t("projects.context.target_changed") };
      await traer(() => addFolder({ locator: ruta }, options), target);
    } catch (e) {
      decir(e);
    }
  }

  // ------------------------------------------------------------------ filtro

  const coincide = (t: string) => {
    const q = busca().trim().toLowerCase();
    return !q || t.toLowerCase().includes(q);
  };
  const ramasVisibles = () => ramas()?.filter(coincide) ?? null;
  const reposVisibles = () =>
    repos()?.filter((r) => coincide(r.name) || coincide(r.slug)) ?? null;

  // -------------------------------------------------------------------- vista

  const vacio = (t: string) => <p class="m-0 px-2 py-2">{t}</p>;

  /** El buscador va **debajo** de la lista: lo que se busca casi siempre está
   *  arriba, y escribir es para cuando no. */
  const buscador = (marcador: string) => (
    <div class="relative border-t border-border">
      <Search
        size={11}
        class="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2"
        aria-hidden="true"
      />
      <input
        ref={enfocar}
        class="w-full bg-transparent py-1 pr-2 pl-6 text-caption outline-none"
        placeholder={marcador}
        value={busca()}
        onInput={(e) => setBusca(e.currentTarget.value)}
      />
    </div>
  );

  /** Los otros dos caminos, al pie de la navegación por cuenta. */
  const extras = () => (
    <>
      <li>
        <button
          type="button"
          class="flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left hover:bg-surface-muted hover:text-neutral-950"
          onClick={() => setPaso({ que: "direccion" })}
        >
          <Link size={12} aria-hidden="true" />
          <span class="min-w-0 flex-1 truncate">
            {t("chat.scope.paste_url_or_path")}
          </span>
        </button>
      </li>
      <li>
        <button
          type="button"
          class="flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left hover:bg-surface-muted hover:text-neutral-950"
          onClick={() => void traerCarpeta()}
        >
          <FolderOpen size={12} aria-hidden="true" />
          <span class="min-w-0 flex-1 truncate">{t("chat.scope.pick_folder")}</span>
        </button>
      </li>
    </>
  );

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
                                  <button
                                    type="button"
                                    class="flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left font-mono hover:bg-surface-muted hover:text-neutral-950 disabled:cursor-default disabled:opacity-60"
                                    disabled={b === f.branch || ocupado()}
                                    onClick={() => void cambiarDeRama(f, b)}
                                  >
                                    <span class="min-w-0 flex-1 truncate">{b}</span>
                                    <Show when={b === f.branch}>
                                      <span class="font-sans">{t("chat.scope.branch.current")}</span>
                                    </Show>
                                  </button>
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

            <button
              type="button"
              class="grid size-4 place-items-center rounded-sm hover:bg-surface hover:text-neutral-950 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={props.bloqueado}
              aria-label={t("chat.scope.source.remove", { name: f.name })}
              title={t("chat.scope.source.remove", { name: f.name })}
              onClick={() => props.onQuitar(f.id)}
            >
              <X size={11} aria-hidden="true" />
            </button>

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
                              <button
                                type="button"
                                class="flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left hover:bg-surface-muted hover:text-neutral-950"
                                onClick={() => void verAreas(pr.id)}
                              >
                                <MarcaGitHost id={pr.id} size={12} />
                                <span class="min-w-0 flex-1 truncate">
                                  {pr.name}
                                </span>
                              </button>
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
                      <button
                        type="button"
                        class="grid size-5 place-items-center rounded-sm hover:bg-surface-muted hover:text-neutral-950"
                        aria-label={t("chat.scope.accounts.back")}
                        onClick={() => setPaso({ que: "proveedores" })}
                      >
                        <ChevronLeft size={12} aria-hidden="true" />
                      </button>
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
                                <button
                                  type="button"
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
                                </button>
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
                    <button
                      type="button"
                      class="grid size-5 place-items-center rounded-sm hover:bg-surface-muted hover:text-neutral-950"
                      aria-label={t("chat.scope.orgs.back")}
                      onClick={() =>
                        void verAreas((p() as { proveedor: string }).proveedor)
                      }
                    >
                      <ChevronLeft size={12} aria-hidden="true" />
                    </button>
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
                                <button
                                  type="button"
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
                                </button>
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
                    <button
                      type="button"
                      class="grid size-5 place-items-center rounded-sm hover:bg-surface-muted hover:text-neutral-950"
                      aria-label={t("chat.scope.back")}
                      onClick={() => void abrirAnadir()}
                    >
                      <ChevronLeft size={12} aria-hidden="true" />
                    </button>
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
                    <input
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
