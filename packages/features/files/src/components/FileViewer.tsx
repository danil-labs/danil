import { For, Show, createMemo, createSignal, type Accessor, type JSX } from "solid-js";
import type { MachineConnection } from "@danil/engine-client";
import { Button, FailureNote } from "@danil/ui";
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

function RefreshIcon(props: { size?: number; class?: string }) {
  return (
    <svg width={props.size ?? 13} height={props.size ?? 13} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={props.class} aria-hidden="true">
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}

function Breadcrumbs(props: { path: string }): JSX.Element {
  const parts = () => props.path.split("/").filter(Boolean);
  const folders = () => parts().slice(0, -1);
  const fileName = () => parts()[parts().length - 1] ?? props.path;

  return (
    <nav aria-label="Ruta de archivo" class="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden text-ui text-neutral-500">
      <Show when={folders().length > 0}>
        <span dir="rtl" class="min-w-0 truncate text-left">
          <bdi>
            <For each={folders()}>
              {(folder) => (
                <>
                  <span>{folder}</span>
                  <span aria-hidden="true" class="px-1 opacity-70">›</span>
                </>
              )}
            </For>
          </bdi>
        </span>
      </Show>
      <span class="inline-flex shrink-0 items-center gap-1.5 font-medium text-neutral-950 dark:text-neutral-100">
        <FileIcon path={props.path} size={13} class="shrink-0" />
        {fileName()}
      </span>
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
      class={`flex h-full min-h-0 flex-col bg-background text-neutral-900 dark:text-neutral-100 ${props.class ?? ""}`}
    >
      <Show
        when={currentPath()}
        fallback={
          <div class="flex flex-col items-center justify-center h-full text-neutral-500 text-sm">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="w-10 h-10 mb-3 text-neutral-400">
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <span>Selecciona un archivo del árbol para ver su contenido</span>
          </div>
        }
      >
        {/* Cabecera / Barra de herramientas (h-[30px] HEADER_HEIGHT) */}
        <div class="flex h-[30px] shrink-0 items-center justify-between gap-2 border-b border-border bg-background pr-1.5 pl-2.5 select-none">
          <Breadcrumbs path={currentPath() ?? ""} />

          <div class="flex items-center gap-2 shrink-0 text-caption text-neutral-500">
            <Show when={contentQuery.data()?.bytes !== undefined}>
              <span class="font-mono tabular-nums text-caption text-neutral-500">
                {formatBytes(contentQuery.data()?.bytes)}
              </span>
            </Show>

            <Button
              variant="ghost"
              size="compact"
              class="shrink-0 gap-1.5 text-neutral-500 hover:text-neutral-950 dark:hover:text-neutral-100"
              title="Recargar archivo"
              aria-label="Recargar"
              onClick={() => contentQuery.refetch()}
            >
              <RefreshIcon size={13} />
            </Button>
          </div>
        </div>

        {/* Aviso de seguridad B-019: Archivo > 5 MB */}
        <Show when={contentQuery.data()?.isLargeFile && !allowLarge()}>
          <div class="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-surface-raised px-3 py-2 text-caption text-neutral-500">
            <p class="m-0 min-w-0 flex-1">
              Archivo grande ({formatBytes(contentQuery.data()?.bytes)}): vista preliminar truncada para evitar bloqueos (B-019).
            </p>
            <Button
              variant="secondary"
              size="compact"
              class="shrink-0"
              onClick={() => setAllowLarge(true)}
            >
              Cargar archivo completo
            </Button>
          </div>
        </Show>

        {/* Estado de carga */}
        <Show when={contentQuery.loading()}>
          <div class="flex items-center justify-center p-8 text-neutral-500 text-xs">
            <span>Cargando contenido...</span>
          </div>
        </Show>

        {/* Estado de error: REGLA R10/Mandatoria: Muestra error con botón de reintento, NUNCA lista vacía */}
        <Show when={contentQuery.error()}>
          <div class="p-4 border-b border-border bg-surface-raised flex items-center justify-between gap-3">
            <FailureNote what={`No se pudo obtener el contenido de ${currentPath() ?? ""}`} />
            <Button
              variant="secondary"
              size="compact"
              class="shrink-0"
              onClick={() => contentQuery.refetch()}
            >
              Reintentar
            </Button>
          </div>
        </Show>

        {/* Visor de contenido */}
        <Show when={contentQuery.data() && !contentQuery.loading() && !contentQuery.error()}>
          <div class="flex-1 overflow-auto bg-surface-muted p-3 font-mono text-xs leading-5">
            <table class="w-full border-collapse">
              <tbody>
                <For each={lines()}>
                  {(line, index) => (
                    <tr class="hover:bg-surface-raised/40">
                      <td class="select-none pr-4 text-right text-neutral-400 dark:text-neutral-600 tabular-nums w-12 align-top">
                        {index() + 1}
                      </td>
                      <td class="whitespace-pre-wrap break-all text-neutral-900 dark:text-neutral-100 align-top">
                        {line || "\u00A0"}
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </Show>
      </Show>
    </div>
  );
}
