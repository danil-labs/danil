import { type JSX, Match, Show, Switch } from "solid-js";
import SearchPanel from "../chat/SearchPanel";
import { DelegatedPanel, type DelegatedPanelModel } from "../chat/DelegatedTasks";
import type { SearchSurface } from "../chat/ThreadSearch";
import { t } from "../../lib/i18n";
import type { TaskSideMode } from "../../lib/taskFiles";
import { UsagePanel } from "../shell/UsageTool";
import type { Usage } from "../shell/usage";

/** The files window frame. Search, usage and delegated tasks reuse it instead of a second box. */
export function TaskSideShell(props: { mode: TaskSideMode; side: JSX.Element; children: JSX.Element }) {
  return (
    <section data-task-files data-task-side={props.mode}
      class="@container relative flex h-full min-h-0 min-w-0 flex-1 overflow-hidden rounded-lg border border-border bg-surface shadow-md">
      <div class="flex h-full min-h-0 min-w-0 flex-1" classList={{ hidden: props.mode !== "files" }}>
        {props.children}
      </div>
      <Show when={props.mode !== "files"}>
        <div class="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {props.side}
        </div>
      </Show>
    </section>
  );
}

export function TaskSide(props: {
  mode: TaskSideMode;
  search: SearchSurface | undefined;
  usage: { usage: Usage; agent: string; onManage: () => void };
  delegated: () => DelegatedPanelModel | undefined;
}) {
  return (
    <Switch>
      <Match when={props.mode === "search" && props.search}>
        <SearchPanel surface={props.search!} />
      </Match>
      <Match when={props.mode === "usage"}>
        <UsagePanel usage={props.usage.usage} agent={props.usage.agent} onManage={props.usage.onManage} />
      </Match>
      <Match when={props.mode === "delegated"}>
        <Show when={props.delegated()} fallback={<p class="m-0 px-3 py-3 text-xs text-neutral-500">{t("chat.delegation.none")}</p>}>
          <DelegatedPanel model={props.delegated} />
        </Show>
      </Match>
    </Switch>
  );
}
