import { TEXT } from "@terminus/design";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { t } from "../lib/i18n";
import { clearError, subscribe } from "../lib/taskQueue";
import { useTheme } from "./theme";

/**
 * Lo que la cola de archivar/finalizar/borrar no pudo hacer o no pudo confirmar.
 * Se queda hasta que la persona lo cierra: es lo único que le dice que una tarea
 * sigue donde estaba.
 */
export function TaskQueueNotice() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [notices, setNotices] = useState<string[]>([]);
  useEffect(() => subscribe((state) => setNotices(state.notices)), []);
  if (notices.length === 0) return null;
  return (
    <View accessibilityLiveRegion="assertive" style={{ position: "absolute", bottom: insets.bottom + 16, left: 16, right: 16, backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1, borderRadius: 10, padding: 14, gap: 8 }}>
      {notices.map((text, index) => (
        <Text key={`${index}:${text}`} style={{ color: theme.text, fontSize: TEXT.label }}>{text}</Text>
      ))}
      <Pressable accessibilityRole="button" accessibilityLabel={t("activity.dismiss")} onPress={clearError} style={{ paddingVertical: 8 }}>
        <Text style={{ color: theme.primary, fontWeight: "600" }}>{t("activity.dismiss")}</Text>
      </Pressable>
    </View>
  );
}
