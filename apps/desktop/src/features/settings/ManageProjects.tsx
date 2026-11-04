import Ellipsis from "lucide-solid/icons/ellipsis";
import Plus from "lucide-solid/icons/plus";
import { createSignal, Show } from "solid-js";
import { enfocarYSeleccionar } from "../../lib/focus";
import { t } from "../../lib/i18n";
import { invoke } from "../../lib/invoke.ts";
import { carpetaDeTrabajo, type Project } from "../../lib/model";
import { ubicacionDeProyecto } from "../../lib/projectLocation";
import { PROJECT_NAME_MAX_LENGTH } from "../../lib/projectNames";
import { cn } from "../../lib/utils";
import { isMac } from "../../lib/window";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Input";
import { KeyedList } from "../../ui/KeyedList";
import { ITEM_DE_MENU, Popover, PopoverContent, PopoverTrigger } from "../../ui/Popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "../../ui/Table";
import { workdirIconKind } from "../code/workdirKind";
import WorkdirIcon, { workdirKindLabel } from "../code/WorkdirIcon";
import { SettingsBlock, SettingsPanel, SettingsSection } from "./layout";
import "../../locales/settingsPhrases";

/** Lo que la página necesita de la ventana. Getters: leerlos en `Settings` remontaría el panel. */
export type ContextoDeProyectos = {
  readonly projects: Project[];
  onAdd: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  /** Solo existe con varios espacios, como en el riel. */
  readonly onRemoveFromSpace?: (id: string) => void;
  /** Abre la vista del proyecto, donde se elige el material que lee. */
  onOpenMaterial: (id: string) => void;
};

function ayudaDelTipo(p: Project) {
  const tipo = workdirIconKind(p.kind, p.cloud);
  if (tipo === "git") return t("settings.projects.kind.git_help");
  if (tipo === "cloud") return t("settings.projects.kind.cloud_help");
  return t("settings.projects.kind.folder_help");
}

export default function ManageProjects(props: { contexto: ContextoDeProyectos }) {
  const [menu, setMenu] = createSignal<string | null>(null);
  const [confirmando, setConfirmando] = createSignal<string | null>(null);
  const [renombrando, setRenombrando] = createSignal<string | null>(null);
  const [nombre, setNombre] = createSignal("");

  const revelar = (ruta: string) => void invoke("open_external", { target: ruta }).catch(() => {});

  function FilaDeProyecto(pp: { p: () => Project }) {
    const p = pp.p;
    const ruta = () => carpetaDeTrabajo(p());
    const ubicacion = () => ubicacionDeProyecto(ruta(), p().cloud);

    return (
      <TableRow class="group" data-settings-project={p().id}>
        <TableCell>
          <span class="flex min-w-0 items-center gap-2">
            <Show
              when={renombrando() === p().id}
              fallback={<span class="truncate">{p().name}</span>}
            >
              <form
                class="min-w-0 flex-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  const n = nombre().trim();
                  setRenombrando(null);
                  if (n && n !== p().name) props.contexto.onRename(p().id, n);
                }}
              >
                <Input
                  ref={enfocarYSeleccionar}
                  class="h-7 min-h-7 px-1.5 text-ui"
                  maxlength={PROJECT_NAME_MAX_LENGTH}
                  value={nombre()}
                  data-owns-escape
                  aria-label={t("settings.projects.rename_label", { name: p().name })}
                  onInput={(e) => setNombre(e.currentTarget.value)}
                  onBlur={() => setRenombrando(null)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setRenombrando(null);
                  }}
                />
              </form>
            </Show>
          </span>
        </TableCell>
        <TableCell title={ayudaDelTipo(p())}>
          <span class="flex min-w-0 items-center gap-1.5 text-xs text-neutral-700">
            <WorkdirIcon kind={p().kind} cloud={p().cloud} size={13} class="shrink-0 text-neutral-500" />
            <span class="truncate">{workdirKindLabel(p().kind, p().cloud)}</span>
          </span>
        </TableCell>
        <TableCell>
          <span
            class="block truncate font-mono text-xs text-neutral-500"
            title={ruta() ?? undefined}
          >
            {ubicacion() ?? t("settings.projects.no_location")}
          </span>
        </TableCell>
        <TableCell
          class={cn("text-xs tabular-nums", p().sessions > 0 ? "text-neutral-700" : "text-neutral-500")}
        >
          {p().sessions > 0
            ? t("settings.projects.tasks", { count: p().sessions })
            : t("settings.projects.no_tasks")}
        </TableCell>
        <TableCell class="text-right">
          {/* Una sola `PopoverContent` con dos vistas: cambiarla por otra la
              reposiciona a mitad de una decisión irreversible. */}
          <Popover
            open={menu() === p().id}
            onOpenChange={(abre) => {
              setMenu(abre ? p().id : null);
              if (!abre) setConfirmando(null);
            }}
            placement="bottom-end"
            gutter={4}
          >
            <PopoverTrigger
              as={(disparador: object) => (
                <button
                  {...disparador}
                  class="grid size-6 place-items-center rounded-sm text-neutral-500 outline-none hover:bg-surface-muted hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  aria-label={t("settings.projects.actions", { name: p().name })}
                  aria-haspopup="menu"
                >
                  <Ellipsis size={15} />
                </button>
              )}
            />
            <PopoverContent
              role={confirmando() === p().id ? undefined : "menu"}
              class={confirmando() === p().id ? "w-80 p-3" : "w-56 p-1"}
            >
              <Show
                when={confirmando() === p().id}
                fallback={
                  <>
                    <button
                      role="menuitem"
                      class={ITEM_DE_MENU}
                      onClick={() => {
                        setMenu(null);
                        setNombre(p().name);
                        setRenombrando(p().id);
                      }}
                    >
                      {t("settings.projects.rename")}
                    </button>
                    <Show when={ruta()}>
                      {(r) => (
                        <button
                          role="menuitem"
                          class={ITEM_DE_MENU}
                          onClick={() => {
                            setMenu(null);
                            revelar(r());
                          }}
                        >
                          {isMac()
                            ? t("settings.projects.reveal_finder")
                            : t("settings.projects.reveal_other")}
                        </button>
                      )}
                    </Show>
                    <button
                      role="menuitem"
                      class={ITEM_DE_MENU}
                      onClick={() => {
                        setMenu(null);
                        props.contexto.onOpenMaterial(p().id);
                      }}
                    >
                      {t("settings.projects.material")}
                    </button>
                    <div role="separator" class="my-1 border-t border-border" />
                    <Show when={props.contexto.onRemoveFromSpace}>
                      {(quitar) => (
                        <button
                          role="menuitem"
                          class={ITEM_DE_MENU}
                          onClick={() => {
                            setMenu(null);
                            quitar()(p().id);
                          }}
                        >
                          {t("settings.projects.remove")}
                        </button>
                      )}
                    </Show>
                    <button
                      role="menuitem"
                      class={cn(ITEM_DE_MENU, "text-error-strong")}
                      onClick={() => setConfirmando(p().id)}
                    >
                      {t("settings.projects.delete")}
                    </button>
                  </>
                }
              >
                <p class="m-0 text-sm font-semibold text-neutral-950">
                  {t("settings.projects.delete_title", { name: p().name })}
                </p>
                <p class="mt-1 mb-3 text-xs leading-relaxed text-neutral-700">
                  {p().sessions === 0
                    ? t("settings.projects.delete_empty")
                    : t("settings.projects.delete_with_tasks", { count: p().sessions })}{" "}
                  {t("settings.projects.delete_no_undo")}
                </p>
                <div class="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" class="shrink-0" onClick={() => setMenu(null)}>
                    {t("settings.projects.keep")}
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    class="shrink-0"
                    onClick={() => {
                      setMenu(null);
                      props.contexto.onDelete(p().id);
                    }}
                  >
                    {t("settings.projects.delete")}
                  </Button>
                </div>
              </Show>
            </PopoverContent>
          </Popover>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <SettingsPanel>
      <SettingsSection
        title={t("settings.projects.title")}
        aside={
          <Button variant="secondary" size="sm" onClick={() => props.contexto.onAdd()}>
            <Plus size={14} />
            {t("settings.projects.add")}
          </Button>
        }
        description={t("settings.projects.lead")}
      >
        <SettingsBlock>
          <Show
            when={props.contexto.projects.length > 0}
            fallback={<p class="m-0 text-ui text-neutral-500">{t("settings.projects.empty")}</p>}
          >
            <div class="overflow-x-auto rounded-lg border border-border">
              <Table class="table-fixed">
                <TableHead>
                  <TableRow>
                    <TableHeaderCell class="w-[30%] text-xs tracking-normal normal-case">
                      {t("settings.projects.column.name")}
                    </TableHeaderCell>
                    <TableHeaderCell class="w-[16%] text-xs tracking-normal normal-case">
                      {t("settings.projects.column.kind")}
                    </TableHeaderCell>
                    <TableHeaderCell class="text-xs tracking-normal normal-case">
                      {t("settings.projects.column.location")}
                    </TableHeaderCell>
                    <TableHeaderCell class="w-[14%] text-xs tracking-normal normal-case">
                      {t("settings.projects.column.tasks")}
                    </TableHeaderCell>
                    <TableHeaderCell class="w-12">
                      <span class="sr-only">{t("settings.projects.column.actions")}</span>
                    </TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  <KeyedList each={props.contexto.projects} by={(p) => p.id}>
                    {(p) => <FilaDeProyecto p={p} />}
                  </KeyedList>
                </TableBody>
              </Table>
            </div>
          </Show>
        </SettingsBlock>
      </SettingsSection>
    </SettingsPanel>
  );
}
