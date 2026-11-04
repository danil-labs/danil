import { Text } from "react-native";
import { t } from "../../lib/i18n";
import { useTheme } from "../theme";

export type LoadBytes = (onProgress: (done: number, total: number) => void) => Promise<{ bytes: Uint8Array; mime: string }>;

/** La app todavía no trae reproductor: el video y el audio se ven en la web del teléfono. */
export function MediaView(_: { kind: "video" | "audio"; load: LoadBytes }) {
  const theme = useTheme();
  return <Text style={{ color: theme.textMuted, padding: 24, textAlign: "center" }}>{t("task.files.media_web_only")}</Text>;
}
