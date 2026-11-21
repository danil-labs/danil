import Ellipsis from "lucide-solid/icons/ellipsis";
import Folder from "lucide-solid/icons/folder";
import Plus from "lucide-solid/icons/plus";
import { For, Show, type JSX } from "solid-js";
import {
  Button,
  SettingsBlock,
  SettingsPanel,
  SettingsRow,
  SettingsSection,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@danil/ui";

export interface ProjectItem {
  id: string;
  name: string;
  kind: "folder" | "git" | "cloud";
  path: string;
  activeTasks: number;
}

export interface ManageProjectsTabProps {
  projects?: ProjectItem[];
  onAddProject?: () => void;
  onOpenProject?: (id: string) => void;
  onRenameProject?: (id: string) => void;
  onDeleteProject?: (id: string) => void;
}

export function ManageProjectsTab(props: ManageProjectsTabProps) {
  const projectsList = () => props.projects ?? [];

  return (
    <SettingsPanel data-manage-projects="">
      <SettingsSection
        title="Proyectos y carpetas"
        description="Carpetas de código y proyectos vinculados a este espacio de trabajo."
        aside={
          <Button
            size="sm"
            variant="secondary"
            onClick={() => props.onAddProject?.()}
          >
            <Plus size={14} class="mr-1" />
            Añadir proyecto
          </Button>
        }
      >
        <Show
          when={projectsList().length > 0}
          fallback={
            <SettingsBlock>
              <div class="py-8 text-center text-sm text-neutral-500">
                <Folder size={28} class="mx-auto mb-2 text-neutral-400" />
                <p class="m-0 font-medium text-neutral-800">Todavía no hay proyectos</p>
                <p class="m-0 text-xs text-neutral-500 mt-1">
                  Añade una carpeta o clona un repositorio para empezar a trabajar con tus agentes.
                </p>
              </div>
            </SettingsBlock>
          }
        >
          <div class="overflow-x-auto rounded-md border border-border">
            <Table class="w-full text-left text-sm">
              <TableHead>
                <TableRow class="border-b border-border bg-surface-muted text-xs text-neutral-500">
                  <TableHeaderCell class="p-2.5 font-medium">Nombre</TableHeaderCell>
                  <TableHeaderCell class="p-2.5 font-medium">Tipo</TableHeaderCell>
                  <TableHeaderCell class="p-2.5 font-medium">Ubicación</TableHeaderCell>
                  <TableHeaderCell class="p-2.5 font-medium text-right">Tareas</TableHeaderCell>
                  <TableHeaderCell class="p-2.5 w-10 text-right"></TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <For each={projectsList()}>
                  {(p) => (
                    <TableRow class="border-b border-border hover:bg-surface-muted last:border-b-0">
                      <TableCell class="p-2.5 font-medium">{p.name}</TableCell>
                      <TableCell class="p-2.5 text-xs text-neutral-600">{p.kind}</TableCell>
                      <TableCell class="p-2.5 font-mono text-xs text-neutral-500 truncate max-w-xs">
                        {p.path}
                      </TableCell>
                      <TableCell class="p-2.5 text-right tabular-nums text-xs text-neutral-500">
                        {p.activeTasks}
                      </TableCell>
                      <TableCell class="p-2.5 text-right">
                        <Button
                          variant="ghost"
                          size="iconCompact"
                          onClick={() => props.onOpenProject?.(p.id)}
                          aria-label="Acciones"
                        >
                          <Ellipsis size={15} />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )}
                </For>
              </TableBody>
            </Table>
          </div>
        </Show>
      </SettingsSection>
    </SettingsPanel>
  );
}
