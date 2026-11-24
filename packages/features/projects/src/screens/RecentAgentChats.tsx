import GitBranch from "lucide-solid/icons/git-branch";
import MessageCircle from "lucide-solid/icons/message-circle";
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import { t } from "../../../../ui/src/lib/i18n";
import { readableSessionTitle, type SessionRow, threadTitle } from "./Sessions";
import { type GitStatus, effectiveTaskGit, watchSessionGit } from "../queries/taskGit";
import { Pressable } from "../../../../ui/src/Pressable";

export default function RecentAgentChats(props: {
  project: string;
  agent: string;
  sessions: SessionRow[];
  onPick: (id: string) => void;
}) {
  const recent = createMemo(() => props.sessions
    .filter(row => row.agent === props.agent && !row.chat_de_agente && !row.subagent
      && !row.archived && row.stage !== "done")
    .sort((a, b) => b.updated_at - a.updated_at)
    .slice(0, 5));
  const [gitRows, setGitRows] = createSignal<Record<string, GitStatus>>({});

  createEffect(() => {
    const watcher = watchSessionGit(props.project);
    createEffect(() => {
      watcher.prioritize(recent().map(row => row.id));
      setGitRows(watcher.rows());
    });
    onCleanup(watcher.release);
  });

  return <Show when={recent().length > 0}>
    <section data-recent-agent-chats class="mt-5 w-full min-w-0">
      <div class="flex h-7 items-center gap-2">
        <h2 class="m-0 text-xs font-semibold text-neutral-700">{t("projects.agent_tasks.recent")}</h2>
        <span class="font-mono text-caption text-neutral-500">{recent().length}</span>
      </div>
      <ul class="m-0 list-none p-0">
        <For each={recent()}>{row => {
          const branch = () => effectiveTaskGit(row, gitRows(), props.sessions).branch;
          return <li class="border-b border-border last:border-b-0">
            <Pressable class="flex h-10 w-full min-w-0 items-center gap-2.5 rounded-md px-1 text-left text-sm text-neutral-950 hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-primary"
              onClick={() => props.onPick(row.id)}>
              <MessageCircle size={15} class="shrink-0 text-neutral-500" aria-hidden="true" />
              <span class="min-w-0 flex-1 truncate">{readableSessionTitle(threadTitle(row))}</span>
              <Show when={branch()}>{name => <span class="flex max-w-[40%] min-w-0 items-center gap-1 text-xs text-neutral-500" title={name()}>
                <GitBranch size={13} class="shrink-0" aria-hidden="true" />
                <span class="truncate">{name()}</span>
              </span>}</Show>
            </Pressable>
          </li>;
        }}</For>
      </ul>
    </section>
  </Show>;
}
