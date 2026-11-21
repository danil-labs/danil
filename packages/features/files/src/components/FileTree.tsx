import { For, Show, createMemo, createSignal, type Accessor, type JSX } from "solid-js";
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

const SANGRIA = 12;
const CHEVRON = 13;

const HuecoDeChevron = () => (
  <span class="shrink-0" style={{ width: `${CHEVRON}px` }} aria-hidden="true" />
);

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
      case "modified": return "text-amber-400";
      case "added": return "text-emerald-400";
      case "deleted": return "text-rose-400";
      case "untracked": return "text-neutral-400";
      case "ignored": return "text-neutral-500";
      default: return "text-neutral-400";
    }
  };

  return (
    <span
      class={`shrink-0 font-mono text-[10px] font-semibold ${colorClass()}`}
      role="img"
      title={`Git: ${props.status}`}
      aria-label={`Git: ${props.status}`}
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
  const paddingLeft = () => `${props.level * SANGRIA + 8}px`;

  if (props.item.isDirectory) {
    return (
      <button
        type="button"
        role="treeitem"
        aria-selected={props.isSelected}
        aria-expanded={props.isExpanded}
        class={`flex w-full items-center gap-1.5 py-1 pr-3 text-left text-xs outline-none transition-colors hover:bg-neutral-800/60 focus-visible:outline-2 focus-visible:outline-neutral-400 ${
          props.isSelected ? "bg-neutral-800 text-neutral-100 font-medium" : "text-neutral-300"
        }`}
        style={{ "padding-left": paddingLeft() }}
        onClick={props.onToggle}
      >
        <span class="shrink-0 flex items-center justify-center text-neutral-500" style={{ width: `${CHEVRON}px` }}>
          {props.isExpanded ? (
            <svg viewBox="0 0 24 24" width={CHEVRON} height={CHEVRON} fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width={CHEVRON} height={CHEVRON} fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          )}
        </span>
        <FileIcon
          path={props.item.path}
          isDirectory={true}
          expanded={props.isExpanded}
          size={13}
        />
        <span class="min-w-0 flex-1 truncate font-mono" title={props.item.name}>
          {props.item.name}
        </span>
        <GitBadge status={props.item.gitStatus} />
      </button>
    );
  }

  return (
    <button
      type="button"
      role="treeitem"
      data-ruta={props.item.path}
      aria-selected={props.isSelected}
      class={`flex w-full items-center gap-1.5 py-1 pr-3 text-left text-xs outline-none transition-colors hover:bg-neutral-800/60 focus-visible:outline-2 focus-visible:outline-neutral-400 ${
        props.isSelected ? "bg-neutral-800 text-neutral-100 font-medium" : "text-neutral-300"
      }`}
      style={{ "padding-left": paddingLeft() }}
      onClick={props.onSelect}
    >
      <HuecoDeChevron />
      <FileIcon
        path={props.item.path}
        isDirectory={false}
        size={13}
        class="shrink-0 text-neutral-500"
      />
      <span
        class={`min-w-0 flex-1 truncate font-mono ${
          props.item.gitStatus ? "font-semibold" : ""
        } ${props.item.gitStatus === "deleted" ? "line-through opacity-60" : ""}`}
        title={props.item.name}
      >
        {props.item.name}
      </span>
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
        <div class="py-1 text-xs text-neutral-500 italic" style={{ "padding-left": `${(props.level + 1) * SANGRIA + 8}px` }}>
          Cargando...
        </div>
      </Show>

      <Show when={treeQuery.error()}>
        <div class="p-2 my-1 text-xs text-rose-400 bg-rose-500/10 rounded border border-rose-500/20" style={{ "padding-left": `${(props.level + 1) * SANGRIA + 8}px` }}>
          <span>Error al listar carpeta</span>
          <button
            type="button"
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
  const [busca, setBusca] = createSignal("");

  const toggle = (itemPath: string) => {
    setExpandedMap((prev) => ({ ...prev, [itemPath]: !prev[itemPath] }));
  };

  const itemsVisibles = createMemo(() => {
    const query = busca().trim().toLowerCase();
    const items = rootQuery.data()?.items ?? [];
    if (!query) return items;
    return items.filter((item) =>
      item.name.toLowerCase().includes(query) || item.path.toLowerCase().includes(query),
    );
  });

  return (
    <div
      role="tree"
      aria-label="Explorador de archivos"
      class={`flex flex-col h-full overflow-y-auto bg-neutral-900 border-r border-neutral-800 text-neutral-300 ${
        props.class ?? ""
      }`}
    >
      {/* Barra superior con búsqueda y refresco idéntica al diseño desktop */}
      <div class="sticky top-0 z-10 flex h-9 items-center gap-1 border-b border-neutral-800 bg-neutral-900 px-2">
        <label class="flex min-w-0 flex-1 items-center gap-1.5">
          <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" stroke-width="2" class="shrink-0 text-neutral-500" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="search"
            value={busca()}
            onInput={(e) => setBusca(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && busca()) {
                e.stopPropagation();
                setBusca("");
              }
            }}
            placeholder="Buscar archivos..."
            aria-label="Buscar archivos"
            class="min-h-7 w-full bg-transparent px-0 py-0 text-xs text-neutral-200 placeholder:text-neutral-500 outline-none border-none focus:ring-0"
          />
        </label>
        <button
          type="button"
          onClick={() => rootQuery.refetch()}
          class="flex size-6 items-center justify-center rounded text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
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

      {/* Estado de error (R10) */}
      <Show when={rootQuery.error()}>
        <div class="flex flex-col items-center justify-center p-6 text-center text-xs bg-rose-500/10 border border-rose-500/20 rounded-md my-2 mx-2">
          <span class="text-rose-400 font-medium mb-1">Error al cargar el árbol</span>
          <span class="text-neutral-400 mb-3 text-[11px]">No se pudo obtener la lista de archivos</span>
          <button
            type="button"
            onClick={() => rootQuery.refetch()}
            class="px-3 py-1.5 text-xs font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded border border-neutral-700 transition-colors"
          >
            Reintentar
          </button>
        </div>
      </Show>

      {/* Lista de nodos */}
      <Show when={rootQuery.data() && !rootQuery.error()}>
        <div class="grid grid-cols-1 content-start py-1">
          <Show
            when={itemsVisibles().length > 0}
            fallback={
              <Show when={busca().trim()}>
                <p class="m-0 px-3 py-2 text-xs text-neutral-500">
                  Sin resultados para «{busca().trim()}»
                </p>
              </Show>
            }
          >
            <For each={itemsVisibles()}>
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
          </Show>
        </div>
      </Show>
    </div>
  );
}
