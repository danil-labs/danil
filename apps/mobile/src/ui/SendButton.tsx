import { Platform, Pressable, StyleSheet } from "react-native";
import { Icon } from "./Icon";
import { useTheme } from "./theme";

/** Evita que en web el toque robe el foco del `<textarea>` y colapse el teclado virtual antes del clic. */
export const WEB_TAP_GUARD: Record<string, unknown> = Platform.OS === "web"
  ? { onMouseDown: (e: { preventDefault: () => void }) => e.preventDefault() }
  : {};

export function SendButton({ disabled = false, onPress, label, testID = "send" }: { disabled?: boolean; onPress: () => void; label: string; testID?: string }) {
  const theme = useTheme();
  return <Pressable testID={testID} hitSlop={6} disabled={disabled} onPress={onPress} {...WEB_TAP_GUARD} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} style={[styles.button, { backgroundColor: theme.primary, opacity: disabled ? 0.4 : 1 }]}>
    <Icon name="arrow-up" size={17} color={theme.onPrimary} strokeWidth={2.5} />
  </Pressable>;
}

const styles = StyleSheet.create({
  button: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
});
