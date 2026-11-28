import { RADIUS, TEXT } from "@terminus/design";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent } from "react-native";
import { useTheme } from "./theme";

/**
 * Shared card primitive for the mobile navigation drawer (Projects, Agents,
 * Tasks). Gives every section the same visible subtle card background, hairline
 * border, and slot geometry (`leading`, `title`, `subtitle`, `trailing`).
 */
export function SidebarCard({
  leading,
  title,
  subtitle,
  trailing,
  active = false,
  onPress,
  onLongPress,
  accessibilityLabel,
  testID,
}: {
  leading?: ReactNode;
  title: string;
  subtitle?: string | null;
  trailing?: ReactNode;
  active?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const theme = useTheme();
  const baseBg = theme.dark ? "rgba(255,255,255,0.055)" : "rgba(15,23,42,0.038)";
  const activeBg = theme.dark ? "rgba(255,255,255,0.11)" : "rgba(15,23,42,0.075)";
  const pressedBg = theme.dark ? "rgba(255,255,255,0.09)" : "rgba(15,23,42,0.065)";

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: active ? activeBg : pressed ? pressedBg : baseBg,
          borderColor: active ? theme.borderStrong : theme.border,
        },
      ]}
    >
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={styles.body}>
        <Text numberOfLines={1} style={[styles.title, { color: theme.text }]}>
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} style={[styles.subtitle, { color: theme.textMuted }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </Pressable>
  );
}

/**
 * Compact trailing icon button inside a `SidebarCard` (for example `+` on a
 * Project card to immediately start a new task inside that project).
 */
export function SidebarCardAction({
  accessibilityLabel,
  onPress,
  children,
  testID,
}: {
  accessibilityLabel: string;
  onPress: () => void;
  children: ReactNode;
  testID?: string;
}) {
  const theme = useTheme();
  const handlePress = (event: GestureResponderEvent) => {
    event.stopPropagation?.();
    onPress();
  };
  return (
    <Pressable
      testID={testID}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.action,
        {
          backgroundColor: pressed ? theme.text : theme.surface,
          borderColor: theme.border,
        },
      ]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 11,
    paddingVertical: 10,
    minHeight: 46,
  },
  leading: {
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    fontSize: TEXT.body,
    fontWeight: "600",
    lineHeight: 19,
  },
  subtitle: {
    fontSize: TEXT.caption,
    lineHeight: 16,
  },
  trailing: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  action: {
    width: 28,
    height: 28,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
});
