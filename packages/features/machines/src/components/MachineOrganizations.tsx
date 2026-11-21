import { For, Show } from "solid-js";
import { Badge } from "../../../../ui/src/Badge";
import type { MachineOrganization } from "../model/merge-by-machine";

/** Las organizaciones de una máquina que está en más de una; con una sola no se dice nada. */
export function MachineOrganizations(props: { organizations?: readonly MachineOrganization[] }) {
  return (
    <Show when={(props.organizations?.length ?? 0) > 1}>
      <For each={props.organizations}>{(o) => <Badge forma="dato" tone="neutral" class="max-w-[120px] truncate" data-machine-organization={o.id}>{o.name}</Badge>}</For>
    </Show>
  );
}
