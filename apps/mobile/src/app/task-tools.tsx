import { folderByKey } from "../lib/folderIcon";
import { delegatedOf } from "@terminus/tasks";
import { useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cardOf, marksOf } from "../lib/cards";
import { taskKey } from "../lib/engine";
import { lang, t } from "../lib/i18n";
import { useMachines } from "../lib/machines";
import { shortWhen } from "../lib/when";
import { useWorkspaces } from "../lib/workspaces";
import { openTask } from "../ui/components";
import { Group, GroupFooter, GroupHeader, NavBar, pageColor } from "../ui/list";
import { TaskCard } from "../ui/TaskCard";
import { useTheme } from "../ui/theme";

/**
 * Herramientas del chat: sus subtareas, cada una con su tarjeta de dos
 * líneas. Viven aquí y en Buscar, nunca anidadas en Inicio. Los archivos
 * de la tarea tienen su propia pantalla (`task-files.tsx`).
 */
export default function TaskToolsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ host: string; workspace: string; folder: string; id: string }>();
  const { attention, hostOf } = useMachines();
  const { current, snapshot } = useWorkspaces();
  const key = `${params.host}/${params.id}`;
  const marks = useMemo(() => marksOf(attention, current?.members, snapshot?.live ?? new Set()), [attention, current?.members, snapshot?.live]);
  const subtasks = [
    ...delegatedOf((snapshot?.delegated ?? []).filter((task) => task.host === params.host && !task.remote_launcher), params.id),
    ...(snapshot?.delegated ?? []).filter((task) => !task.archived && task.remote_launcher === key),
  ].sort((a, b) => b.created_at - a.created_at);

  return (
    <View style={{ flex: 1, backgroundColor: pageColor(theme) }}>
      <NavBar back={t("task.tools.chat")} title={t("task.tools.title")} />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        <GroupHeader count={subtasks.length}>{t("task.tools.subtasks_title")}</GroupHeader>
        <Group inset={46}>
          {subtasks.map((task) => (
            <TaskCard
              key={taskKey(task)}
              task={task}
              card={cardOf(task, marks)}
              folderOf={(key) => folderByKey(snapshot?.folders ?? [], key)}
              when={shortWhen(task.last_turn_at ?? task.updated_at, lang)}
              onPress={() => openTask(task.host, task.workspace, task.folder, task.id)}
              online={hostOf(task.host)?.power() === "on"}
            />
          ))}
        </Group>
        <GroupFooter>{subtasks.length ? t("task.tools.subtasks_note") : t("task.tools.empty")}</GroupFooter>
      </ScrollView>
    </View>
  );
}
