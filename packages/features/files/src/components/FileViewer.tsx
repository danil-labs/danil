import { For, Show, createMemo, createSignal, type Accessor, type JSX } from "solid-js";
import type { MachineConnection } from "@danil/engine-client";
import { useFileContent } from "../queries.ts";
import { FileIcon } from "./FileIcon.tsx";
import type { TreeContext } from "../model.ts";

export interface FileViewerProps {
  conn: Accessor<MachineConnection | null | undefined> | MachineConnection | null | undefined;
  path: Accessor<string | null | undefined> | string | null | undefined;
  context?: Accessor<TreeContext | undefined> | TreeContext;
  class?: string;
}

function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes === null || isNaN(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** La ruta partida en carpetas y el nombre, con el diseño visual exacto de desktop */
function Migas(props: { ruta: string; children?: JSX.Element }): JSX.Element {
  const partes = () => props.ruta.split(/[/\\]/).filter(Boolean);
  const nombre = () => partes().at(-1) ?? props.ruta;
  const carpetas = () => partes().slice(0, -1);

  return (
    <nav aria-label="Ruta de archivo" title={props.ruta} class="flex min-w-0 flex-1 items-center gap-1 text-xs text-neutral-400">
      <Show when={carpetas().length > 0}>
        <span dir="rtl" class="min-w-0 truncate text-left">
          <bdi>
            <For each={carpetas()}>
              {(carpeta) => (
                <>
                  {carpeta}
                  <span aria-hidden="true" class="px-1 opacity-70">›</span>
                </>
              )}
            </For>
          </bdi>
        </span>
      </Show>
      <span class="inline-flex shrink-0 items-center gap-1.5 font-medium text-neutral-200">
        <FileIcon path={props.ruta} size={13} class="shrink-0" />
        {nombre()}
      </span>
      {props.children}
    </nav>
  );
}

function BarraDeEstado(props: { lineas: number; bytes?: number }): JSX.Element {
  return (
    <div
      role="group"
      aria-label="Estado del archivo"
      class="flex h-6 shrink-0 items-center justify-end gap-3 border-t border-neutral-800 bg-neutral-900/60 px-3 text-[11px] text-neutral-500 font-mono"
    >
      <span>{props.lineas} líneas</span>
      <Show when={props.bytes !== undefined}>
        <span>{formatBytes(props.bytes)}</span>
      </Show>
      <span>UTF-8</span>
    </div>
  );
}

export function FileViewer(props: FileViewerProps): JSX.Element {
  const currentPath = () => (typeof props.path === "function" ? (props.path as Accessor<string | null | undefined>)() : props.path);
  const [allowLarge, setAllowLarge] = createSignal(false);

  // Hook único para contenido en queries.ts
  const contentQuery = useFileContent(
    props.conn,
    currentPath,
    props.context,
    () => ({ allowLargeFile: allowLarge() }),
  );

  const lines = createMemo(() => {
    const text = contentQuery.data()?.text ?? "";
    if (!text) return [""];
    return text.split("\n");
  });

  return (
    <div
      class={`flex h-full min-h-0 flex-col bg-neutral-950 text-neutral-200 ${props.class ?? ""}`}
    >
      <Show
        when={currentPath()}
        fallback={
          <div class="flex flex-col items-center justify-center h-full text-neutral-500 text-sm">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="w-12 h-12 mb-3 text-neutral-600">
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <span>Selecciona un archivo del árbol para ver su contenido</span>
          </div>
        }
      >
        {/* Cabecera / Barra de herramientas con diseño visual de desktop */}
        <div class="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-neutral-800 bg-neutral-900 px-2.5">
          <Migas ruta={currentPath() ?? ""}>
            <Show when={contentQuery.data()?.isLargeFile}>
              <span
                title="Archivo truncado por límite de tamaño"
                class="shrink-0 text-amber-400 font-medium"
              >
                ●
              </span>
            </Show>
          </Migas>

          <div class="flex items-center gap-1.5 shrink-0 text-xs text-neutral-400">
            <Show when={contentQuery.data()?.bytes !== undefined}>
              <span class="font-mono text-[11px] text-neutral-500">
                {formatBytes(contentQuery.data()?.bytes)}
              </span>
            </Show>

            <button
              type="button"
              onClick={() => contentQuery.refetch()}
              class="flex size-6 items-center justify-center rounded text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
              title="Recargar archivo"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-3.5 h-3.5">
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                <path d="M3 21v-5h5" />
              </svg>
            </button>
          </div>
        </div>

        {/* Aviso de seguridad B-019: Archivo > 5 MB */}
        <Show when={contentQuery.data()?.isLargeFile && !allowLarge()}>
          <div class="flex items-center justify-between gap-3 bg-amber-500/10 border-b border-amber-500/20 px-3 py-2 text-xs text-amber-300">
            <div class="flex items-center gap-2">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4 shrink-0 text-amber-400">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span>
                <strong>Archivo grande ({formatBytes(contentQuery.data()?.bytes)}):</strong> Se muestra una vista preliminar truncada para evitar bloqueos de la interfaz (B-019).
              </span>
            </div>
            <button
              type="button"
              onClick={() => setAllowLarge(true)}
              class="px-2.5 py-1 text-xs font-medium bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/30 rounded transition-colors whitespace-nowrap"
            >
              Cargar archivo completo
            </button>
          </div>
        </Show>

        {/* Estado de carga */}
        <Show when={contentQuery.loading()}>
          <div class="flex items-center justify-center p-8 text-neutral-400 text-xs">
            <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-neutral-400" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span>Cargando contenido...</span>
          </div>
        </Show>

        {/* Estado de error (R10) */}
        <Show when={contentQuery.error()}>
          <div class="flex flex-col items-center justify-center m-6 p-6 text-center text-xs bg-rose-500/10 border border-rose-500/20 rounded-md">
            <span class="text-rose-400 font-medium mb-1">Error al leer el archivo</span>
            <span class="text-neutral-400 mb-3 text-[11px]">
              No se pudo obtener el contenido de {currentPath()}
            </span>
            <button
              type="button"
              onClick={() => contentQuery.refetch()}
              class="px-3 py-1.5 text-xs font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded border border-neutral-700 transition-colors"
            >
              Reintentar
            </button>
          </div>
        </Show>

        {/* Visor de solo lectura con <pre> y numeración de líneas */}
        <Show when={contentQuery.data() && !contentQuery.error()}>
          <div class="flex-1 min-h-0 overflow-auto flex font-mono text-xs leading-5 bg-neutral-950">
            {/* Columna de números de línea */}
            <div class="select-none py-2 px-3 text-right text-neutral-600 bg-neutral-900/30 border-r border-neutral-800/60 shrink-0 tabular-nums">
              <For each={lines()}>
                {(_, idx) => <div>{idx() + 1}</div>}
              </For>
            </div>

            {/* Código en solo lectura */}
            <pre class="flex-1 p-2 m-0 overflow-x-auto text-neutral-200">
              <code>
                <For each={lines()}>
                  {(line) => (
                    <div class="whitespace-pre">
                      {line.length > 0 ? line : " "}
                    </div>
                  )}
                </For>
              </code>
            </pre>
          </div>

          <BarraDeEstado
            lineas={lines().length}
            bytes={contentQuery.data()?.bytes}
          />
        </Show>
      </Show>
    </div>
  );
}
