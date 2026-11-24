import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import FolderOpen from "lucide-solid/icons/folder-open";
import GitBranch from "lucide-solid/icons/git-branch";
import Plus from "lucide-solid/icons/plus";
import Search from "lucide-solid/icons/search";
import ChevronRight from "lucide-solid/icons/chevron-right";
import { listProjectRepositories, getGitHostAreas, getGitHostProjects } from "../queries";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { enfocar } from "../../../../ui/src/lib/focus";
import { mergeRepositories, repositoryCloneUrl, repositoryIdentity, type ProjectRepository } from "../model/projectRepositories";
import { MarcaGitHost } from "../../../../ui/src/icons";
import { listGitHosts, type GitHost } from "../../../../session/src/gitHosts";
import { Input } from "../../../../ui/src/Input";
import { Button } from "../../../../ui/src/Button";
import { Select } from "../../../../ui/src/Select";
import { FailureNote, asFailure, type Failure } from "../../../../ui/src/Failure";
import { Pressable } from "../../../../ui/src/Pressable";

type Provider = GitHost & { connected: { identity: { user: string } } | null };
type AvailableRepository = ProjectRepository & { area: string };

export default function RepositoryPicker(props: {
  workspace: string;
  disabled: boolean;
  onUrl: () => void;
  /** Sin él no se ofrece una carpeta del disco: en otra máquina el diálogo nativo daría una ruta de esta. */
  onFolder?: () => void;
  /** Sin él no se ofrece empezar vacía: la fuente de contexto del alta no crea carpetas. */
  onEmpty?: () => void;
  onRepository: (repo: ProjectRepository) => void;
}) {
  const [query, setQuery] = createSignal("");
  const [provider, setProvider] = createSignal<string | null>(null);
  const [providers, setProviders] = createSignal<Provider[]>([]);
  const [area, setArea] = createSignal("");
  const [history, setHistory] = createSignal<ProjectRepository[]>([]);
  const [available, setAvailable] = createSignal<AvailableRepository[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [failures, setFailures] = createSignal<Failure[]>([]);
  let active = true;
  let list: HTMLDivElement | undefined;
  onCleanup(() => { active = false; });

  const fail = (error: unknown) => { if (active) setFailures(previous => [...previous, asFailure(error)]); };
  onMount(() => {
    const scope = props.workspace;
    const local = listProjectRepositories(scope)
      .then(repos => { if (active) setHistory(repos); }).catch(fail);
    const remote = (async () => {
      const connections = await listGitHosts<Provider>(scope);
      if (!active) return;
      setProviders(connections);
      await Promise.all(connections.filter(p => p.connected).map(async p => {
        try {
          const areas = await getGitHostAreas(p.id, scope);
          for (const a of areas) {
            if (!active) return;
            try {
              const repos = await getGitHostProjects({ id: p.id, area: a.key, scope, includeSkills: true });
              if (active) setAvailable(previous => [...previous, ...repos.filter(r => r.clone_url).map(r => ({
                name: repositoryIdentity(r.clone_url).split("/").slice(1).join("/") || `${a.name}/${r.slug || r.name}`, url: repositoryCloneUrl(r.clone_url), git_host: p.id, area: a.key, last_used: 0,
              }))]);
            } catch (error) { fail(error); }
          }
        } catch (error) { fail(error); }
      }));
    })().catch(fail);
    void Promise.all([local, remote]).finally(() => { if (active) setLoading(false); });
  });

  const choices = () => [
    { id: "url", name: t("projects.add.git_url"), detail: t("projects.add.git_url_help"), run: props.onUrl },
    ...providers().filter(p => p.connected).map(p => ({ id: p.id, name: p.name, host: true,
      detail: p.connected?.identity.user ?? "",
      run: () => { setProvider(p.id); setArea(""); setQuery(""); },
    })),
    ...(props.onFolder ? [{ id: "folder", name: t("projects.add.browse"), detail: t("projects.add.browse_help"), run: props.onFolder }] : []),
    ...(props.onEmpty ? [{ id: "empty", name: t("projects.add.empty"), detail: t("projects.add.empty_help"), run: props.onEmpty }] : []),
  ];
  const visibleChoices = () => choices().filter(c => c.name.toLowerCase().includes(query().trim().toLowerCase()));
  const areas = createMemo(() => [...new Set(available().filter(r => r.git_host === provider()).map(r => r.area))]);
  const repositories = createMemo(() => mergeRepositories(history(), available(), query()).filter(r => {
    if (!provider()) return !query().trim() ? r.last_used > 0 : true;
    return r.git_host === provider() && (!area() || available().some(a => a.area === area() && a.url === r.url));
  }));
  const recent = () => repositories().filter(r => r.last_used > 0);
  const accessible = () => repositories().filter(r => !r.last_used);
  const selectedProvider = () => providers().find(p => p.id === provider());

  function navigate(event: KeyboardEvent) {
    if (!["ArrowDown", "ArrowUp", "Enter"].includes(event.key) || event.target instanceof HTMLSelectElement) return;
    const buttons = [...(list?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
    if (!buttons.length) return;
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Enter") {
      if (current === -1 && event.target instanceof HTMLInputElement) { event.preventDefault(); buttons[0].click(); }
      return;
    }
    event.preventDefault();
    buttons[(current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
  }

  function RepositoryRows(section: { repositories: ProjectRepository[] }) {
    return <For each={section.repositories}>{repo => <Pressable disabled={props.disabled}
      class="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left hover:bg-surface-muted focus-visible:bg-surface-muted"
      onClick={() => props.onRepository({ ...repo, git_host: providers().some(p => p.id === repo.git_host && p.connected) && repo.url.startsWith("https://") ? repo.git_host : null })}>
      <Show when={repo.git_host} fallback={<GitBranch size={18} class="text-neutral-500" />}><MarcaGitHost id={repo.git_host ?? ""} size={18} /></Show>
      <span class="min-w-0 flex-1"><span class="block truncate text-ui">{repo.name}</span>
        <span class="block truncate text-xs text-neutral-500">{repo.local_path ? t("projects.add.on_this_machine", { path: repo.local_path }) : repo.url}</span></span>
      <ChevronRight size={14} class="shrink-0 text-neutral-500" />
    </Pressable>}</For>;
  }

  // Una sola columna que no crece con su contenido: con `auto`, la URL más
  // larga de la lista (aunque se recorte) fijaba el ancho mínimo y el buscador
  // y el selector de área se salían del modal.
  return <div class="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2" onKeyDown={navigate}>
    <div class="relative">
      <Search size={15} class="pointer-events-none absolute left-3 top-3 text-neutral-500" />
      <Input ref={enfocar} class="pl-9" placeholder={t("projects.add.search_project")} aria-label={t("projects.add.search_project")}
        value={query()} onInput={e => setQuery(e.currentTarget.value)} disabled={props.disabled} />
    </div>
    <Show when={provider()}>
      <div class="flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={() => { setProvider(null); setArea(""); setQuery(""); }}>{t("projects.add.back")}</Button>
        <MarcaGitHost id={provider() ?? "git"} size={16} /><span class="text-xs">{selectedProvider()?.name}</span>
        <Show when={areas().length > 0}>
          <Select class="ml-auto max-w-[220px]" aria-label={t("projects.add.repository_area")} onChange={e => setArea(e.currentTarget.value)}>
            <option value="">{t("projects.add.all_areas")}</option><For each={areas()}>{a => <option value={a}>{a}</option>}</For>
          </Select>
        </Show>
      </div>
    </Show>
    <div ref={list} class="flex max-h-[min(520px,65vh)] flex-col">
      <Show when={!provider()}><div class="shrink-0">
        <For each={visibleChoices()}>{choice => <Pressable disabled={props.disabled}
          class="flex w-full items-center gap-3 rounded-md px-3 py-3 text-left hover:bg-surface-muted focus-visible:bg-surface-muted" onClick={choice.run}>
          <Show when={choice.id === "url"}><GitBranch size={18} class="text-neutral-500" /></Show>
          <Show when={"host" in choice}><MarcaGitHost id={choice.id} size={18} /></Show>
          <Show when={choice.id === "folder"}><FolderOpen size={18} class="text-neutral-500" /></Show>
          <Show when={choice.id === "empty"}><Plus size={18} class="text-neutral-500" /></Show>
          <span class="text-ui">{choice.name}</span><span class="ml-auto max-w-[50%] truncate text-xs text-neutral-500">{choice.detail}</span>
        </Pressable>}</For>
      </div></Show>
      <Show when={recent().length}><p class="mb-1 mt-3 shrink-0 px-3 text-xs text-neutral-500">{t("projects.add.workspace_history")}</p>
        <div class="min-h-[96px] flex-1 overflow-y-auto"><RepositoryRows repositories={recent()} /></div></Show>
      <Show when={accessible().length}><p class="mb-1 mt-3 shrink-0 px-3 text-xs text-neutral-500">{t("projects.add.accessible_repositories")}</p>
        <div class="min-h-[96px] flex-1 overflow-y-auto"><RepositoryRows repositories={accessible()} /></div></Show>
      <Show when={!loading() && !repositories().length && (provider() || !visibleChoices().length)}>
        <p class="px-3 py-4 text-xs text-neutral-500">{t("projects.add.no_repositories")}</p>
      </Show>
    </div>
    <Show when={loading()}><p role="status" class="m-0 text-xs text-neutral-500">{t("projects.add.loading_repositories")}</p></Show>
    <For each={failures()}>{failure => <FailureNote f={failure} />}</For>
  </div>;
}
