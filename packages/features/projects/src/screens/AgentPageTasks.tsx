import { withTaskAncestors, taskIdentity } from "../../../../ui/src/lib/tasks/index.ts";
import Search from "lucide-solid/icons/search";
import { type ComponentProps, createEffect, createMemo, createSignal, For, on, Show } from "solid-js";
import { t } from "../../../../ui/src/lib/i18n";
import { Button } from "../../../../ui/src/Button";
import { Input } from "../../../../ui/src/Input";
import { type FiltroDeTareas, filtrarTareas, primerasRaices } from "../model/agentPageFilters";
import Sessions, { type SessionRow } from "./Sessions";

const PAGINA = 20;

export default function AgentPageTasks(props: {
  context: string;
  tasks: SessionRow[];
  list: Omit<ComponentProps<typeof Sessions>, "sessions" | "onPick" | "groupByAuthor" | "search">;
  onPick: (id: string) => void;
}) {
  const [filtro, setFiltro] = createSignal<FiltroDeTareas>("all");
  const [search, setSearch] = createSignal("");
  const [buscando, setBuscando] = createSignal(false);
  const [paginas, setPaginas] = createSignal(1);
  createEffect(on(() => props.context, () => {
    setFiltro("all");
    setSearch("");
    setBuscando(false);
    setPaginas(1);
  }));
  createEffect(on(filtro, () => setPaginas(1), { defer: true }));

  const de = (f: FiltroDeTareas) => filtrarTareas(props.tasks, f, props.list.vivas, props.list.aprobando);
  const matches = createMemo(() => de(filtro()));
  const contextRows = createMemo(() => withTaskAncestors(props.tasks, matches()));
  const visibles = createMemo(() => search().trim()
    ? { rows: contextRows(), quedan: false }
    : primerasRaices(contextRows(), paginas() * PAGINA));
  const filtros: { id: FiltroDeTareas; label: () => string }[] = [
    { id: "all", label: () => t("projects.agent_tasks.filter_all") },
    { id: "running", label: () => t("projects.agent_tasks.filter_running") },
    { id: "waiting", label: () => t("projects.agent_tasks.filter_waiting") },
    { id: "done", label: () => t("projects.agent_tasks.filter_done") },
  ];

  return <section data-agent-page-tasks class="flex min-w-0 flex-col gap-1">
    <div class="flex h-7 items-center gap-2">
      <h2 class="m-0 text-xs font-semibold text-neutral-700">{t("projects.agent_tasks.launched")}</h2>
      <span class="font-mono text-caption text-neutral-500">{props.tasks.length}</span>
      <Button variant="ghost" size="icon" class="ml-auto size-7 text-neutral-500" aria-pressed={buscando()}
        aria-label={t("projects.agent_tasks.search")} title={t("projects.agent_tasks.search")}
        onClick={() => { setBuscando(!buscando()); if (!buscando()) setSearch(""); }}>
        <Search size={15} />
      </Button>
    </div>
    <Show when={buscando()}>
      <Input type="search" autofocus aria-label={t("projects.agent_tasks.search")} placeholder={t("projects.agent_tasks.search")}
        value={search()} onInput={event => setSearch(event.currentTarget.value)} />
    </Show>
    <div role="group" aria-label={t("projects.agent_tasks.filters")} class="flex flex-wrap gap-1.5 py-1.5">
      <For each={filtros}>{f =>
        <Button variant={filtro() === f.id ? "secondary" : "outline"} size="compact" class="rounded-full"
          aria-pressed={filtro() === f.id} onClick={() => setFiltro(f.id)}>
          {f.label()}
          <span class="font-mono text-caption font-normal text-neutral-500">{de(f.id).length}</span>
        </Button>
      }</For>
    </div>
    <Show when={visibles().rows.length > 0} fallback={<p class="m-0 px-2 py-3 text-sm text-neutral-500">{t("projects.agent_tasks.no_results")}</p>}>
      <Sessions {...props.list} sessions={visibles().rows} matchingIds={filtro() === "all" ? undefined : matches().map(taskIdentity)} onPick={props.onPick} groupByAuthor={false} search={search()} />
    </Show>
    <Show when={visibles().quedan}>
      <Button variant="ghost" size="compact" class="self-start" onClick={() => setPaginas(paginas() + 1)}>
        {t("projects.agent_tasks.show_more")}
      </Button>
    </Show>
  </section>;
}
