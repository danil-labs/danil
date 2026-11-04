import { Text } from "react-native";
import { t } from "../../lib/i18n";
import { PDF_INLINE, PdfPage } from "../chat/Page";
import { useTheme } from "../theme";

/** En la app, el PDF lo dibuja el WebView de iOS; Android no sabe, y se dice. */
export function PdfView({ base64 }: { base64: string; onPage?: (page: number, pages: number) => void }) {
  const theme = useTheme();
  if (PDF_INLINE) return <PdfPage base64={base64} />;
  return <Text style={{ color: theme.textMuted, padding: 20, textAlign: "center" }}>{t("task.files.no_preview")}</Text>;
}
