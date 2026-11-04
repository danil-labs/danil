import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { t } from "../lib/i18n";
import { reloadApp, watchWebBuild } from "../lib/update";
import { useTheme } from "./theme";

/**
 * Un deploy nuevo de la web del teléfono cuando recargar sola borraría algo
 * (`update.web.ts`). «Para después» solo lo cierra: vuelve con el siguiente
 * deploy o con la siguiente pantalla que ya no exista.
 */
export function UpdateNotice() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [shown, setShown] = useState(false);
  useEffect(() => watchWebBuild(() => setShown(true)), []);
  if (!shown) return null;
  return <View accessibilityLiveRegion="polite" style={{ position: "absolute", top: insets.top + 56, left: 16, right: 16, backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1, borderRadius: 10, padding: 14, gap: 8 }}>
    <Text style={{ color: theme.text, fontWeight: "600" }}>{t("update.title")}</Text>
    <View style={{ flexDirection: "row", gap: 16 }}>
      <Pressable accessibilityRole="button" onPress={reloadApp} style={{ paddingVertical: 8 }}><Text style={{ color: theme.primary, fontWeight: "600" }}>{t("update.reload")}</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={() => setShown(false)} style={{ paddingVertical: 8 }}><Text style={{ color: theme.textMuted }}>{t("update.later")}</Text></Pressable>
    </View>
  </View>;
}
