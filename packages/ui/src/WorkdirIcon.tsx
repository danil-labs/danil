import { Match, Switch } from "solid-js";
import { Icon } from "lucide-solid";
import Folder from "lucide-solid/icons/folder";
import FolderGit from "lucide-solid/icons/folder-git-2";
import { t } from "../../../apps/desktop/src/lib/i18n";
import { workdirIconKind } from "./lib/workdirKind";

/** El tipo dicho como lo reconoce la persona: «Código», «Archivos» o «Nube». */
export function workdirKindLabel(kind: string, cloud?: string | null): string {
  const icon = workdirIconKind(kind, cloud);
  if (icon === "git") return t("code.tree.kind.git");
  if (icon === "cloud") return t("code.tree.kind.cloud");
  return t("code.tree.kind.folder");
}

export default function WorkdirIcon(props: {
  kind: string;
  cloud?: string | null;
  size?: number;
  class?: string;
}) {
  const size = () => props.size ?? 14;
  const icon = () => workdirIconKind(props.kind, props.cloud);
  return (
    <Switch fallback={<Folder size={size()} class={props.class} aria-label={t("code.tree.kind.folder")} />}>
      <Match when={icon() === "git"}>
        <FolderGit size={size()} class={props.class} aria-label={t("code.tree.kind.git")} />
      </Match>
      <Match when={icon() === "cloud"}>
        <Icon
          name="folder-cloud"
          iconNode={[
            ["path", { d: "M9 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v4" }],
            ["path", { d: "M19.75 20H15.5a3.5 3.5 0 1 1 3.355-4.5h.895a2.25 2.25 0 1 1 0 4.5Z" }],
          ]}
          size={size()}
          class={props.class}
          aria-label={t("code.tree.kind.cloud")}
        />
      </Match>
    </Switch>
  );
}
