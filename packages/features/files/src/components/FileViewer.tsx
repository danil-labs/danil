import { For, Show, createMemo, createSignal, type Accessor, type JSX } from "solid-js";
import type { MachineConnection } from "@danil/engine-client";
import { useFileContent } from "../queries.ts";
import { FileIcon } from "./FileIcon.tsx";
import { LARGE_FILE_THRESHOLD_BYTES, type TreeContext } from "../model.ts";

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

function Breadcrumbs(props: { path: string }): JSX.Element {
  const parts = () => props.path.split("/").filter(Boolean);

  return (
    <nav aria-label="Ruta de archivo" class="flex items-center gap-1 text-xs text-neutral-400 truncate">
      <For each={parts()}>
        {(part, index) => (
          <>
            <Show when={index() > 0}>
              <span class="text-neutral-600">/</span>
            </Show>
            <span class={index() === parts().length - 1 ? "text-neutral-200 font-medium truncate" : "truncate"}>
              {part}
            </span>
          </>
        )}
      </For>
    </nav>
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
        {/* Cabecera / Barra de herramientas */}
        <div class="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-800 px-3 h-10 bg-neutral-900/60">
          <div class="flex items-center gap-2 min-w-0">
            <FileIcon path={currentPath() ?? ""} size={16} />
            <Breadcrumbs path={currentPath() ?? ""} />
          </div>

          <div class="flex items-center gap-3 shrink-0 text-xs text-neutral-400">
            <Show when={contentQuery.data()?.bytes !== undefined}>
              <span class="font-mono text-[11px] text-neutral-500">
                {formatBytes(contentQuery.data()?.bytes)}
              </span>
            </Show>

            <button
              onClick={() => contentQuery.refetch()}
              class="p-1 hover:text-neutral-200 rounded hover:bg-neutral-800 transition-colors"
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

        {/* Estado de error: REGLA R10/Mandatoria: Muestra error con botón de reintento, NUNCA lista o vista vacía */}
        <Show when={contentQuery.error()}>
          <div class="flex flex-col items-center justify-center m-6 p-6 text-center text-xs bg-rose-500/10 border border-rose-500/20 rounded-md">
            <span class="text-rose-400 font-medium mb-1">Error al leer el archivo</span>
            <span class="text-neutral-400 mb-3 text-[11px]">
              No se pudo obtener el contenido de {currentPath()}
            </span>
            <button
              onClick={() => contentQuery.refetch()}
              class="px-3 py-1.5 text-xs font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded border border-neutral-700 transition-colors"
            >
              Reintentar
            </button>
          </div>
        </Show>

        {/* Visor de solo lectura con <pre> y numeración de líneas */}
        <Show when={contentQuery.data() && !contentQuery.error()}>
          <div class="flex-1 min-h-0 overflow-auto flex font-mono text-xs leading-5">
            {/* Columna de números de línea */}
            <div class="select-none py-2 px-3 text-right text-neutral-600 bg-neutral-900/30 border-r border-neutral-800/60 shrink-0">
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
        </Show>
      </Show>
    </div>
  );
}
