import type { JSX } from "solid-js";
import { AppearanceTab } from "./AppearanceTab.tsx";
import { DownloadsTab } from "./DownloadsTab.tsx";
import { GeneralTab } from "./GeneralTab.tsx";
import { LanguagesTab } from "./LanguagesTab.tsx";
import { NotifyTab } from "./NotifyTab.tsx";
import { WorkspacesTab } from "./WorkspacesTab.tsx";

export interface PreferencesSectionProps {
  tab: string;
  projectName?: string;
  workspaceName?: string;
  slot?: JSX.Element;
}

export function PreferencesSection(props: PreferencesSectionProps) {
  if (props.slot) {
    return <>{props.slot}</>;
  }

  switch (props.tab) {
    case "general":
      return <GeneralTab />;
    case "appearance":
      return <AppearanceTab />;
    case "notify":
      return <NotifyTab />;
    case "languages":
      return <LanguagesTab />;
    case "workspaces":
      return <WorkspacesTab workspaceName={props.workspaceName} />;
    case "download":
      return <DownloadsTab />;
    default:
      return <GeneralTab />;
  }
}
