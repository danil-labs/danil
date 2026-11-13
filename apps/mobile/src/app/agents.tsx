import { AgentAvatar } from "../ui/AgentAvatar";
import { dockStatusText, orderDockAgents } from "@terminus/tasks";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text } from "react-native";
import { lang, t, w } from "../lib/i18n";
import { useWorkspaces } from "../lib/workspaces";
import { Row, SheetTitle } from "../ui/components";
import { matches, NoMatch, SearchField } from "../ui/Search";
import { useTheme } from "../ui/theme";

/** «Ver todos» del dock: cada agente con su estado, su chat y sus tareas. */
export default function Agents() {
  const theme = useTheme();
  const { current, snapshot, view, setView } = useWorkspaces();
  const [query, setQuery] = useState("");
  // Sin carpeta de por medio, como el escritorio: solo los del workspace. Los de un
  // proyecto o de su repositorio se ven al trabajar en esa carpeta.
  const label = (a: { name: string; displayName?: string | null }) => a.displayName || a.name;
  const agents = orderDockAgents(
    (snapshot?.agents ?? []).filter((a) => a.workspace),
    label,
  ).filter((a) => matches(query, label(a)) || matches(query, a.name));
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingVertical: 8 }}>
      <SheetTitle>{w("shell.agent_dock.title")}</SheetTitle>
      <SearchField testID="agents-search" value={query} onChange={setQuery} placeholder={t("search.agents")} />
      {query.trim() && !agents.length ? <NoMatch /> : null}
      {agents.map((agent) => (
        <Row
          key={agent.name}
          testID={`agents-${agent.name}`}
          left={<AgentAvatar name={agent.name} size={36} />}
          title={label(agent)}
          subtitle={dockStatusText(lang, agent)}
          onPress={() => {
            router.back();
            if (current) router.push({ pathname: "/agent/[workspace]/[name]", params: { workspace: current.id, name: agent.name } });
          }}
          right={
            <Pressable
              hitSlop={8}
              onPress={() => {
                setView({ ...view, agent: agent.name });
                router.back();
              }}
            >
              <Text style={{ color: theme.primary, fontWeight: "600" }}>{w("shell.agent_dock.see_tasks")}</Text>
            </Pressable>
          }
        />
      ))}
    </ScrollView>
  );
}
