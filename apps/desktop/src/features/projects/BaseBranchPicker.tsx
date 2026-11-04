import { For, Show, createEffect, createSignal, on, onCleanup } from "solid-js";
import { invoke } from "../../lib/invoke.ts";
import Check from "lucide-solid/icons/check";
import ChevronDown from "lucide-solid/icons/chevron-down";
import RefreshCw from "lucide-solid/icons/refresh-cw";
import GitBranch from "lucide-solid/icons/git-branch";
import { Popover, PopoverContent, PopoverTrigger } from "../../ui/Popover";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Input";
import { prosaDe } from "../../ui/Failure";
import { cn } from "../../lib/utils";
import { manifiesto, t } from "../../lib/i18n";

type Branch = {
  reference: string;
  name: string;
  remote: boolean;
  commit: string;
  ahead: number | null;
  behind: number | null;
};
type Branches = {
  branches: Branch[];
  selected: string | null;
  fetched_at: number | null;
};

export default function BaseBranchPicker(props: {
  project: string;
  directory?: string | null;
  machine?: string | null;
  preference?: boolean;
  /** Quien lo monta ya pinta el rótulo a su lado. */
  inlineLabel?: boolean;
  value?: string | null;
  disabled?: boolean;
  onChange?: (reference: string) => void;
}) {
  const [data, setData] = createSignal<Branches | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [opened, setOpened] = createSignal(false);
  const [query, setQuery] = createSignal("");
  const [scope, setScope] = createSignal("");
  const options = () => props.machine ? { headers: { "x-terminus-machine": props.machine } } : undefined;
  let generation = 0;
  onCleanup(() => {
    generation += 1;
  });
  async function loadDetails(project: string, request: number) {
    try {
      const result = await invoke<Branches>("project_base_branches", {
        project,
        refresh: false,
        details: true,
      }, options());
      if (request !== generation || project !== props.project) return;
      setData((current) => current && ({
        ...current,
        branches: current.branches.map((branch) => {
          const updated = result.branches.find((entry) => entry.reference === branch.reference && entry.commit === branch.commit);
          return updated ? { ...branch, ahead: updated.ahead, behind: updated.behind } : branch;
        }),
      }));
    } catch {
      return;
    }
  }
  async function load(refresh = false) {
    if (busy() || saving()) return;
    const project = props.project;
    const directory = props.directory;
    const request = ++generation;
    setBusy(true);
    setError(null);
    try {
      const result = await invoke<Branches>("project_base_branches", {
        project,
        refresh,
        details: false,
      }, options());
      if (
        request !== generation ||
        project !== props.project ||
        directory !== props.directory
      )
        return;
      setData(result);
      if (opened()) void loadDetails(project, request);
    } catch (e) {
      if (request === generation) setError(prosaDe(e));
    } finally {
      if (request === generation) setBusy(false);
    }
  }
  createEffect(
    on([() => props.project, () => props.directory, () => props.machine], ([project]) => {
      generation += 1;
      setBusy(false);
      setSaving(false);
      setData(null);
      setQuery("");
      setOpened(false);
      if (project) void load();
    }),
  );
  const reference = () => props.value ?? data()?.selected;
  const selected = () => data()?.branches.find((b) => b.reference === reference());
  const missing = () => Boolean(reference()) && Boolean(data()) && !selected();
  const name = () =>
    selected()?.name ??
    reference()?.replace(/^refs\/(heads|remotes)\//, "") ??
    t("worktrees.base.choose");
  async function choose(branch: Branch) {
    const project = props.project;
    const request = ++generation;
    setSaving(true);
    setBusy(true);
    setError(null);
    try {
      if (props.preference)
        await invoke("set_project_base_branch", {
          project,
          reference: branch.reference,
        }, options());
      if (request !== generation || project !== props.project) return;
      if (props.preference)
        setData((d) => (d ? { ...d, selected: branch.reference } : d));
      props.onChange?.(branch.reference);
      setOpened(false);
    } catch (e) {
      if (request === generation && project === props.project) setError(prosaDe(e));
    } finally {
      if (request === generation && project === props.project) {
        setBusy(false);
        setSaving(false);
      }
    }
  }
  const remotes = () => [
    ...new Set(
      data()
        ?.branches.filter((b) => b.remote)
        .map((b) => b.name.split("/")[0]) ?? [],
    ),
  ];
  const matching = () => {
    const q = query().trim().toLowerCase();
    const items =
      data()?.branches.filter(
        (b) =>
          (scope() ? b.reference.startsWith(`refs/remotes/${scope()}/`) : !b.remote) &&
          b.name.toLowerCase().includes(q),
      ) ?? [];
    const rank = (branch: Branch) =>
      branch.reference === reference()
        ? 0
        : branch.reference === data()?.selected
          ? 1
          : ["dev", "main", "develop", "master"].includes(
                branch.name.replace(/^[^/]+\//, ""),
              )
            ? 2
            : 3;
    return items.sort((a, b) => rank(a) - rank(b));
  };
  const fetched = () =>
    data()?.fetched_at
      ? t("worktrees.base.fetched", {
          date: new Date(data()!.fetched_at!).toLocaleString(manifiesto().formato),
        })
      : t("worktrees.base.not_fetched");
  return (
    <div class="grid min-w-0 gap-1">
      <Show when={props.preference && !props.inlineLabel}>
        <span class="px-2 text-xs text-neutral-500">{t("worktrees.base.default")}</span>
      </Show>
      <Popover
        open={opened()}
        onOpenChange={(open) => {
          setOpened(open);
          if (open) {
            setQuery("");
            setScope(
              !missing() && reference()?.startsWith("refs/remotes/")
                ? reference()!.split("/")[2]
                : "",
            );
            void load();
          }
        }}
        placement={props.preference ? "bottom-start" : "top-start"}
        gutter={4}
      >
        <PopoverTrigger
          disabled={props.disabled}
          class={cn(
            "flex min-h-7 min-w-0 max-w-64 items-center gap-1.5 rounded-sm px-1 text-xs outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60",
            missing()
              ? "text-error-strong"
              : "text-neutral-500 hover:text-neutral-950",
          )}
          aria-label={
            props.preference ? t("worktrees.base.default") : t("worktrees.base.from")
          }
          title={missing() ? t("worktrees.error.base_missing") : name()}
        >
          <GitBranch size={13} class="shrink-0" aria-hidden="true" />
          <span class="truncate">{name()}</span>
          <ChevronDown size={11} class="shrink-0" aria-hidden="true" />
        </PopoverTrigger>
        <PopoverContent class="w-72 overflow-hidden p-0">
          <div class="p-2">
            <Input
              aria-label={t("worktrees.base.search")}
              placeholder={t("worktrees.base.search")}
              value={query()}
              onInput={(e) => setQuery(e.currentTarget.value)}
            />
          </div>
          <div class="flex gap-1 overflow-x-auto border-b border-border px-2 pb-2">
            <For each={["", ...remotes()]}>
              {(source) => (
                <button
                  type="button"
                  aria-pressed={scope() === source}
                  class="shrink-0 rounded-md px-2 py-1 text-xs text-neutral-500 outline-none hover:bg-surface-muted aria-pressed:bg-surface-muted aria-pressed:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  onClick={() => setScope(source)}
                >
                  {source || t("worktrees.base.locals")}
                </button>
              )}
            </For>
          </div>
          <div class="max-h-56 overflow-y-auto p-1">
            <For each={matching()}>
              {(branch) => (
                <button
                  type="button"
                  disabled={props.disabled || saving()}
                  aria-pressed={reference() === branch.reference}
                  title={
                    branch.ahead || branch.behind
                      ? t("worktrees.base.divergence", {
                          ahead: branch.ahead ?? 0,
                          behind: branch.behind ?? 0,
                        })
                      : branch.name
                  }
                  class="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs outline-none hover:bg-surface-muted aria-pressed:bg-surface-muted focus-visible:bg-surface-muted"
                  onClick={() => void choose(branch)}
                >
                  <span class="min-w-0 flex-1 truncate">{branch.name}</span>
                  <Show when={reference() === branch.reference}>
                    <Check size={13} class="shrink-0" aria-hidden="true" />
                  </Show>
                </button>
              )}
            </For>
            <Show when={data() && !matching().length}>
              <p class="px-2 text-xs text-neutral-500">{t("worktrees.base.empty")}</p>
            </Show>
          </div>
          <div class="border-t border-border p-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={busy()}
              title={fetched()}
              onClick={() => void load(true)}
            >
              <RefreshCw size={12} aria-hidden="true" />
              {t("worktrees.base.refresh")}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      <Show when={error() ?? (missing() ? t("worktrees.error.base_missing") : null)}>
        {(message) => <span class="px-2 text-xs text-error-strong">{message()}</span>}
      </Show>
    </div>
  );
}
