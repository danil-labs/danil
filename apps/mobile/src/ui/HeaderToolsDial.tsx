import { TEXT } from "@terminus/design";
import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { t } from "../lib/i18n";
import { Icon, type IconName } from "./Icon";
import { useTheme } from "./theme";

const SPRING = { damping: 18, stiffness: 280, mass: 0.75 } as const;
const ITEM_STEP = 42;

export type HeaderDialAction = {
  id: string;
  testID?: string;
  icon: IconName;
  label: string;
  badge?: number;
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
};

/**
 * Right-hand header speed-dial: bare icon trigger (`[⊞]` ↔ `[✕]`) with no
 * background, border, or rounded box, expanding into 3 individual bare vertical
 * icons with staggered spring animation.
 */
export function HeaderToolsDial({
  actions,
  testID = "header-tools-dial",
}: {
  actions: readonly HeaderDialAction[];
  testID?: string;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const triggerProgress = useSharedValue(0);

  useEffect(() => {
    triggerProgress.value = withSpring(open ? 1 : 0, SPRING);
  }, [open, triggerProgress]);

  const toggle = () => {
    if (Platform.OS !== "web") {
      void Haptics.selectionAsync().catch(() => {});
    }
    setOpen((prev) => !prev);
  };

  const close = () => setOpen(false);

  const triggerIconStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(triggerProgress.value, [0, 1], [0, 90])}deg` }],
  }));

  return (
    <View style={styles.anchor} pointerEvents="box-none">
      {open ? (
        <Pressable
          testID="header-tools-backdrop"
          accessibilityRole="button"
          accessibilityLabel={t("task.tools.close_menu")}
          onPress={close}
          style={styles.dismissOverlay}
        />
      ) : null}

      <Pressable
        testID={testID}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={open ? t("task.tools.close_menu") : t("task.tools.open_menu")}
        accessibilityState={{ expanded: open }}
        onPress={toggle}
        style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.5 : 1 }]}
      >
        <Animated.View style={triggerIconStyle}>
          <Icon name={open ? "x" : "layout-grid"} size={22} color={theme.text} />
        </Animated.View>
      </Pressable>

      <View style={styles.stack} pointerEvents={open ? "box-none" : "none"}>
        {actions.map((action, index) => (
          <DialFloatingItem
            key={action.id}
            action={action}
            index={index}
            open={open}
            onSelect={() => {
              close();
              action.onPress();
            }}
          />
        ))}
      </View>
    </View>
  );
}

function DialFloatingItem({
  action,
  index,
  open,
  onSelect,
}: {
  action: HeaderDialAction;
  index: number;
  open: boolean;
  onSelect: () => void;
}) {
  const theme = useTheme();
  const progress = useSharedValue(0);

  useEffect(() => {
    if (open) {
      progress.value = withDelay(index * 42, withSpring(1, SPRING));
    } else {
      progress.value = withDelay((2 - index) * 20, withTiming(0, { duration: 130 }));
    }
  }, [open, index, progress]);

  const animatedStyle = useAnimatedStyle(() => {
    const targetY = (index + 1) * ITEM_STEP;
    return {
      opacity: progress.value,
      transform: [
        { translateY: interpolate(progress.value, [0, 1], [0, targetY]) },
        { scale: interpolate(progress.value, [0, 1], [0.72, 1]) },
      ],
    };
  });

  return (
    <Animated.View style={[styles.itemWrap, animatedStyle]} pointerEvents={open ? "auto" : "none"}>
      <Pressable
        testID={action.testID}
        hitSlop={10}
        disabled={action.disabled}
        accessibilityRole="button"
        accessibilityLabel={action.label}
        accessibilityState={{ selected: action.active, disabled: action.disabled }}
        onPress={onSelect}
        style={({ pressed }) => [
          styles.iconBtn,
          { opacity: action.disabled ? 0.35 : pressed ? 0.5 : 1 },
        ]}
      >
        <Icon
          name={action.icon}
          size={21}
          color={action.active ? theme.primary : theme.text}
        />
        {action.badge && action.badge > 0 ? (
          <View style={[styles.badge, { backgroundColor: theme.text, borderColor: theme.bg }]}>
            <Text style={[styles.badgeText, { color: theme.onPrimary }]}>
              {action.badge > 9 ? "9+" : action.badge}
            </Text>
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: "relative",
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 50,
  },
  dismissOverlay:
    Platform.OS === "web"
      ? ({ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 40 } as object)
      : {
          position: "absolute",
          top: -1000,
          left: -1000,
          right: -1000,
          bottom: -1000,
          zIndex: 40,
        },
  stack: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 28,
    alignItems: "center",
    zIndex: 60,
  },
  itemWrap: {
    position: "absolute",
    top: 0,
    right: 0,
  },
  iconBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 55,
  },
  badge: {
    position: "absolute",
    top: -6,
    right: -7,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    paddingHorizontal: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontSize: TEXT["2xs"],
    fontWeight: "700",
  },
});
