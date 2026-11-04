import { RADIUS, TEXT } from "@terminus/design";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "./theme";

/** A square with the first letter, like a workspace or a person in Slack. */
export function Avatar({ name, size = 32, round = false }: { name: string; size?: number; round?: boolean }) {
  const theme = useTheme();
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: round ? size / 2 : size / 4, backgroundColor: theme.primary }]}>
      <Text style={{ color: theme.onPrimary, fontWeight: "700", fontSize: size * 0.45 }}>{name.trim().charAt(0).toUpperCase() || "?"}</Text>
    </View>
  );
}

/**
 * El título de una hoja (`formSheet`). En Android la hoja es la del sistema y
 * no pinta la cabecera de la pila: el título va en el contenido. En iOS ya lo
 * pone la cabecera.
 */
export function SheetTitle({ children }: { children: string }) {
  const theme = useTheme();
  if (Platform.OS !== "android") return null;
  return <Text style={[styles.sheetTitle, { color: theme.text }]}>{children}</Text>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <Text style={[styles.section, { color: theme.textMuted }]}>{children}</Text>;
}

export function Row({
  left,
  title,
  subtitle,
  right,
  bold,
  onPress,
  testID,
}: {
  left?: ReactNode;
  title: string;
  subtitle?: ReactNode;
  right?: ReactNode;
  bold?: boolean;
  onPress?: () => void;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [styles.row, { backgroundColor: pressed ? theme.muted : "transparent" }]}>
      {left}
      <View style={styles.rowBody}>
        <Text numberOfLines={1} style={[styles.rowTitle, { color: theme.text, fontWeight: bold ? "700" : "500" }]}>
          {title}
        </Text>
        {typeof subtitle === "string" ? (
          <Text numberOfLines={1} style={{ color: theme.textMuted, fontSize: TEXT.ui }}>
            {subtitle}
          </Text>
        ) : (
          subtitle
        )}
      </View>
      {right}
    </Pressable>
  );
}

export function Badge({ count, color }: { count: number; color?: string }) {
  const theme = useTheme();
  if (!count) return null;
  return (
    <View style={[styles.badge, { backgroundColor: color ?? theme.error }]}>
      <Text style={styles.badgeText}>{count > 99 ? "99+" : count}</Text>
    </View>
  );
}

export function Dot({ color }: { color: string }) {
  return <View style={[styles.dot, { backgroundColor: color }]} />;
}

/** Abre una tarea en la máquina que la corre. Con `replace` ocupa el lugar de la pantalla actual (la de nueva tarea), y «volver» sale al menú. */
export function openTask(host: string, workspace: string, folder: string, id: string, replace = false) {
  const route = { pathname: "/task/[host]/[workspace]/[folder]/[id]", params: { host, workspace, folder: folder || "_", id } } as const;
  if (replace) router.replace(route);
  else router.push(route);
}

/** La vista previa de una tarea (mantener pulsada su tarjeta). */
export function openPreview(host: string, id: string, intent?: "finish") {
  router.push({ pathname: "/preview", params: { host, id, ...(intent ? { intent } : {}) } });
}

const styles = StyleSheet.create({
  avatar: { alignItems: "center", justifyContent: "center" },
  sheetTitle: { fontSize: 20, fontWeight: "700", paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 },
  section: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 6, fontSize: TEXT.ui, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 9 },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 16 },
  badge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" },
  badgeText: { color: "#fff", fontSize: TEXT.label, fontWeight: "700" },
  dot: { width: 8, height: 8, borderRadius: RADIUS.sm },
});
