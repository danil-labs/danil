import { folderByKey } from "../../../lib/folderIcon";
import { AgentAvatar } from "../../../ui/AgentAvatar";
import { agentFolder, dockStatusText } from "@terminus/tasks";
import { Stack, useLocalSearchParams } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { FlatList, type FlatListProps, StyleSheet, Text, View } from "react-native";
import { cardOf, marksOf } from "../../../lib/cards";
import { createTask, runShell, suggestedDefaults, type Task, taskKey } from "../../../lib/engine";
import { HostError } from "../../../lib/hosts";
import { lang, t, w } from "../../../lib/i18n";
import { useMachines } from "../../../lib/machines";
import { effectiveGit } from "../../../lib/taskGit";
import { useTaskGit } from "../../../lib/useTaskGit";
import { useWorkspaces } from "../../../lib/workspaces";
import { openPreview, openTask } from "../../../ui/components";
import { Composer, type Submission } from "../../../ui/Composer";
import { TaskCard } from "../../../ui/TaskCard";
import { useTheme } from "../../../ui/theme";
import { KeyboardScreen } from "../../../ui/KeyboardScreen";

/** Un agente se lee como un mensaje directo: sus conversaciones y un cuadro para empezar otra. */
export default function AgentScreen() {
  const theme = useTheme();
  const { workspace, name } = useLocalSearchParams<{ workspace: string; name: string }>();
  const { attention, hostOf, preferred, rememberMachine } = useMachines();
  const { snapshot, hostsOfCurrent, current } = useWorkspaces();
  const agent = snapshot?.agents.find((a) => a.name === name);
  const [note, setNote] = useState<string | null>(null);
  const marks = useMemo(() => marksOf(attention, current?.members, snapshot?.live ?? new Set()), [attention, current?.members, snapshot?.live]);
  const tasks = (snapshot?.tasks ?? []).filter((task) => task.agent === name);
  // El PR de la línea 2: git solo de las filas que la lista dice que se ven.
  const [seen, setSeen] = useState<ReadonlySet<string>>(new Set());
  const onSeen = useRef<FlatListProps<Task>["onViewableItemsChanged"]>(({ viewableItems }) => setSeen(new Set(viewableItems.map((v) => v.key)))).current;
  const git = useTaskGit(hostOf, tasks.filter((task) => seen.has(taskKey(task))));
  // En qué máquina se habla con él: la preferida entre las que lo tienen.
  const host = preferred(hostsOfCurrent.filter((h) => agent?.places.some((p) => p.host === h.id)));
  const places = agent?.places.filter((p) => p.host === host?.id).map((p) => p.folder) ?? [];
  const folder = agentFolder(places, null) ?? places[0] ?? null;
  // El id del workspace en esa máquina: la ruta lleva el del grupo.
  const local = host ? (current?.members.get(host.id) ?? workspace) : workspace;

  const defaults = host ? suggestedDefaults(snapshot?.tasks ?? [], host.id, local, name) : { provider: null, model: null };

  async function message(s: Submission) {
    if (!host || folder === null) return false;
    setNote(null);
    try {
      const id = s.shell
        ? (await runShell(host, local, { folder, session: null, command: s.command, provider: s.provider, model: s.model, effort: s.effort, permissionMode: s.permissionMode, agent: name })).session
        : await createTask(host, local, { folder, prompt: s.prompt, provider: s.provider, model: s.model, effort: s.effort, permissionMode: s.permissionMode, attachments: s.attachments, agent: name, space: null });
      rememberMachine(host.id);
      openTask(host.id, local, folder, id, true);
      return true;
    } catch (error) {
      if (error instanceof HostError && error.code === "machine_asleep") setNote(w("web.machines.off_action", { name: host.label }));
      else if (error instanceof HostError && error.code === "machine_outdated") setNote(w("web.machines.outdated_action", { name: host.label }));
      else setNote(t("task.error", { detail: error instanceof Error ? error.message : String(error) }));
      return false;
    }
  }

  return (
    <KeyboardScreen>
      <Stack.Screen options={{ title: name }} />
      <FlatList
        data={tasks}
        keyExtractor={taskKey}
        onViewableItemsChanged={onSeen}
        ListHeaderComponent={
          <View style={[styles.profile, { borderColor: theme.border }]}>
            <AgentAvatar name={name} size={56} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}>{name}</Text>
              {agent ? <Text style={{ color: theme.textMuted }}>{dockStatusText(lang, agent)}</Text> : null}
              {agent?.description ? <Text style={{ color: theme.text }}>{agent.description}</Text> : null}
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <TaskCard
            task={item}
            card={cardOf(item, marks)}
            git={effectiveGit(git, item, snapshot?.tasks ?? [])}
            folderOf={(key) => folderByKey(snapshot?.folders ?? [], key)}
            onPress={() => openTask(item.host, item.workspace, item.folder, item.id)}
            onLongPress={() => openPreview(item.host, item.id)}
            onFinish={() => openPreview(item.host, item.id, "finish")}
            online={hostOf(item.host)?.power() === "on" && hostOf(item.host)?.canAct() === "now"}
          />
        )}
        ListEmptyComponent={<Text style={[styles.empty, { color: theme.textMuted }]}>{t("agent.empty")}</Text>}
      />
      {note ? <Text style={[styles.note, { color: theme.textMuted }]}>{note}</Text> : null}
      <Composer
        testID="agent-composer"
        host={host ?? undefined}
        workspace={host ? local : null}
        folder={folder}
        session={null}
        providers={host ? (snapshot?.providers[host.id] ?? []) : []}
        provider={defaults.provider}
        model={defaults.model}
        permissionMode={current?.defaultPermissionMode ?? null}
        placeholder={t("agent.message", { name })}
        onSubmit={message}
      />
    </KeyboardScreen>
  );
}

const styles = StyleSheet.create({
  profile: { flexDirection: "row", gap: 14, alignItems: "center", padding: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  empty: { padding: 24, textAlign: "center" },
  note: { paddingHorizontal: 16, paddingBottom: 6 },
});
