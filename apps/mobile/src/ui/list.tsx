import { RADIUS, TEXT } from "@terminus/design";
import { router } from "expo-router";
import { Children, type ReactNode } from "react";
import { Platform, Pressable, type PressableProps, type StyleProp, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { t } from "../lib/i18n";
import { Icon, type IconName } from "./Icon";
import { type Theme, useTheme } from "./theme";

/**
 * Las piezas de las listas nativas (diseño «listas nativas v2»): fondo de la
 * página, cabecera con atrás, título grande, grupos con filas de 48 o más y
 * objetivos de 44 o más. Iguales en iOS, Android y la web; solo cambian el
 * atrás (Android: flecha sin texto) y la respuesta al tocar (gris en iOS y la
 * web, ripple en Android, anillo de foco con teclado en la web).
 */

/** En claro la lista va sobre `surface-muted`; en oscuro, sobre el fondo. */
export const pageColor = (theme: Theme) => (theme.dark ? theme.bg : theme.muted);

/** En la web, el anillo de foco solo con teclado (como `:focus-visible`): tocar o hacer clic lo apaga. */
let keyboard = false;
if (Platform.OS === "web" && typeof window !== "undefined") {
  window.addEventListener("keydown", (event) => { if (event.key === "Tab") keyboard = true; }, true);
  window.addEventListener("pointerdown", () => { keyboard = false; }, true);
}

type TapProps = Omit<PressableProps, "style"> & { style?: StyleProp<ViewStyle>; pressedColor?: string };

/** Un `Pressable` con la respuesta de cada plataforma. */
export function Tap({ style, pressedColor, ...props }: TapProps) {
  const theme = useTheme();
  return (
    <Pressable
      android_ripple={Platform.OS === "android" ? { color: theme.border } : undefined}
      style={(state) => {
        const focused = (state as { focused?: boolean }).focused;
        return [
          style,
          Platform.OS !== "android" && state.pressed ? { backgroundColor: pressedColor ?? theme.border } : null,
          Platform.OS === "web" && focused && keyboard ? ({ outlineColor: theme.primary, outlineStyle: "solid", outlineWidth: 2, outlineOffset: -2 } as ViewStyle) : null,
        ];
      }}
      {...props}
    />
  );
}

/** Vuelve a la pantalla anterior; sin historia (una URL abierta directo), a Inicio. */
export function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace("/");
}

/** El botón atrás: en iOS y la web, «‹ Pantalla» en una píldora; en Android, la flecha sola. */
export function BackButton({ label, onPress = goBack }: { label: string; onPress?: () => void }) {
  const theme = useTheme();
  if (Platform.OS === "android") {
    return (
      <Tap testID="back" accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.round} hitSlop={6}>
        <Icon name="arrow-left" size={22} color={theme.text} />
      </Tap>
    );
  }
  return (
    <Tap testID="back" accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={[styles.pill, { backgroundColor: theme.surface, borderColor: theme.border }]} hitSlop={6}>
      <Icon name="chevron-left" size={18} color={theme.text} />
      <Text numberOfLines={1} style={[styles.pillText, { color: theme.text }]}>{label}</Text>
    </Tap>
  );
}

/** Un botón redondo de la cabecera (⋯, +, la ficha del contacto). */
export function RoundButton({ icon, label, onPress, testID }: { icon: IconName; label: string; onPress: () => void; testID?: string }) {
  const theme = useTheme();
  return (
    <Tap testID={testID} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={6} style={[styles.round, { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: StyleSheet.hairlineWidth }]}>
      <Icon name={icon} size={18} color={theme.text} />
    </Tap>
  );
}

/** La cabecera de una pantalla apilada: atrás, un título centrado opcional y lo de la derecha. */
export function NavBar({ back, title, subtitle, right }: { back?: string; title?: string; subtitle?: ReactNode; right?: ReactNode }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.nav, { paddingTop: insets.top + 6 }]}>
      <View style={styles.navSide}>{back !== undefined ? <BackButton label={back} /> : null}</View>
      {title ? (
        <View style={styles.navTitle} pointerEvents="none">
          <Text numberOfLines={1} accessibilityRole="header" style={[styles.navTitleText, { color: theme.text }]}>{title}</Text>
          {typeof subtitle === "string" ? <Text numberOfLines={1} style={{ color: theme.textMuted, fontSize: TEXT.label }}>{subtitle}</Text> : subtitle}
        </View>
      ) : null}
      <View style={[styles.navSide, styles.navRight]}>{right}</View>
    </View>
  );
}

/** El título grande (34) de una pantalla raíz o de una lista. */
export function LargeTitle({ children, note }: { children: string; note?: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.large}>
      <Text accessibilityRole="header" numberOfLines={1} style={[styles.largeText, { color: theme.text }]}>{children}</Text>
      {note}
    </View>
  );
}

/**
 * El rótulo de un grupo: en mayúsculas pequeñas, o en negrita con su número (las secciones de Inicio).
 * Con `folded` y `onToggle` el rótulo se toca para plegar el grupo y lleva un chevron; `right` va
 * junto al chevron (lo que el grupo plegado sigue avisando).
 */
export function GroupHeader({ children, count, strong, right, folded, onToggle, foldLabel }: { children: string; count?: number; strong?: boolean; right?: ReactNode; folded?: boolean; onToggle?: () => void; foldLabel?: string }) {
  const theme = useTheme();
  const label = (
    <Text accessibilityRole={onToggle ? undefined : "header"} numberOfLines={2} style={strong ? [styles.strongText, { color: theme.text }] : [styles.capsText, { color: theme.textMuted }]}>
      {strong ? children : children.toLocaleUpperCase()}
      {count !== undefined ? <Text style={{ color: theme.textMuted, fontWeight: "500", fontSize: strong ? 14 : 12 }}>{`  ${count}`}</Text> : null}
    </Text>
  );
  if (!onToggle) {
    return (
      <View style={[styles.groupHeader, strong ? styles.groupHeaderStrong : null]}>
        {label}
        {right}
      </View>
    );
  }
  return (
    <Tap
      accessibilityRole="button"
      accessibilityState={{ expanded: !folded }}
      accessibilityLabel={foldLabel}
      onPress={onToggle}
      style={[styles.groupHeader, strong ? styles.groupHeaderStrong : null, styles.groupHeaderTap]}
    >
      <View style={styles.groupHeaderLabel}>
        <Icon name={folded ? "chevron-right" : "chevron-down"} size={16} color={theme.textMuted} />
        {label}
      </View>
      {right}
    </Tap>
  );
}

/** La nota debajo de un grupo. */
export function GroupFooter({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <Text style={[styles.footer, { color: theme.textMuted }]}>{children}</Text>;
}

/** Un grupo con esquinas redondeadas; las filas se separan con una línea que empieza tras el ícono. */
export function Group({ children, inset = 16, style }: { children: ReactNode; inset?: number; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  const rows = Children.toArray(children).filter(Boolean);
  if (!rows.length) return null;
  return (
    <View style={[styles.group, { backgroundColor: theme.surface }, style]}>
      {rows.map((row, i) => (
        <View key={i}>
          {i > 0 ? <View style={[styles.separator, { marginLeft: inset, backgroundColor: theme.border }]} /> : null}
          {row}
        </View>
      ))}
    </View>
  );
}

/** El cuadrado de color con su ícono blanco, al principio de una fila. */
export function IconTile({ icon, color, size = 28 }: { icon: IconName; color: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 4, backgroundColor: color, alignItems: "center", justifyContent: "center" }}>
      <Icon name={icon} size={size * 0.6} color="#ffffff" />
    </View>
  );
}

/** El número en un círculo ámbar: lo que te necesita (Inbox). */
export function CountBadge({ count, color }: { count: number; color?: string }) {
  const theme = useTheme();
  if (!count) return null;
  const tone = color ?? theme.approving;
  return (
    <View style={[styles.count, { backgroundColor: `${tone}33` }]}>
      <Text style={{ color: theme.text, fontSize: TEXT.label, fontWeight: "600" }}>{count > 99 ? "99+" : count}</Text>
    </View>
  );
}

export function ListRow({
  left,
  icon,
  title,
  subtitle,
  value,
  right,
  chevron,
  destructive,
  muted,
  onPress,
  onLongPress,
  disabled,
  testID,
  accessibilityLabel,
}: {
  left?: ReactNode;
  icon?: { name: IconName; color: string };
  title: string;
  subtitle?: ReactNode;
  value?: string;
  right?: ReactNode;
  chevron?: boolean;
  destructive?: boolean;
  muted?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const theme = useTheme();
  const body = (
    <>
      {icon ? <IconTile icon={icon.name} color={muted ? theme.textMuted : icon.color} /> : left}
      <View style={styles.rowBody}>
        <Text numberOfLines={1} style={[styles.rowTitle, { color: destructive ? theme.error : muted ? theme.textMuted : theme.text }]}>{title}</Text>
        {typeof subtitle === "string" ? <Text numberOfLines={1} style={{ color: theme.textMuted, fontSize: TEXT.ui }}>{subtitle}</Text> : subtitle}
      </View>
      {value ? <Text numberOfLines={1} style={[styles.value, { color: theme.textMuted }]}>{value}</Text> : null}
      {right}
      {chevron ? <Icon name="chevron-right" size={16} color={theme.textMuted} /> : null}
    </>
  );
  if (!onPress && !onLongPress) return <View testID={testID} style={styles.row}>{body}</View>;
  return (
    <Tap
      testID={testID}
      accessibilityRole={chevron ? "link" : "button"}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={[styles.row, { opacity: disabled ? 0.5 : 1 }]}
    >
      {body}
    </Tap>
  );
}

/** El control segmentado (Tema, Mantener despierta). */
export function Segmented<T extends string>({ options, value, onChange, testID, style }: { options: { value: T; label: string; icon?: IconName }[]; value: T | null; onChange: (value: T) => void; testID?: string; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return (
    <View testID={testID} accessibilityRole="radiogroup" style={[styles.segmented, { backgroundColor: theme.muted }, style]}>
      {options.map((option) => {
        const on = option.value === value;
        return (
          <Tap
            key={option.value}
            testID={testID ? `${testID}-${option.value}` : undefined}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            onPress={() => onChange(option.value)}
            pressedColor="transparent"
            style={[styles.segment, on ? { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: StyleSheet.hairlineWidth } : null]}
          >
            {option.icon ? <Icon name={option.icon} size={14} color={on ? theme.text : theme.textMuted} /> : null}
            <Text numberOfLines={1} style={{ color: on ? theme.text : theme.textMuted, fontWeight: on ? "600" : "500", fontSize: TEXT.ui, flexShrink: 1 }}>{option.label}</Text>
          </Tap>
        );
      })}
    </View>
  );
}

/** Un chip de filtro (Buscar, Inbox): el elegido, oscuro. */
export function Chip({ label, count, active, onPress, testID }: { label: string; count?: number; active: boolean; onPress: () => void; testID?: string }) {
  const theme = useTheme();
  return (
    <Tap
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.chip, active ? { backgroundColor: theme.text, borderColor: theme.text } : { backgroundColor: theme.surface, borderColor: theme.border }]}
    >
      <Text style={{ color: active ? theme.onPrimary : theme.text, fontSize: TEXT.body, fontWeight: "500" }}>
        {label}
        {count ? <Text style={{ color: active ? theme.border : theme.textMuted }}>{`  ${count}`}</Text> : null}
      </Text>
    </Tap>
  );
}

/** «Pronto»: una sección que todavía no existe. */
export function SoonTag() {
  const theme = useTheme();
  return (
    <View style={[styles.soon, { backgroundColor: theme.muted }]}>
      <Text style={{ color: theme.textMuted, fontSize: TEXT.caption, fontWeight: "600" }}>{t("lists.soon")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  nav: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 8, minHeight: 52, gap: 8 },
  navSide: { minWidth: 44, flexDirection: "row", alignItems: "center" },
  navRight: { marginLeft: "auto", justifyContent: "flex-end", gap: 8 },
  navTitle: { position: "absolute", left: 112, right: 112, bottom: 8, alignItems: "center" },
  navTitleText: { fontSize: 16, fontWeight: "700" },
  pill: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 40, paddingLeft: 10, paddingRight: 14, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, maxWidth: 160 },
  pillText: { fontSize: TEXT.lead, fontWeight: "500", flexShrink: 1 },
  round: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  large: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 8, gap: 4 },
  largeText: { fontSize: 34, fontWeight: "800", letterSpacing: -0.5 },
  groupHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 32, paddingTop: 18, paddingBottom: 6 },
  groupHeaderStrong: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 8 },
  groupHeaderTap: { minHeight: 44 },
  groupHeaderLabel: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 },
  capsText: { fontSize: 12.5, fontWeight: "600", letterSpacing: 0.4, flexShrink: 1 },
  strongText: { fontSize: 19, fontWeight: "700", flexShrink: 1 },
  footer: { paddingHorizontal: 32, paddingTop: 8, fontSize: TEXT.ui, lineHeight: 18 },
  group: { marginHorizontal: 16, borderRadius: 14, overflow: "hidden" },
  separator: { height: StyleSheet.hairlineWidth },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48, paddingHorizontal: 16, paddingVertical: 8 },
  rowBody: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { fontSize: 16 },
  value: { fontSize: 16, maxWidth: "50%" },
  count: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" },
  segmented: { flexDirection: "row", borderRadius: 10, padding: 3, marginHorizontal: 16 },
  segment: { flex: 1, minHeight: 38, borderRadius: RADIUS.lg, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: 2 },
  chip: { minHeight: 36, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, justifyContent: "center" },
  soon: { borderRadius: RADIUS.md, paddingHorizontal: 7, paddingVertical: 2 },
});
