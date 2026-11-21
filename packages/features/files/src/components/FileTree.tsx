import { For, Show, createSignal, type Accessor, type JSX } from "solid-js";
import type { MachineConnection } from "@danil/engine-client";
import { Button } from "@danil/ui";
import { useTree } from "../queries.ts";
import { FileIcon } from "./FileIcon.tsx";
import type { FileNodeView, GitStatusKind, TreeContext } from "../model.ts";

const SANGRIA = 12;
const CHEVRON = 13;

function ChevronDown(props: { size?: number; class?: string }) {
  return (
    <svg width={props.size ?? CHEVRON} height={props.size ?? CHEVRON} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={props.class} aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function ChevronRight(props: { size?: number; class?: string }) {
  return (
    <svg width={props.size ?? CHEVRON} height={props.size ?? CHEVRON} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={props.class} aria-hidden="true">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function HuecoDeChevron() {
  return <span class="shrink-0" style={{ width: `${CHEVRON}px` }} aria-hidden="true" />;
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

export interface FileTreeProps {
  conn: Accessor<MachineConnection | null | undefined> | MachineConnection | null | undefined;
  context?: Accessor<TreeContext | undefined> | TreeContext;
  selectedPath?: string | null;
  onSelect: (path: string) => void;
  class?: string;
}

function GitBadge(props: { status?: GitStatusKind | null }): JSX.Element {
  if (!props.status) return null;

  const letter = () => {
    switch (props.status) {
      case "modified": return "M";
      case "added": return "A";
      case "deleted": return "D";
      case "untracked": return "U";
      case "ignored": return "!";
      default: return "";
    }
  };

  const colorClass = () => {
    switch (props.status) {
      case "modified": return "text-warning-strong";
      case "added":
      case "untracked": return "text-success-strong";
      case "deleted":
      case "ignored": return "text-error-strong";
      default: return "text-neutral-500";
    }
  };

  return (
    <span
      class={`shrink-0 font-mono text-2xs font-semibold ${colorClass()}`}
      title={`Git: ${props.status}`}
      role="img"
    >
      {letter()}
    </span>
  );
}

function TreeNodeRow(props: {
  item: FileNodeView;
  level: number;
  isSelected: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onSelect: () => void;
}): JSX.Element {
  const sangria = () => `${props.level * SANGRIA + 12}px`;

  return (
    <button
      type="button"
      role="treeitem"
      aria-selected={props.isSelected}
      aria-expanded={props.item.isDirectory ? props.isExpanded : undefined}
      class={`flex w-full items-center gap-1.5 py-1 pr-3 text-left text-label outline-none hover:bg-surface-muted focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
        props.isSelected ? "bg-surface-muted font-semibold" : ""
      }`}
      style={{ "padding-left": sangria() }}
      onClick={() => {
        if (props.item.isDirectory) {
          props.onToggle();
        } else {
          props.onSelect();
        }
      }}
    >
      {/* Indicador de chevron para carpetas o espacio para archivos */}
      {props.item.isDirectory ? (
        props.isExpanded ? (
          <ChevronDown size={CHEVRON} class="shrink-0 text-neutral-500" />
        ) : (
          <ChevronRight size={CHEVRON} class="shrink-0 text-neutral-500" />
        )
      ) : (
        <HuecoDeChevron />
      )}

      {/* Icono de archivo o carpeta */}
      <FileIcon
        path={props.item.path}
        isDirectory={props.item.isDirectory}
        expanded={props.isExpanded}
        size={13}
        class="shrink-0"
      />

      {/* Nombre del archivo */}
      <span
        class={`min-w-0 flex-1 truncate font-mono text-xs ${
          props.isSelected ? "text-neutral-950 dark:text-neutral-100" : "text-neutral-500 hover:text-neutral-950 dark:hover:text-neutral-200"
        }`}
        title={props.item.name}
      >
        {props.item.name}
      </span>

      {/* Estado Git */}
      <GitBadge status={props.item.gitStatus} />
    </button>
  );
}

function SubTree(props: {
  conn: Accessor<MachineConnection | null | undefined> | MachineConnection | null | undefined;
  context?: Accessor<TreeContext | undefined> | TreeContext;
  path: string;
  level: number;
  selectedPath?: string | null;
  onSelect: (path: string) => void;
}): JSX.Element {
  const treeQuery = useTree(props.conn, () => props.path, props.context);
  const [expandedMap, setExpandedMap] = createSignal<Record<string, boolean>>({});

  const toggle = (itemPath: string) => {
    setExpandedMap((prev) => ({ ...prev, [itemPath]: !prev[itemPath] }));
  };

  return (
    <div>
      <Show when={treeQuery.loading()}>
        <div class="py-1 text-caption text-neutral-500 italic" style={{ "padding-left": `${(props.level + 1) * SANGRIA + 12}px` }}>
          Cargando...
        </div>
      </Show>

      <Show when={treeQuery.error()}>
        <div class="p-2 my-1 text-xs text-error-strong bg-surface-raised rounded border border-border flex items-center justify-between" style={{ "padding-left": `${(props.level + 1) * SANGRIA + 12}px` }}>
          <span>Error al listar carpeta</span>
          <Button
            variant="secondary"
            size="compact"
            onClick={() => treeQuery.refetch()}
          >
            Reintentar
          </Button>
        </div>
      </Show>

      <Show when={treeQuery.data() && !treeQuery.error()}>
        <For each={treeQuery.data()?.items}>
          {(item) => {
            const isExp = () => Boolean(expandedMap()[item.path]);
            const isSel = () => props.selectedPath === item.path;

            return (
              <>
                <TreeNodeRow
                  item={item}
                  level={props.level}
                  isSelected={isSel()}
                  isExpanded={isExp()}
                  onToggle={() => toggle(item.path)}
                  onSelect={() => props.onSelect(item.path)}
                />
                <Show when={item.isDirectory && isExp()}>
                  <SubTree
                    conn={props.conn}
                    context={props.context}
                    path={item.path}
                    level={props.level + 1}
                    selectedPath={props.selectedPath}
                    onSelect={props.onSelect}
                  />
                </Show>
              </>
            );
          }}
        </For>
      </Show>
    </div>
  );
}

export function FileTree(props: FileTreeProps): JSX.Element {
  const rootQuery = useTree(props.conn, "", props.context);
  const [expandedMap, setExpandedMap] = createSignal<Record<string, boolean>>({});

  const toggle = (itemPath: string) => {
    setExpandedMap((prev) => ({ ...prev, [itemPath]: !prev[itemPath] }));
  };

  return (
    <div
      role="tree"
      aria-label="Explorador de archivos"
      class={`flex flex-col h-full overflow-y-auto bg-background p-1 text-neutral-900 dark:text-neutral-100 select-none ${
        props.class ?? ""
      }`}
    >
      <div class="flex h-[30px] items-center justify-between px-2 text-ui font-semibold text-neutral-500 border-b border-border mb-1 shrink-0">
        <span>Archivos</span>
        <Button
          variant="ghost"
          size="compact"
          class="shrink-0 text-neutral-500 hover:text-neutral-950 dark:hover:text-neutral-100"
          title="Refrescar árbol"
          aria-label="Refrescar"
          onClick={() => rootQuery.refetch()}
        >
          <RefreshIcon size={13} />
        </Button>
      </div>

      {/* Estado de carga */}
      <Show when={rootQuery.loading()}>
        <div class="flex items-center justify-center p-6 text-xs text-neutral-500">
          <span>Cargando archivos...</span>
        </div>
      </Show>

      {/* Estado de error: REGLA R10/Mandatoria: Muestra error con botón de reintento, NUNCA lista vacía */}
      <Show when={rootQuery.error()}>
        <div class="flex flex-col items-center justify-center p-4 text-center text-xs bg-surface-raised border border-border rounded my-2">
          <span class="text-error-strong font-medium mb-1">Error al cargar el árbol</span>
          <span class="text-neutral-500 mb-3 text-caption">No se pudo obtener la lista de archivos</span>
          <Button
            variant="secondary"
            size="compact"
            onClick={() => rootQuery.refetch()}
          >
            Reintentar
          </Button>
        </div>
      </Show>

      {/* Lista de nodos */}
      <Show when={rootQuery.data() && !rootQuery.error()}>
        <div class="min-w-0">
          <For each={rootQuery.data()?.items}>
            {(item) => {
              const isExp = () => Boolean(expandedMap()[item.path]);
              const isSel = () => props.selectedPath === item.path;

              return (
                <>
                  <TreeNodeRow
                    item={item}
                    level={0}
                    isSelected={isSel()}
                    isExpanded={isExp()}
                    onToggle={() => toggle(item.path)}
                    onSelect={() => props.onSelect(item.path)}
                  />
                  <Show when={item.isDirectory && isExp()}>
                    <SubTree
                      conn={props.conn}
                      context={props.context}
                      path={item.path}
                      level={1}
                      selectedPath={props.selectedPath}
                      onSelect={props.onSelect}
                    />
                  </Show>
                </>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
}
