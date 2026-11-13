import Archive from "lucide-solid/icons/archive";
import Folder from "lucide-solid/icons/folder";
import Plus from "lucide-solid/icons/plus";
import Search from "lucide-solid/icons/search";
import SquarePen from "lucide-solid/icons/square-pen";
import { createEffect, createMemo, createResource, createSignal, For, type JSX, on, Show } from "solid-js";
import { t } from "../../lib/i18n";
import { invoke } from "../../lib/invoke.ts";
import type { Project } from "../../lib/model";
import { type Space, type SpaceRef, spaceName } from "../../lib/spaces";
import { cn } from "../../lib/utils";
import { Dialog, DialogContent, DialogTitle } from "../../ui/Dialog";
import { asFailure, FailureNote } from "../../ui/Failure";
import { Input } from "../../ui/Input";
import type { SessionRow } from "../projects/Sessions";
import { matchesTaskQuery } from "../projects/taskSearch";

export type SearchFilter = "all" | "tasks" | "archived" | "folders" | "actions";
type Group = Exclude<SearchFilter, "all">;


type Archivadas = { tasks: (SessionRow & { folder: string })[]; spaces: SpaceRef[] };

type Result = {
  key: string;
  group: Group;
  title: string;
  detail: string;
  deleted?: boolean;
  run: () => void;
};

const GROUPS: Group[] = ["tasks", "archived", "folders", "actions"];
const ICONS: Record<Group, (p: { size: number }) => JSX.Element> = {
  tasks: SquarePen,
  archived: Archive,
  folders: Folder,
  actions: Plus,
};
// En «Todo» cada grupo enseña unos pocos; con su chip, todos los que coinciden.
const PER_GROUP = 5;
const RECENT = 8;

/**
 * Buscador global (⌘K): tareas del espacio, archivadas, carpetas, acciones y,
 * en la web alfa, las conversaciones del Inbox ya cargadas. Archivadas se lee
 * al abrirlo, nunca al arrancar: `archived_tasks` recorre cada carpeta.
 */
export default function GlobalSearch(props: {
  /** `null` cerrado; si no, el chip con el que abre. */
  open: SearchFilter | null;
  onClose: () => void;
  tasks: { project: string; row: SessionRow }[];
  /** Las carpetas del espacio activo. */
  folders: Project[];
  /** Todas las carpetas, para nombrar la de una archivada. */
  projects: Project[];
  spaces: Space[];
  onOpenTask: (project: string, id: string) => void;
  onOpenFolder: (id: string) => void;
  onNewTask: (folder: string) => void;
}) {
  return (
    <Dialog open={props.open !== null} onOpenChange={(open) => { if (!open) props.onClose(); }}>
      <Show when={props.open}>{(initial) => <Panel {...props} initial={initial()} />}</Show>
    </Dialog>
  );
}

function Panel(props: Parameters<typeof GlobalSearch>[0] & { initial: SearchFilter }) {
  const [text, setText] = createSignal("");
  const [filter, setFilter] = createSignal<SearchFilter>(props.initial);
  const [active, setActive] = createSignal(0);
  const [archived] = createResource(() => invoke<Archivadas>("archived_tasks"));
  const query = () => text().trim();
  // Leer un recurso fallido lanza: un fallo de Archivadas no apaga los demás grupos.
  const archivadas = () => (archived.error ? undefined : archived());
  const chips = (): SearchFilter[] => ["all", "tasks", "archived", "folders", "actions"];

  const folderName = (id: string) => props.projects.find((p) => p.id === id)?.name ?? "";
  const live = (id: string | null | undefined) => props.spaces.find((s) => s.id === id) ?? null;
  const spaceOf = (id: string | null | undefined) => {
    const own = live(id);
    if (own) return spaceName(own);
    const ref = archivadas()?.spaces.find((r) => r.id === id);
    return ref ? spaceName(ref) : "";
  };
  const join = (...parts: string[]) => parts.filter(Boolean).join(" · ");
  const close = (run: () => void) => () => { props.onClose(); run(); };

  const candidates = (group: Group): Result[] => {
    const q = query();
    if (group === "tasks") {
      const rows = props.tasks.filter((x) => matchesTaskQuery([x.row.title, x.row.last_message, x.row.agent, folderName(x.project)], q));
      return [...rows].sort((a, b) => b.row.updated_at - a.row.updated_at).map((x) => ({
        key: `task:${x.row.id}`, group, title: x.row.title, detail: folderName(x.project),
        run: close(() => props.onOpenTask(x.project, x.row.id)),
      }));
    }
    if (group === "archived") {
      return (archivadas()?.tasks ?? [])
        .filter((r) => matchesTaskQuery([r.title, folderName(r.folder), spaceOf(r.space)], q))
        .sort((a, b) => b.updated_at - a.updated_at)
        .map((r) => ({
          key: `archived:${r.id}`, group, title: r.title, detail: join(folderName(r.folder), spaceOf(r.space)),
          deleted: !!r.space && !live(r.space),
          run: close(() => props.onOpenTask(r.folder, r.id)),
        }));
    }
    if (group === "folders") {
      return props.folders.filter((p) => matchesTaskQuery([p.name], q)).map((p) => ({
        key: `folder:${p.id}`, group, title: p.name, detail: "", run: close(() => props.onOpenFolder(p.id)),
      }));
    }
    return props.folders
      .map((p) => ({ p, title: t("search.action.new_task", { name: p.name }) }))
      .filter((x) => matchesTaskQuery([x.title, x.p.name], q))
      .map((x) => ({ key: `new:${x.p.id}`, group, title: x.title, detail: "", run: close(() => props.onNewTask(x.p.id)) }));
  };

  const sections = createMemo(() => {
    const f = filter();
    if (f === "all" && !query()) return [{ group: "tasks" as Group, label: t("search.recent"), results: candidates("tasks").slice(0, RECENT) }];
    return GROUPS.filter((g) => (f === "all" || f === g))
      .map((g) => ({ group: g, label: t(`search.group.${g}`), results: f === "all" ? candidates(g).slice(0, PER_GROUP) : candidates(g) }))
      .filter((s) => s.results.length > 0);
  });
  const flat = createMemo(() => sections().flatMap((s) => s.results));
  createEffect(on([text, filter], () => setActive(0), { defer: true }));
  createEffect(() => { if (active() >= flat().length) setActive(Math.max(0, flat().length - 1)); });

  let list: HTMLDivElement | undefined;
  createEffect(() => {
    const key = flat()[active()]?.key;
    if (key) list?.querySelector<HTMLElement>(`[data-search-key="${CSS.escape(key)}"]`)?.scrollIntoView?.({ block: "nearest" });
  });

  const onKeyDown = (e: KeyboardEvent) => {
    const n = flat().length;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (n) setActive((i) => (i + (e.key === "ArrowDown" ? 1 : n - 1)) % n);
    } else if (e.key === "Enter" && !e.isComposing) {
      // Toda tarea se abre en su propia pestaña: ⌘↵ hace lo mismo que ↵.
      e.preventDefault();
      flat()[active()]?.run();
    }
  };
  const optionId = (key: string) => `global-search-${key.replace(/[^\w-]/g, "_")}`;
  const loadingArchived = () => archived.loading && (filter() === "archived" || filter() === "all");

  return (
    <DialogContent class="mt-[10vh] max-w-[560px] self-start overflow-hidden p-0" data-global-search="">
      <DialogTitle class="sr-only">{t("search.title")}</DialogTitle>
      <div class="flex h-12 items-center gap-2.5 border-b border-border px-3.5">
        <Search size={16} class="shrink-0 text-neutral-500" aria-hidden="true" />
        <Input
          variant="ghost"
          role="combobox"
          aria-expanded="true"
          aria-controls="global-search-list"
          aria-activedescendant={flat()[active()] ? optionId(flat()[active()].key) : undefined}
          aria-label={t("search.placeholder")}
          placeholder={t("search.placeholder")}
          class="h-full min-h-0 flex-1 px-0 py-0 text-sm"
          value={text()}
          onInput={(e) => setText(e.currentTarget.value)}
          onKeyDown={onKeyDown}
        />
        <kbd class="shrink-0 rounded border border-current/20 px-1 font-mono text-xs text-neutral-500">Esc</kbd>
      </div>
      <div class="flex flex-wrap gap-1.5 px-3 pt-2 pb-1" role="group" aria-label={t("search.filters")}>
        <For each={chips()}>
          {(chip) => (
            <button
              type="button"
              data-search-chip={chip}
              aria-pressed={filter() === chip}
              class={cn(
                "h-6 cursor-pointer rounded-full border px-2.5 text-xs outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                filter() === chip
                  ? "border-neutral-950 bg-neutral-950 text-neutral-50"
                  : "border-border bg-transparent text-neutral-500 hover:bg-surface-muted hover:text-neutral-950",
              )}
              onClick={() => setFilter(chip)}
            >
              {t(`search.chip.${chip}`)}
            </button>
          )}
        </For>
      </div>
      <div ref={list} id="global-search-list" role="listbox" aria-label={t("search.results")} class="max-h-[min(60vh,440px)] overflow-y-auto pb-1.5">
        <Show when={archived.error && filter() === "archived"}>
          <div class="px-3.5 py-2"><FailureNote f={asFailure(archived.error)} /></div>
        </Show>
        <For each={sections()}>
          {(section) => (
            <div role="group" aria-label={section.label} data-search-group={section.group}>
              <div class="px-3.5 pt-2.5 pb-1 text-xs font-semibold text-neutral-500" aria-hidden="true">{section.label}</div>
              <For each={section.results}>
                {(r) => {
                  const Icon = ICONS[r.group];
                  const selected = () => flat()[active()]?.key === r.key;
                  return (
                    <div
                      id={optionId(r.key)}
                      role="option"
                      aria-selected={selected()}
                      data-search-key={r.key}
                      class={cn("flex min-w-0 cursor-pointer items-center gap-2.5 px-3.5 py-1.5 text-sm text-neutral-950", selected() && "bg-surface-muted")}
                      onPointerMove={() => { const i = flat().findIndex((x) => x.key === r.key); if (i !== active()) setActive(i); }}
                      onClick={() => r.run()}
                    >
                      <span class="grid size-6 shrink-0 place-items-center rounded-md bg-surface-muted text-neutral-500" aria-hidden="true">
                        <Icon size={13} />
                      </span>
                      <span class="min-w-0 flex-1 truncate" title={r.title}>{r.title}</span>
                      <span class="flex min-w-0 shrink items-center gap-1.5 text-xs text-neutral-500">
                        <Show when={r.detail}><span class="truncate">{r.detail}</span></Show>
                        <Show when={r.deleted}>
                          <span data-deleted-space="" class="shrink-0 rounded-sm border border-dashed border-neutral-500 px-1 leading-4 text-neutral-700">
                            {t("search.deleted_space")}
                          </span>
                        </Show>
                      </span>
                    </div>
                  );
                }}
              </For>
            </div>
          )}
        </For>
        <Show when={flat().length === 0 && !loadingArchived() && !(archived.error && filter() === "archived")}>
          <p role="status" class="m-0 px-3.5 py-4 text-sm text-neutral-500">{query() ? t("search.no_results") : t("search.empty")}</p>
        </Show>
        <Show when={loadingArchived() && filter() === "archived"}>
          <p role="status" class="m-0 px-3.5 py-4 text-sm text-neutral-500">{t("search.loading_archived")}</p>
        </Show>
      </div>
      <div class="flex gap-3.5 border-t border-border px-3.5 py-2 text-xs text-neutral-500" aria-hidden="true">
        <span>{t("search.hint.move")}</span>
        <span>{t("search.hint.open")}</span>
        <span>{t("search.hint.close")}</span>
      </div>
    </DialogContent>
  );
}
