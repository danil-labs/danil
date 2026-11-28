import { router } from "expo-router";
import type { ReactNode } from "react";
import { Keyboard, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type Task } from "../lib/engine";
import type { Host } from "../lib/hosts";
import { t } from "../lib/i18n";
import { Icon } from "./Icon";
import { useTheme } from "./theme";

/**
 * Minimal transparent mobile task header matching Home:
 *   - Same background as the chat (no separate surface color or bottom border).
 *   - No content in the middle.
 *   - Left: bare `=` icon opening the navigation drawer.
 *   - Right: custom bare icon slot (`HeaderToolsDial`).
 */
export function TaskHeader(props: {
  title: string;
  hostId: string;
  host?: Host;
  hostOf: (id: string) => Host | undefined;
  workspace: string;
  folder: string;
  id: string;
  task?: Task;
  tasks: Task[];
  running: boolean;
  onFinished: () => void;
  onChanged: () => void;
  onOpenDrawer?: () => void;
  right?: ReactNode;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View testID="task-header" style={[styles.wrap, { paddingTop: insets.top + 16 }]}>
      <Pressable
        testID="task-header-left"
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={props.onOpenDrawer ? t("drawer.open") : t("task.back")}
        style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.5 : 1 }]}
        onPress={() => {
          Keyboard.dismiss();
          if (props.onOpenDrawer) props.onOpenDrawer();
          else if (router.canGoBack()) router.back();
          else router.replace("/");
        }}
      >
        <Icon name={props.onOpenDrawer ? "menu" : "arrow-left"} size={22} color={theme.text} />
      </Pressable>

      {props.right ?? <View style={styles.iconBtn} />}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
    zIndex: 50,
  },
  iconBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
});
