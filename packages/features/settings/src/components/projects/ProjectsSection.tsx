import type { JSX } from "solid-js";
import { ManageProjectsTab } from "./ManageProjectsTab.tsx";
import { SecretsTab } from "./SecretsTab.tsx";

export interface ProjectsSectionProps {
  tab: string;
  slot?: JSX.Element;
}

export function ProjectsSection(props: ProjectsSectionProps) {
  if (props.slot) {
    return <>{props.slot}</>;
  }

  switch (props.tab) {
    case "proyectos":
      return <ManageProjectsTab />;
    case "secrets":
      return <SecretsTab />;
    default:
      return <ManageProjectsTab />;
  }
}
