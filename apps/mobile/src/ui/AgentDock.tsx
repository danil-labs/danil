import { RADIUS, TEXT } from "@terminus/design";
import { type DockAgent, dockCapacity, dockStatusText, orderDockAgents, planDock } from "@terminus/tasks";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AgentAvatar } from "./AgentAvatar";
import { lang, t, w } from "../lib/i18n";
import { Dot } from "./components";
import { useTheme } from "./theme";

const SLOT = 40;
const GAP = 10;

/**
 * El dock de agentes del escritorio, en el teléfono: una fila de caras arriba
 * de la lista, en el mismo orden (trabajando, despiertos, dormidos) y con el
 * mismo reparto de huecos (`planDock`). Tocar una cara abre su chat; mantenerla
 * pulsada filtra la lista por sus tareas (el clic derecho del escritorio).
 * «+k» y «Ver todos» abren la hoja con todos.
 */
export function AgentDock({
  agents,
  selected,
  onTalk,
  onShowTasks,
  onSeeAll,
}: {
  agents: DockAgent[];
  selected: string | null;
  onTalk: (name: string) => void;
  onShowTasks: (name: string) => void;
  onSeeAll: () => void;
}) {
  const theme = useTheme();
  const [capacity, setCapacity] = useState(6);
  if (!agents.length) return null;
  const plan = planDock(orderDockAgents(agents), capacity, { selected });
  const presence = (status: DockAgent["status"]) => (status === "working" ? theme.success : status === "awake" ? theme.info : theme.border);
  return (
    <View style={[styles.dock, { borderColor: theme.border }]} accessibilityLabel={w("shell.agent_dock.title")}>
      <View style={styles.head}>
        <Text style={[styles.title, { color: theme.textMuted }]}>{w("shell.agent_dock.title")}</Text>
        <Pressable hitSlop={8} onPress={onSeeAll} testID="dock-see-all">
          <Text style={[styles.title, { color: theme.textMuted }]}>{w("shell.agent_dock.see_all")} ›</Text>
        </Pressable>
      </View>
      <View style={styles.row} onLayout={(e) => setCapacity(dockCapacity(e.nativeEvent.layout.width, SLOT, GAP))}>
        {plan.shown.map((agent) => (
          <Pressable
            key={agent.name}
            testID={`dock-${agent.name}`}
            accessibilityLabel={`${(agent as { displayName?: string | null }).displayName || agent.name} · ${dockStatusText(lang, agent)}. ${t("dock.long_press")}`}
            onPress={() => onTalk(agent.name)}
            onLongPress={() => onShowTasks(agent.name)}
            style={[styles.slot, selected === agent.name ? { borderColor: theme.primary } : null]}
          >
            <AgentAvatar name={agent.name} size={32} />
            <View style={[styles.presence, { borderColor: theme.bg }]}>
              <Dot color={presence(agent.status)} />
            </View>
            {agent.liveTasks > 0 ? (
              <View style={[styles.count, { backgroundColor: theme.text }]}>
                <Text style={[styles.countText, { color: theme.bg }]}>{agent.liveTasks}</Text>
              </View>
            ) : null}
          </Pressable>
        ))}
        {plan.overflow > 0 ? (
          <Pressable
            style={[styles.slot, styles.more, { backgroundColor: theme.muted }]}
            accessibilityLabel={w("shell.agent_dock.more", { count: plan.overflow })}
            onPress={onSeeAll}
          >
            <Text style={{ color: theme.textMuted, fontWeight: "700" }}>+{plan.overflow}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dock: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 6 },
  head: { flexDirection: "row", justifyContent: "space-between" },
  title: { fontSize: TEXT.label, fontWeight: "600" },
  row: { flexDirection: "row", gap: GAP },
  slot: { width: SLOT, height: SLOT, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "transparent" },
  more: { borderRadius: 12 },
  presence: { position: "absolute", left: 2, bottom: 2, borderWidth: 2, borderRadius: RADIUS.md },
  count: { position: "absolute", right: -2, bottom: -2, borderRadius: RADIUS.lg, paddingHorizontal: 4, minWidth: 16, alignItems: "center" },
  countText: { fontSize: TEXT["2xs"], fontWeight: "700" },
});
