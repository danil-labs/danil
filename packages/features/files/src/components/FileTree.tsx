import { For, Show, createSignal, type Accessor, type JSX } from "solid-js";
import type { MachineConnection } from "@danil/engine-client";
import { useTree } from "../queries.ts";
import { FileIcon } from "./FileIcon.tsx";
import type { FileNodeView, GitStatusKind, TreeContext } from "../model.ts";

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
      case "ignored": return "I";
      default: return "";
    }
  };

  const colorClass = () => {
    switch (props.status) {
      case "modified": return "text-amber-400 bg-amber-400/10";
      case "added": return "text-emerald-400 bg-emerald-400/10";
      case "deleted": return "text-rose-400 bg-rose-400/10";
      case "untracked": return "text-neutral-400 bg-neutral-400/10";
      case "ignored": return "text-neutral-500 bg-neutral-500/10";
      default: return "text-neutral-400";
    }
  };

  return (
    <span
      class={`px-1 py-0.5 text-[10px] font-mono font-medium rounded shrink-0 ${colorClass()}`}
      title={`Git: ${props.status}`}
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
  return (
    <div
      role="treeitem"
      aria-selected={props.isSelected}
      aria-expanded={props.item.isDirectory ? props.isExpanded : undefined}
      class={`flex items-center gap-1.5 py-1 px-2 cursor-pointer select-none text-xs rounded transition-colors ${
        props.isSelected
          ? "bg-neutral-800 text-neutral-100 font-medium"
          : "text-neutral-300 hover:bg-neutral-800/50 hover:text-neutral-200"
      }`}
      style={{ "padding-left": `${props.level * 14 + 8}px` }}
      onClick={() => {
        if (props.item.isDirectory) {
          props.onToggle();
        } else {
          props.onSelect();
        }
      }}
    >
      {/* Indicador de expansión o espacio */}
      <span class="w-3.5 h-3.5 shrink-0 flex items-center justify-center text-neutral-400">
        {props.item.isDirectory ? (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class={`w-3 h-3 transition-transform ${props.isExpanded ? "rotate-90" : ""}`}
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        ) : null}
      </span>

      {/* Icono de archivo o carpeta */}
      <FileIcon
        path={props.item.path}
        isDirectory={props.item.isDirectory}
        expanded={props.isExpanded}
        size={14}
      />

      {/* Nombre del archivo */}
      <span class="truncate flex-1" title={props.item.path}>
        {props.item.name}
      </span>

      {/* Estado Git */}
      <GitBadge status={props.item.gitStatus} />
    </div>
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
        <div class="py-1 text-xs text-neutral-500 italic" style={{ "padding-left": `${(props.level + 1) * 14 + 8}px` }}>
          Cargando...
        </div>
      </Show>

      <Show when={treeQuery.error()}>
        <div class="p-2 my-1 text-xs text-rose-400 bg-rose-500/10 rounded border border-rose-500/20" style={{ "padding-left": `${(props.level + 1) * 14 + 8}px` }}>
          <span>Error al listar carpeta</span>
          <button
            onClick={() => treeQuery.refetch()}
            class="ml-2 px-1.5 py-0.5 text-[11px] bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded"
          >
            Reintentar
          </button>
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
      class={`flex flex-col h-full overflow-y-auto bg-neutral-900 border-r border-neutral-800 p-2 text-neutral-300 ${
        props.class ?? ""
      }`}
    >
      <div class="flex items-center justify-between pb-2 mb-2 border-b border-neutral-800 text-xs font-semibold text-neutral-400 uppercase tracking-wider">
        <span>Archivos</span>
        <button
          onClick={() => rootQuery.refetch()}
          class="p-1 text-neutral-400 hover:text-neutral-200 rounded hover:bg-neutral-800 transition-colors"
          title="Refrescar árbol"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-3.5 h-3.5">
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
            <path d="M3 21v-5h5" />
          </svg>
        </button>
      </div>

      {/* Estado de carga */}
      <Show when={rootQuery.loading()}>
        <div class="flex items-center justify-center p-6 text-xs text-neutral-500">
          <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-neutral-400" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span>Cargando archivos...</span>
        </div>
      </Show>

      {/* Estado de error: REGLA R10/Mandatoria: Muestra error con botón de reintento, NUNCA lista vacía */}
      <Show when={rootQuery.error()}>
        <div class="flex flex-col items-center justify-center p-6 text-center text-xs bg-rose-500/10 border border-rose-500/20 rounded-md my-2">
          <span class="text-rose-400 font-medium mb-1">Error al cargar el árbol</span>
          <span class="text-neutral-400 mb-3 text-[11px]">No se pudo obtener la lista de archivos</span>
          <button
            onClick={() => rootQuery.refetch()}
            class="px-3 py-1.5 text-xs font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded border border-neutral-700 transition-colors"
          >
            Reintentar
          </button>
        </div>
      </Show>

      {/* Lista de nodos */}
      <Show when={rootQuery.data() && !rootQuery.error()}>
        <div class="space-y-0.5">
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
