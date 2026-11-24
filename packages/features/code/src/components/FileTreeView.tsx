import FilePlus from "lucide-solid/icons/file-plus";
import FolderPlus from "lucide-solid/icons/folder-plus";
import Search from "lucide-solid/icons/search";
import { For, Show } from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { cn } from "../../../../ui/src/lib/utils";
import { HEADER_HEIGHT } from "../../../../host/src/window";
import { Button } from "../../../../ui/src/Button";
import { Input } from "../../../../ui/src/Input";
import { FailureNote } from "../../../../ui/src/Failure";
import { ITEM_DE_MENU, Popover, PopoverContent } from "../../../../ui/src/Popover";
import { Pressable } from "../../../../ui/src/Pressable";
import { editorTypst, pedirInsercionDeRuta, rutaEnVuelo } from "../queries/typst";
import type { Nodo } from "../model/tree";
import { type ArbolProps, nombreDe } from "../model/fileTree";
import { createCargaDelArbol } from "../queries/fileTreeLoad";
import { createOperacionesDelArbol } from "../queries/fileTreeOps";
import { createFilas } from "./FileTreeRows";

export default function ArbolDeArchivos(props: ArbolProps) {
  const carga = createCargaDelArbol(props);
  const { cargando, busca, setBusca, falloEstado, leyendoEstado, cargar, visibles, recortado, fallo, falloTransitorio, lector } = carga;
  const ops = createOperacionesDelArbol(props, carga);
  const { editable, creable, seleccion, setSeleccion, nuevo, renombrando, menu, setMenu, falloOp } = ops;
  const { empezarNuevo, empezarARenombrar, borrar, comoSeRecupera, preguntaDeBorrado } = ops;
  let filaDelMenu: HTMLElement | undefined;
  let raiz: HTMLDivElement | undefined;
  let lista: HTMLDivElement | undefined;

  // Sin selección, lo nuevo se crea en la raíz: es la única salida de una
  // carpeta seleccionada.
  const enElVacio = (e: Event) => e.target === raiz || e.target === lista;

  // Con el teclado (Mayús+F10, la tecla de menú, Supr) el evento no trae
  // coordenadas: el menú sale pegado a la fila que tiene el foco.
  /** El editor de Typst a la vista, si es de este árbol: recibe rutas arrastradas o del menú. */
  const editorTypstAqui = () => {
    const e = editorTypst();
    return e && e.session === props.session && e.arbol === props.arbol ? e : null;
  };

  function abrirMenu(e: MouseEvent | KeyboardEvent, nodo: Nodo | null, borrando = false) {
    if (!editable()) return;
    e.preventDefault();
    e.stopPropagation();
    const fila = e.currentTarget as HTMLElement;
    filaDelMenu = fila;
    const r = fila.getBoundingClientRect();
    const raton = e instanceof MouseEvent && (e.clientX !== 0 || e.clientY !== 0);
    if (nodo) setSeleccion({ ruta: nodo.ruta, tipo: nodo.tipo });
    setMenu({
      nodo,
      x: raton ? e.clientX : r.left + 24,
      y: raton ? e.clientY : r.bottom,
      borrando,
    });
  }

  function teclaDeFila(e: KeyboardEvent, nodo: Nodo) {
    if (!editable()) return;
    if (e.key === "F2") {
      e.preventDefault();
      empezarARenombrar(nodo.ruta);
    } else if (e.key === "Delete") {
      abrirMenu(e, nodo, true);
    }
  }

  const { CampoNuevo, Fila } = createFilas(props, carga, ops, { abrirMenu, teclaDeFila, editorTypstAqui });

  return (
    <div
      ref={raiz}
      class="grid flex-1 grid-cols-1 content-start"
      onClick={(e) => {
        if (enElVacio(e)) setSeleccion(null);
      }}
      onContextMenu={(e) => {
        if (enElVacio(e)) abrirMenu(e, null);
      }}
      onKeyDown={(e) => {
        if (e.key !== "Escape" || !seleccion()) return;
        e.stopPropagation();
        setSeleccion(null);
      }}
    >
      <Show when={!cargando()}>
        <div class={cn("sticky top-0 z-10 flex items-center gap-1 border-b border-border bg-surface px-2", HEADER_HEIGHT)}>
          <label class="flex min-w-0 flex-1 items-center gap-1.5">
            <Search size={13} class="shrink-0 text-neutral-500" aria-hidden="true" />
            <Input
              variant="ghost"
              type="search"
              value={busca()}
              onInput={(e) => setBusca(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape" && busca()) {
                  e.stopPropagation();
                  setBusca("");
                }
              }}
              placeholder={t("code.tree.search")}
              aria-label={t("code.tree.search")}
              class="min-h-7 px-0 py-0 text-xs"
            />
          </label>
          {props.acciones}
          <Show when={creable()}>
            <Button
              variant="ghost"
              size="iconCompact"
              class="size-6 text-neutral-500"
              aria-label={t("code.tree.new_file")}
              title={editable() ? t("code.tree.new_file") : t("code.tree.new_file.empty_task")}
              onClick={() => empezarNuevo("archivo")}
            >
              <FilePlus size={14} />
            </Button>
            <Button
              variant="ghost"
              size="iconCompact"
              class="size-6 text-neutral-500"
              aria-label={t("code.tree.new_folder")}
              title={editable() ? t("code.tree.new_folder") : t("code.tree.new_folder.empty_task")}
              onClick={() => empezarNuevo("carpeta")}
            >
              <FolderPlus size={14} />
            </Button>
          </Show>
        </div>
        <Show when={falloOp()}>
          {(f) => (
            <div class="px-3 pt-2" role="alert">
              <FailureNote f={f()} />
            </div>
          )}
        </Show>
        <Show when={falloEstado()}>
          {(f) => (
            <div class="px-3" role="alert">
              <p class="m-0 text-xs text-error-strong">
                {t("code.tree.local.failed")}
              </p>
              <FailureNote f={f()} />
              <Button
                variant="ghost"
                size="compact"
                disabled={leyendoEstado()}
                onClick={() => void cargar()}
              >
                {t("code.tree.local.retry")}
              </Button>
            </div>
          )}
        </Show>
        <div ref={lista} class="grid grid-cols-1 content-start py-1">
          <Show when={nuevo()?.padre === ""}>
            <CampoNuevo hondura={0} />
          </Show>
          <Show
            when={visibles().length > 0}
            fallback={
              <Show when={busca().trim()}>
                <p class="m-0 px-3 py-2 text-caption text-neutral-500">
                  {t("code.tree.search.empty", { query: busca().trim() })}
                </p>
              </Show>
            }
          >
            <For each={visibles()}>
              {(n) => <Fila nodo={n} hondura={0} />}
            </For>
          </Show>
        </div>

        <Show when={recortado()}>
          <p class="m-0 px-3 py-2 text-caption text-neutral-500">
            {t("code.tree.truncated")}
          </p>
        </Show>
      </Show>

      <Show when={fallo()}>
        {(f) => (
          <div class="px-3 pb-3">
            {/* Un plazo vencido no es «reinicia la app»: se dice qué pasó y se ofrece otra vez. */}
            <Show when={falloTransitorio()} fallback={<FailureNote f={f()} />}>
              <p class="m-0 py-3 text-ui text-error-strong">{t("code.tree.failed.slow")}</p>
            </Show>
            <Button variant="ghost" size="compact" onClick={() => lector.reintentar()}>
              {t("code.tree.retry")}
            </Button>
          </div>
        )}
      </Show>

      <Show when={rutaEnVuelo()}>
        {(v) => (
          <div
            class="pointer-events-none fixed z-[90] max-w-64 truncate rounded-md border border-border bg-surface-raised px-2 py-1 font-mono text-xs text-neutral-950 shadow-md"
            style={{ left: `${v().x + 12}px`, top: `${v().y + 10}px` }}
            aria-hidden="true"
          >
            {nombreDe(v().ruta)}
          </div>
        )}
      </Show>

      <Popover
        open={menu() !== null}
        onOpenChange={(abierto) => {
          if (!abierto) setMenu(null);
        }}
        getAnchorRect={() => {
          const m = menu();
          return m ? { x: m.x, y: m.y, width: 0, height: 0 } : undefined;
        }}
        placement="bottom-start"
        gutter={2}
      >
        <PopoverContent
          role={menu()?.borrando ? "alertdialog" : "menu"}
          aria-label={menu()?.borrando ? t("code.tree.delete") : undefined}
          class={menu()?.borrando ? "w-72 p-3" : "w-52 p-1"}
          onCloseAutoFocus={(e: Event) => {
            e.preventDefault();
            if (!renombrando() && !nuevo()) filaDelMenu?.focus({ preventScroll: true });
          }}
        >
          <Show when={menu()}>
            {(m) => (
              <Show
                when={m().borrando && m().nodo}
                fallback={
                  <>
                    <Show when={m().nodo?.tipo !== "archivo"}>
                      <Pressable
                        role="menuitem"
                        class={ITEM_DE_MENU}
                        onClick={() => empezarNuevo("archivo", m().nodo?.ruta ?? "")}
                      >
                        {t("code.tree.new_file")}
                      </Pressable>
                      <Pressable
                        role="menuitem"
                        class={ITEM_DE_MENU}
                        onClick={() => empezarNuevo("carpeta", m().nodo?.ruta ?? "")}
                      >
                        {t("code.tree.new_folder")}
                      </Pressable>
                    </Show>
                    <Show when={m().nodo}>
                      {(nodo) => (
                        <>
                          <Show when={nodo().tipo === "carpeta"}>
                            <span class="my-1 block h-px bg-border" />
                          </Show>
                          <Show when={nodo().tipo === "archivo" && editorTypstAqui()?.ruta !== nodo().ruta && editorTypstAqui()}>
                            {(editor) => (
                              <Pressable
                                role="menuitem"
                                class={ITEM_DE_MENU}
                                onClick={() => {
                                  setMenu(null);
                                  pedirInsercionDeRuta({
                                    session: props.session,
                                    arbol: props.arbol,
                                    editor: editor().ruta,
                                    destino: nodo().ruta,
                                  });
                                }}
                              >
                                {t("code.tree.insert_path")}
                              </Pressable>
                            )}
                          </Show>
                          <Pressable
                            role="menuitem"
                            class={ITEM_DE_MENU}
                            onClick={() => empezarARenombrar(nodo().ruta)}
                          >
                            {t("code.tree.rename")}
                          </Pressable>
                          <Pressable
                            role="menuitem"
                            class={`${ITEM_DE_MENU} text-error-strong`}
                            onClick={() => setMenu({ ...m(), borrando: true })}
                          >
                            {t("code.tree.delete.ask")}
                          </Pressable>
                        </>
                      )}
                    </Show>
                  </>
                }
              >
                {(nodo) => (
                  <div class="min-w-0">
                    <p class="m-0 break-words text-xs font-semibold text-neutral-950">
                      {preguntaDeBorrado(nodo())}
                    </p>
                    <p class="m-0 mt-1 text-xs leading-[1.4] text-neutral-500">
                      {comoSeRecupera(nodo())}
                    </p>
                    <Show when={nodo().tipo === "carpeta" && props.kind !== "folder"}>
                      <p class="m-0 mt-1 text-xs leading-[1.4] text-neutral-500">
                        {t("code.tree.delete.hidden")}
                      </p>
                    </Show>
                    <div class="mt-2 flex gap-1.5">
                      <Button
                        variant="danger"
                        size="compact"
                        ref={(el: HTMLElement) =>
                          queueMicrotask(() => el.focus({ preventScroll: true }))
                        }
                        onClick={() => void borrar(nodo())}
                      >
                        {t("code.tree.delete")}
                      </Button>
                      <Button variant="outline" size="compact" onClick={() => setMenu(null)}>
                        {t("code.tree.delete.keep")}
                      </Button>
                    </div>
                  </div>
                )}
              </Show>
            )}
          </Show>
        </PopoverContent>
      </Popover>
    </div>
  );
}
