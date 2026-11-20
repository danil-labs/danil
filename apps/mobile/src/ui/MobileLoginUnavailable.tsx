import { Text, View } from "react-native";
import { t, w } from "../lib/i18n";
import { useTheme } from "./theme";

export function MobileLoginUnavailable() {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, padding: 24, justifyContent: "center", gap: 10 }}>
      <Text style={{ color: theme.text, fontSize: 28, fontWeight: "800" }}>{t("signin.title")}</Text>
      <Text testID="signin-unavailable" style={{ color: theme.textMuted }}>{w("web.platform.unavailable")}</Text>
    </View>
  );
}
