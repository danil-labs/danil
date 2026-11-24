import ChevronDown from "lucide-solid/icons/chevron-down";
import ChevronRight from "lucide-solid/icons/chevron-right";
import Cloud from "lucide-solid/icons/cloud";
import Eye from "lucide-solid/icons/eye";
import EyeClosed from "lucide-solid/icons/eye-closed";
import FilePlus from "lucide-solid/icons/file-plus";
import Folder from "lucide-solid/icons/folder";
import FolderOpen from "lucide-solid/icons/folder-open";
import { createEffect, For, type JSX, Show } from "solid-js";
import { t } from "../../../../ui/src/lib/i18n";
import { cn } from "../../../../ui/src/lib/utils";
import { FailureNote } from "../../../../ui/src/Failure";
import { IconoDeArchivo } from "../../../../ui/src/FileIcon";
import { Pressable } from "../../../../ui/src/Pressable";
import { colorDeMarca, describirEstado } from "../queries/localStatus";
import {
  arrastrarRuta,
  type editorTypst,
  elegirPrincipal,
  fueArrastreDeRuta,
  principalElegido,
} from "../queries/typst";
import type { Nodo } from "../model/tree";
import { type ArbolProps, CHEVRON, nombreDe, SANGRIA } from "../model/fileTree";
import type { CargaDelArbol } from "../queries/fileTreeLoad";
import type { OperacionesDelArbol } from "../queries/fileTreeOps";
import { CampoDeNombre, HuecoDeChevron } from "../components/FileTreeNameField";

/** Lo que las filas toman del menú del árbol, que vive con él. */
export type MenuDeFila = {
  abrirMenu: (e: MouseEvent | KeyboardEvent, nodo: Nodo | null, borrando?: boolean) => void;
  teclaDeFila: (e: KeyboardEvent, nodo: Nodo) => void;
  editorTypstAqui: () => ReturnType<typeof editorTypst>;
};

/** Las filas del árbol: carpetas, archivos, el campo de lo nuevo y el pie de una carpeta plegada. */
export function createFilas(props: ArbolProps, carga: CargaDelArbol, ops: OperacionesDelArbol, menu: MenuDeFila) {
  const { plegadas, cargarPlegada, abiertasAhora, alternar, busca } = carga;
  const { nuevo, setNuevo, crear, seleccion, setSeleccion, renombrando, setRenombrando, renombrar, conOjo } = ops;
  const { abrirMenu, teclaDeFila, editorTypstAqui } = menu;

  function CampoNuevo(p: { hondura: number }) {
    return (
      <Show when={nuevo()}>
        {(n) => (
          <CampoDeNombre
            inicial=""
            sangria={`${p.hondura * SANGRIA + 12}px`}
            etiqueta={n().tipo === "archivo" ? t("code.tree.name.new_file") : t("code.tree.name.new_folder")}
            icono={
              n().tipo === "archivo"
                ? <FilePlus size={13} class="shrink-0 text-neutral-500" aria-hidden="true" />
                : <Folder size={13} class="shrink-0 text-info-strong" aria-hidden="true" />
            }
            onConfirmar={crear}
            onCancelar={() => setNuevo(null)}
          />
        )}
      </Show>
    );
  }

  /** El documento Typst que se compila en esta tarea: el que resolvió la última compilación. */
  /** El ojo abierto es la elección de la persona; sin ella, la vista compila el `main.typ` más cercano. */
  const principalTypst = () => principalElegido(props.project);

  /** Lo que falta de una carpeta plegada abierta: cargando, vacía o «Mostrar más». */
  function PieDePlegada(p: { ruta: string; hondura: number }) {
    const estado = () => plegadas().get(p.ruta);
    const sangria = () => `${p.hondura * SANGRIA + 12 + CHEVRON + 6}px`;
    const nota = "m-0 py-1 pr-3 text-caption text-neutral-500";
    createEffect(() => {
      if (!plegadas().has(p.ruta)) void cargarPlegada(p.ruta);
    });
    return (
      <Show when={estado()}>
        {(e) => (
          <>
            <Show when={e().fallo}>
              {(f) => (
                <div class="py-1 pr-3" style={{ "padding-left": sangria() }} role="alert">
                  <p class="m-0 text-xs text-error-strong">{t("code.tree.folded.failed")}</p>
                  <FailureNote f={f()} />
                </div>
              )}
            </Show>
            <Show when={e().cargando}>
              <p class={nota} style={{ "padding-left": sangria() }}>{t("code.tree.folded.loading")}</p>
            </Show>
            <Show when={!e().cargando && !e().fallo && e().total === 0}>
              <p class={nota} style={{ "padding-left": sangria() }}>{t("code.tree.folded.empty")}</p>
            </Show>
            <Show when={!e().cargando && e().next !== null ? e().next : null}>
              {(desde) => (
                <Pressable
                  class="w-full py-1 pr-3 text-left text-caption text-primary outline-none hover:underline focus-visible:outline-2 focus-visible:outline-primary"
                  style={{ "padding-left": sangria() }}
                  onClick={() => void cargarPlegada(p.ruta, desde())}
                >
                  {t("code.tree.folded.more", { count: e().total - desde() })}
                </Pressable>
              )}
            </Show>
          </>
        )}
      </Show>
    );
  }

  function Fila(p: { nodo: Nodo; hondura: number }) {
    const sangria = () => `${p.hondura * SANGRIA + 12}px`;
    const carpeta = () => (p.nodo.tipo === "carpeta" ? p.nodo : null);
    const archivo = () => (p.nodo.tipo === "archivo" ? p.nodo : null);
    const abierta = (ruta: string) => abiertasAhora().has(ruta);
    const clasesDeFila = () =>
      cn(
        "flex w-full items-center gap-1.5 py-1 pr-3 text-left text-label outline-none hover:bg-surface-muted focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        seleccion()?.ruta === p.nodo.ruta && "bg-surface-muted",
      );
    const campoDeRenombre = (icono: JSX.Element) => (
      <CampoDeNombre
        inicial={nombreDe(p.nodo.ruta)}
        sangria={sangria()}
        etiqueta={t("code.tree.name.rename", { name: nombreDe(p.nodo.ruta) })}
        icono={icono}
        onConfirmar={(nombre) => renombrar(p.nodo.ruta, nombre)}
        onCancelar={() => setRenombrando(null)}
      />
    );

    return (
      <>
        <Show when={carpeta()}>
          {(c) => (
            <>
              <Show
                when={renombrando() !== c().ruta}
                fallback={campoDeRenombre(
                  <Folder size={13} class="shrink-0 text-info-strong" aria-hidden="true" />,
                )}
              >
                <Pressable
                  class={cn(clasesDeFila(), c().plegada || c().ignorada ? "opacity-60" : undefined)}
                  style={{ "padding-left": sangria() }}
                  title={
                    c().ignorada
                      ? t("code.tree.folded.ignored")
                      : c().plegada
                        ? t("code.tree.folded.dependencies")
                        : undefined
                  }
                  aria-expanded={abierta(c().ruta)}
                  onClick={() => {
                    setSeleccion({ ruta: c().ruta, tipo: "carpeta" });
                    alternar(c().ruta);
                  }}
                  onContextMenu={(e) => abrirMenu(e, c())}
                  onKeyDown={(e) => teclaDeFila(e, c())}
                >
                  {abierta(c().ruta) ? (
                    <ChevronDown size={CHEVRON} class="shrink-0 text-neutral-500" />
                  ) : (
                    <ChevronRight size={CHEVRON} class="shrink-0 text-neutral-500" />
                  )}
                  {abierta(c().ruta) ? (
                    <FolderOpen size={13} class="shrink-0 text-info-strong" aria-hidden="true" />
                  ) : (
                    <Folder size={13} class="shrink-0 text-info-strong" aria-hidden="true" />
                  )}

                  <span
                    class={cn(
                      "min-w-0 flex-1 truncate font-mono",
                      c().cambiados > 0 ? "font-semibold" : "text-neutral-500",
                    )}
                    title={c().nombre}
                  >
                    {c().nombre}
                  </span>
                  <Show when={c().cambiados > 0}>
                    <span
                      class="size-1.5 shrink-0 rounded-full bg-neutral-500"
                      role="img"
                      title={t("code.tree.local.descendants")}
                      aria-label={t("code.tree.local.descendants")}
                    />
                  </Show>
                </Pressable>
              </Show>
              <Show when={abierta(c().ruta)}>
                <Show when={nuevo()?.padre === c().ruta}>
                  <CampoNuevo hondura={p.hondura + 1} />
                </Show>
                <For each={c().hijos}>
                  {(h) => <Fila nodo={h} hondura={p.hondura + 1} />}
                </For>
                <Show when={c().plegada && !busca().trim()}>
                  <PieDePlegada ruta={c().ruta} hondura={p.hondura + 1} />
                </Show>
              </Show>
            </>
          )}
        </Show>

        <Show when={archivo()}>
          {(a) => (
            <Show
              when={!a().nube}
              fallback={
                <div
                  class="flex w-full cursor-default items-center gap-1.5 py-1 pr-3 text-label opacity-60"
                  style={{ "padding-left": sangria() }}
                  title={t("code.tree.cloud")}
                  aria-disabled="true"
                >
                  <HuecoDeChevron />
                  <IconoDeArchivo ruta={a().ruta} size={13} class="shrink-0 text-neutral-500" />
                  <span class="min-w-0 flex-1 truncate font-mono text-neutral-500" title={a().nombre}>{a().nombre}</span>
                  <Cloud size={11} class="shrink-0 text-neutral-500" role="img" aria-label={t("code.tree.cloud")} />
                </div>
              }
            >
              <Show
                when={renombrando() !== a().ruta}
                fallback={campoDeRenombre(
                  <IconoDeArchivo ruta={a().ruta} size={13} class="shrink-0 text-neutral-500" />,
                )}
              >
                <div class="group/fila relative">
                <Pressable
                  data-ruta={a().ruta}
                  class={cn(clasesDeFila(), conOjo(a().ruta) && "pr-7")}
                  style={{ "padding-left": sangria() }}
                  onPointerDown={(e) => {
                    if (editorTypstAqui()) arrastrarRuta(e, props.session, props.arbol, a().ruta);
                  }}
                  onClick={() => {
                    if (fueArrastreDeRuta()) return;
                    setSeleccion({ ruta: a().ruta, tipo: "archivo" });
                    props.onAbrir(a().ruta, Boolean(a().cambio));
                  }}
                  onDblClick={() => props.onAbrirFijo?.(a().ruta, Boolean(a().cambio))}
                  onContextMenu={(e) => abrirMenu(e, a())}
                  onKeyDown={(e) => teclaDeFila(e, a())}
                >
                  <HuecoDeChevron />
                  <IconoDeArchivo
                    ruta={a().ruta}
                    size={13}
                    class="shrink-0 text-neutral-500"
                  />
                  <span
                    class={cn(
                      "min-w-0 flex-1 truncate font-mono",
                      a().local ? "font-semibold" : "text-neutral-500",
                      a().local?.marca === "D" && "line-through",
                    )}
                    title={a().nombre}
                  >
                    {a().nombre}
                  </span>
                  <Show when={a().local}>
                    {(estado) => (
                      <span
                        class={cn(
                          "shrink-0 font-mono text-2xs font-semibold",
                          colorDeMarca(estado().marca),
                        )}
                        role="img"
                        title={describirEstado(estado())}
                        aria-label={describirEstado(estado())}
                      >
                        {estado().marca}
                      </span>
                    )}
                  </Show>
                </Pressable>
                <Show when={conOjo(a().ruta)}>
                  <Pressable
                    class={cn(
                      "absolute top-1/2 right-1.5 flex size-5 -translate-y-1/2 items-center justify-center rounded-sm outline-none hover:bg-neutral-200 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-primary",
                      principalTypst() === a().ruta ? "text-primary" : "text-neutral-500 hover:text-neutral-950",
                    )}
                    aria-pressed={principalTypst() === a().ruta}
                    aria-label={
                      principalTypst() === a().ruta
                        ? t("code.typst.main.current", { name: a().nombre })
                        : t("code.typst.main.choose", { name: a().nombre })
                    }
                    title={
                      principalTypst() === a().ruta
                        ? t("code.typst.main.current", { name: a().nombre })
                        : t("code.typst.main.choose", { name: a().nombre })
                    }
                    onClick={() => elegirPrincipal(props.project, principalTypst() === a().ruta ? null : a().ruta)}
                  >
                    {principalTypst() === a().ruta ? (
                      <Eye size={12} aria-hidden="true" />
                    ) : (
                      <EyeClosed size={12} aria-hidden="true" />
                    )}
                  </Pressable>
                </Show>
                </div>
              </Show>
            </Show>
          )}
        </Show>
      </>
    );
  }

  return { CampoNuevo, Fila };
}
