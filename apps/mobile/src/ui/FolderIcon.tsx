import type { Folder } from "../lib/engine";
import { folderIconName } from "../lib/folderIcon";
import { Icon } from "./Icon";
import { useTheme } from "./theme";

/** La misma iconografía de WorkdirIcon del escritorio, en tinta secundaria. */
export function FolderIcon({ folder, size = 13 }: { folder?: Pick<Folder, "kind" | "cloud"> | null; size?: number }) {
  const theme = useTheme();
  return <Icon name={folderIconName(folder)} size={size} color={theme.textMuted} />;
}
