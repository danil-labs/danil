import { dockStatusText, orderDockAgents } from "@terminus/tasks";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { lang, t, w } from "../lib/i18n";
import { useWorkspaces } from "../lib/workspaces";
import { AgentAvatar } from "../ui/AgentAvatar";
import { SheetTitle } from "../ui/components";
import { matches, NoMatch, SearchField } from "../ui/Search";
import { SidebarCard } from "../ui/SidebarCard";
import { useTheme } from "../ui/theme";

/** «Ver todos» del dock: cada agente como `SidebarCard` estilo Orca, con chat y tareas. */
export default function Agents() {
  const theme = useTheme();
  const { current, snapshot, view, setView } = useWorkspaces();
  const [query, setQuery] = useState("");
  const label = (a: { name: string; displayName?: string | null }) => a.displayName || a.name;
  const agents = orderDockAgents(
    (snapshot?.agents ?? []).filter((a) => a.workspace),
    label,
  ).filter((a) => matches(query, label(a), a.name, a.description));

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.content}
    >
      <SheetTitle>{w("shell.agent_dock.title")}</SheetTitle>
      <SearchField testID="agents-search" value={query} onChange={setQuery} placeholder={t("search.agents")} />
      {query.trim() && !agents.length ? <NoMatch /> : null}
      <View style={styles.list}>
        {agents.map((agent) => (
          <SidebarCard
            key={agent.name}
            testID={`agents-${agent.name}`}
            leading={
              <View style={[styles.avatarBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <AgentAvatar name={agent.name} size={28} />
                {agent.status === "working" ? (
                  <View style={[styles.dot, { backgroundColor: theme.success, borderColor: theme.surface }]} />
                ) : null}
              </View>
            }
            title={label(agent)}
            subtitle={agent.description?.trim() || dockStatusText(lang, agent)}
            onPress={() => {
              router.back();
              if (current) {
                router.push({ pathname: "/agent/[workspace]/[name]", params: { workspace: current.id, name: agent.name } });
              }
            }}
            trailing={
              <Pressable
                hitSlop={8}
                onPress={(e) => {
                  e.stopPropagation?.();
                  setView({ ...view, agent: agent.name });
                  router.back();
                }}
              >
                <Text style={{ color: theme.primary, fontWeight: "600" }}>{w("shell.agent_dock.see_tasks")}</Text>
              </Pressable>
            }
          />
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingVertical: 8,
    paddingBottom: 24,
  },
  list: {
    paddingHorizontal: 14,
    paddingTop: 6,
    gap: 8,
  },
  avatarBox: {
    position: "relative",
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    borderWidth: 1.5,
  },
});
