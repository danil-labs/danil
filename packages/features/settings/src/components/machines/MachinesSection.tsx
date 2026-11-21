import type { JSX } from "solid-js";
import { ActivityTab } from "./ActivityTab.tsx";
import { EnvironmentTab } from "./EnvironmentTab.tsx";
import { MachinesTab } from "./MachinesTab.tsx";

export interface MachinesSectionProps {
  tab: string;
  slot?: JSX.Element;
}

export function MachinesSection(props: MachinesSectionProps) {
  switch (props.tab) {
    case "machines":
      return <MachinesTab slot={props.slot} />;
    case "entorno":
      return <EnvironmentTab />;
    case "activity":
      return <ActivityTab />;
    default:
      return <MachinesTab slot={props.slot} />;
  }
}
