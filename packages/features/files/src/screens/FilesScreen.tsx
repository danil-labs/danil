import { createSignal, type Accessor, type JSX } from "solid-js";
import type { MachineConnection } from "@danil/engine-client";
import { FileTree } from "../components/FileTree.tsx";
import { FileViewer } from "../components/FileViewer.tsx";
import type { TreeContext } from "../model.ts";

export interface FilesScreenProps {
  conn: Accessor<MachineConnection | null | undefined> | MachineConnection | null | undefined;
  context?: Accessor<TreeContext | undefined> | TreeContext;
  initialPath?: string | null;
  class?: string;
}

export function FilesScreen(props: FilesScreenProps): JSX.Element {
  const [selectedPath, setSelectedPath] = createSignal<string | null>(props.initialPath ?? null);

  return (
    <div class={`flex h-full w-full overflow-hidden bg-neutral-950 ${props.class ?? ""}`}>
      {/* Panel izquierdo: Árbol de archivos */}
      <aside class="w-64 sm:w-72 h-full shrink-0">
        <FileTree
          conn={props.conn}
          context={props.context}
          selectedPath={selectedPath()}
          onSelect={(path) => setSelectedPath(path)}
        />
      </aside>

      {/* Panel principal: Visor de archivo */}
      <main class="flex-1 h-full min-w-0">
        <FileViewer
          conn={props.conn}
          path={selectedPath()}
          context={props.context}
        />
      </main>
    </div>
  );
}
