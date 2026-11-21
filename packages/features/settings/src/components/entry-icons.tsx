import Bot from "lucide-solid/icons/bot";
import CircleUserRound from "lucide-solid/icons/circle-user-round";
import Folders from "lucide-solid/icons/folders";
import GitBranch from "lucide-solid/icons/git-branch";
import Monitor from "lucide-solid/icons/monitor";
import Plug from "lucide-solid/icons/plug";
import SlidersHorizontal from "lucide-solid/icons/sliders-horizontal";
import Sparkles from "lucide-solid/icons/sparkles";
import type { JSX } from "solid-js";
import type { SettingsEntryId } from "../entries.ts";

export const ICONOS: Record<SettingsEntryId, () => JSX.Element> = {
  account: () => <CircleUserRound size={15} />,
  preferences: () => <SlidersHorizontal size={15} />,
  "ai-accounts": () => <Sparkles size={15} />,
  "source-control": () => <GitBranch size={15} />,
  machines: () => <Monitor size={15} />,
  projects: () => <Folders size={15} />,
  "agents-skills": () => <Bot size={15} />,
  connections: () => <Plug size={15} />,
};
