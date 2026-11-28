import { createMemo, For, Show } from "solid-js";
import { t } from "../../../ui/src/lib/i18n";
import type { AgentProfile } from "../../../ui/src/lib/model";
import { Pressable } from "../../../ui/src/Pressable";
import { SignalDot } from "../../../ui/src/SignalDot";
import { AstroAvatar } from "../../../features/projects/src/screens/AstroAvatar";
import { displayName } from "../../../features/projects/src/queries/profiles";
import { agentFolder, type DockAgent } from "./dockLayout";

type DockFolder = { id: string; name: string };

function statusLabel(agent: DockAgent): string {
  if (!agent.status || agent.status === "asleep") return t("projects.sessions.agent_asleep");
  if (agent.status === "working") return agent.liveTasks > 0
    ? t("projects.sessions.agent_working", { count: agent.liveTasks })
    : t("projects.sessions.agent_working_alone");
  return agent.minutesSinceLastTurn != null
    ? t("projects.sessions.agent_awake_since", { minutes: agent.minutesSinceLastTurn })
    : t("projects.sessions.agent_awake");
}

/**
 * Compact overlapping avatar cluster rendered on the right side of the collapsed
 * «Tus agentes» header (Orca style, separated from the title via `justify-between`
 * and paired with the `+` button).
 */
export function AgentCollapsedStrip(props: {
  agents: DockAgent[];
  foldersOf: (name: string) => DockFolder[];
  currentFolder: string | null;
  profileOf?: (name: string) => AgentProfile | undefined;
  onTalk: (project: string, name: string) => void;
}) {
  const visible = createMemo(() =>
    props.agents.filter((agent) => !props.profileOf?.(agent.name)?.hidden).slice(0, 4),
  );
  const label = (name: string) => displayName(name, props.profileOf?.(name));
  const destination = (name: string) => agentFolder(props.foldersOf(name).map((folder) => folder.id), props.currentFolder) ?? "";
  return (
    <Show when={visible().length > 0}>
      <div class="flex shrink-0 items-center" data-agent-collapsed-strip="">
        <For each={visible()}>
          {(agent) => (
            <Pressable
              data-dock-agent-pill={agent.name}
              aria-label={`${label(agent.name)} · ${statusLabel(agent)}`}
              title={`${label(agent.name)} · ${statusLabel(agent)}`}
              class="relative -ml-1.5 grid size-6 shrink-0 place-items-center rounded-full border border-surface bg-surface-muted transition-transform first:ml-0 hover:z-10 hover:scale-105 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-primary"
              onClick={(event) => {
                event.stopPropagation();
                props.onTalk(destination(agent.name), agent.name);
              }}
            >
              <AstroAvatar
                name={agent.name}
                status={agent.status ?? "asleep"}
                body={props.profileOf?.(agent.name)?.body}
                avatar={props.profileOf?.(agent.name)?.avatar}
                size={18}
              />
              <Show when={agent.status === "working"}>
                <SignalDot tone="working" class="absolute -right-0.5 -bottom-0.5 ring-1 ring-surface" />
              </Show>
            </Pressable>
          )}
        </For>
      </div>
    </Show>
  );
}
