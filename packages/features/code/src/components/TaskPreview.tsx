import GitBranch from "lucide-solid/icons/git-branch";
import { t } from "../../../../ui/src/lib/i18n";
import type { Tipo } from "./FileTree";
import ArbolDeArchivos from "./FileTreeLazy";

/**
 * La carpeta del proyecto antes de que la tarea exista: el commit del que
 * nacerá su copia de trabajo, con la rama base en la cabecera.
 *
 * Solo elige, como el panel de la tarea (`Code.tsx`): el archivo se lee en una
 * pestaña del centro (`lib/tabs.ts`, `FileViewer.tsx`). Crear un archivo o una
 * carpeta aquí abre la tarea vacía donde se crean (`onCrear`).
 */
export default function VistaPreviaDeTarea(props: {
  project: string;
  baseRef?: string;
  visible: boolean;
  onCrear?: (tipo: Tipo, ruta: string) => Promise<void>;
  onAbrir: (arbol: string, ruta: string, cambiado: boolean) => void;
}) {
  const branch = () =>
    props.baseRef?.replace(/^refs\/(heads|remotes)\//, "") ?? t("worktrees.base.default");

  return (
    <div class="flex h-full min-h-0 flex-col overflow-hidden">
      <div class="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2 text-xs text-neutral-500">
        <GitBranch size={12} aria-hidden="true" />
        <span class="truncate">{branch()}</span>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto">
        <ArbolDeArchivos
          project={props.project}
          session=""
          arbol={ARBOL_DE_VISTA_PREVIA}
          kind="folder"
          visible={props.visible}
          preview={{ baseRef: props.baseRef }}
          crearSinTarea={props.onCrear}
          onAbrir={(ruta) => props.onAbrir(ARBOL_DE_VISTA_PREVIA, ruta, false)}
        />
      </div>
    </div>
  );
}

/** La clave del árbol mientras no hay tarea; el reatado la sustituye. */
const ARBOL_DE_VISTA_PREVIA = ".preview";
