import { Show } from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import type { Agent } from "../../../../ui/src/lib/model";
import type { TranscriptOrigin } from "../model/transcript";

/** De dónde sale lo que dijo el agente en una tarea archivada. */
export default function TranscriptSource(props: { origin: TranscriptOrigin | null; agents: Agent[] }) {
  const label = (id: string) => props.agents.find((a) => a.id === id)?.label ?? id;
  return (
    <p class="m-0 w-full max-w-[860px] px-3 pb-1 text-xs text-neutral-500" title={props.origin?.file}>
      <Show when={props.origin} fallback={t("chat.transcript.saved")}>
        {(o) => t("chat.transcript.cli", { agent: label(o().provider), from: o().from_cli, count: o().agent_turns })}
      </Show>
    </p>
  );
}
