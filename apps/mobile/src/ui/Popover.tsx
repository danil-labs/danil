import { TEXT } from "@terminus/design";
import * as Haptics from "expo-haptics";
import { type RefObject, useEffect, useRef, useState } from "react";
import type { HostInstance } from "react-native";
import { Modal, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, type IconName } from "./Icon";
import { Tap } from "./list";
import { SCRIM, useTheme } from "./theme";

export type Rect = { x: number; y: number; width: number; height: number };

export type MenuItem = {
  key: string;
  label: string;
  icon?: IconName;
  checked?: boolean;
  count?: number;
  destructive?: boolean;
  disabled?: boolean;
  /** Empieza un bloque nuevo, con su separador (Nuevo espacio tras la lista de espacios). */
  section?: boolean;
  onPress: () => void;
};

/** Mide en la ventana la vista a la que se ancla el menú. */
export function measure(ref: RefObject<HostInstance | null>): Promise<Rect | null> {
  return new Promise((resolve) => {
    const node = ref.current;
    if (!node) return resolve(null);
    node.measureInWindow((x, y, width, height) => resolve({ x, y, width, height }));
  });
}

/** Un ancla para un menú: la ref de la vista y el rectángulo abierto (`null` cerrado). */
export function useMenuAnchor() {
  const ref = useRef<HostInstance>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const open = async (haptic = false) => {
    if (haptic && Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setRect(await measure(ref));
  };
  return { ref, rect, open, close: () => setRect(null) };
}

const WIDTH = 260;

/**
 * El menú anclado de la web y de la pulsación larga: en la web, popover con
 * borde y flecha que se cierra tocando fuera o con Esc; en iOS, la superficie
 * elevada con el ícono al final; en Android, el menú de Material con el ícono
 * al principio. Mismo contenido y orden en las tres.
 */
export function Popover({ anchor, items, onClose, align = "start", testID }: { anchor: Rect | null; items: MenuItem[]; onClose: () => void; align?: "start" | "end"; testID?: string }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const screen = useWindowDimensions();
  const web = Platform.OS === "web";
  const ios = Platform.OS === "ios";
  useEffect(() => {
    if (!web || !anchor) return;
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [anchor, onClose, web]);
  if (!anchor) return null;
  const width = Math.min(WIDTH, screen.width - 24);
  const rows = items.length * 46 + items.filter((item) => item.section).length * 8 + 12;
  const below = anchor.y + anchor.height + 8;
  const fitsBelow = below + rows < screen.height - insets.bottom - 8;
  const top = fitsBelow ? below : Math.max(insets.top + 8, anchor.y - rows - 8);
  const left = Math.max(12, Math.min(align === "end" ? anchor.x + anchor.width - width : anchor.x, screen.width - width - 12));
  const arrowLeft = Math.max(14, Math.min(anchor.x + Math.min(anchor.width, 60) / 2 - left - 7, width - 28));
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable testID={testID ? `${testID}-backdrop` : undefined} accessibilityRole="button" accessibilityLabel="close" onPress={onClose} style={[StyleSheet.absoluteFill, { backgroundColor: SCRIM }]} />
      <View
        testID={testID}
        accessibilityRole="menu"
        style={[
          styles.menu,
          { top, left, width, backgroundColor: theme.raised, borderColor: web ? theme.borderStrong : "transparent", borderRadius: Platform.OS === "android" ? 6 : 14 },
          web ? styles.webBorder : null,
        ]}
      >
        {web && fitsBelow ? <View style={[styles.arrow, { left: arrowLeft, backgroundColor: theme.raised, borderColor: theme.borderStrong }]} /> : null}
        {items.map((item, i) => (
          <View key={item.key}>
            {item.section && i > 0 ? <View style={[styles.rule, { backgroundColor: theme.border }]} /> : i > 0 && ios ? <View style={[styles.hair, { backgroundColor: theme.border }]} /> : null}
            <Tap
              testID={testID ? `${testID}-${item.key}` : undefined}
              accessibilityRole="menuitem"
              accessibilityState={{ disabled: item.disabled, checked: item.checked }}
              disabled={item.disabled}
              onPress={() => { onClose(); item.onPress(); }}
              style={[styles.item, { opacity: item.disabled ? 0.45 : 1 }]}
            >
              {item.checked !== undefined ? <View style={styles.check}>{item.checked ? <Icon name="check" size={16} color={theme.text} /> : null}</View> : null}
              {!ios && item.icon ? <Icon name={item.icon} size={17} color={item.destructive ? theme.error : theme.text} /> : null}
              <Text numberOfLines={1} style={[styles.label, { color: item.destructive ? theme.error : theme.text, fontWeight: item.checked ? "600" : "400" }]}>{item.label}</Text>
              {item.count !== undefined ? <Text style={{ color: theme.textMuted, fontSize: TEXT.body }}>{item.count}</Text> : null}
              {ios && item.icon ? <Icon name={item.icon} size={17} color={item.destructive ? theme.error : theme.text} /> : null}
            </Tap>
          </View>
        ))}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  menu: { position: "absolute", paddingVertical: 6, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  webBorder: { borderWidth: 1 },
  arrow: { position: "absolute", top: -7, width: 14, height: 14, borderLeftWidth: 1, borderTopWidth: 1, transform: [{ rotate: "45deg" }] },
  item: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 46, paddingHorizontal: 16 },
  check: { width: 18, alignItems: "center" },
  label: { flex: 1, fontSize: 16 },
  rule: { height: 6, marginVertical: 1, opacity: 0.6 },
  hair: { height: StyleSheet.hairlineWidth, marginLeft: 16 },
});
