import { TEXT } from "@terminus/design";
import { taskTitle } from "@terminus/tasks";
import { StyleSheet, Text, View } from "react-native";
import { cardOf, type Marks } from "../lib/cards";
import { taskKey, type Folder, type Task } from "../lib/engine";
import { folderByKey } from "../lib/folderIcon";
import { lang, t } from "../lib/i18n";
import { shortWhen } from "../lib/when";
import { openTask } from "./components";
import { Sheet } from "./Sheet";
import { SidebarCard } from "./SidebarCard";
import { TaskMark } from "./TaskStatus";
import { useTheme } from "./theme";

/**
 * Bottom sheet displaying subtasks delegated by the current task.
 * Opened from the `[⑂]` item of `HeaderToolsDial`; tapping any subtask opens
 * its live thread.
 */
export function TaskSubtasksSheet({
  visible,
  subtasks,
  marks,
  folders,
  machineLabelOf,
  onClose,
}: {
  visible: boolean;
  subtasks: readonly Task[];
  marks: Marks;
  folders: readonly Folder[];
  machineLabelOf: (hostId: string) => string;
  onClose: () => void;
}) {
  const theme = useTheme();
  return (
    <Sheet visible={visible} title={t("task.tools.subtasks_title")} onClose={onClose}>
      <View style={styles.body}>
        {subtasks.length === 0 ? (
          <Text style={[styles.empty, { color: theme.textMuted }]}>{t("task.tools.empty")}</Text>
        ) : (
          subtasks.map((task) => {
            const card = cardOf(task, marks);
            const folder = folderByKey(folders, task.folderKey)?.name ?? (task.folder || null);
            const machine = machineLabelOf(task.host);
            const when = shortWhen(task.last_turn_at ?? task.updated_at, lang);
            const subtitle = [folder, machine].filter(Boolean).join(" · ");
            return (
              <SidebarCard
                key={taskKey(task)}
                testID={`subtask-sheet-${task.id}`}
                title={taskTitle(lang, task) || task.id}
                subtitle={subtitle || undefined}
                leading={<TaskMark state={card.state} />}
                trailing={<Text style={[styles.when, { color: theme.textMuted }]}>{when}</Text>}
                onPress={() => {
                  onClose();
                  openTask(task.host, task.workspace, task.folder, task.id);
                }}
              />
            );
          })
        )}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  empty: {
    fontSize: TEXT.body,
    paddingVertical: 12,
    textAlign: "center",
  },
  when: {
    fontSize: TEXT.caption,
  },
});
