import { TEXT } from "@terminus/design";
import { router } from "expo-router";
import { canFinishTask, cardPull, isPinned, type TaskGit } from "@terminus/tasks";
import { useState } from "react";
import { Keyboard, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type Task } from "../lib/engine";
import type { Host } from "../lib/hosts";
import { t } from "../lib/i18n";
import { useTaskGit } from "../lib/useTaskGit";
import { Icon, type IconName } from "./Icon";
import { effectiveGit } from "../lib/taskGit";
import { TaskFinishConfirmation } from "./TaskFinishConfirmation";
import { TaskActions } from "./TaskActions";
import { Sheet, SheetOption } from "./Sheet";
import { useTheme } from "./theme";

const PULL_ICONS: Record<NonNullable<ReturnType<typeof cardPull>>["state"], IconName> = {
  open: "git-pull-request", draft: "git-pull-request-draft", closed: "git-pull-request-closed", merged: "git-merge", merged_other_head: "git-branch",
};

export function TaskHeader(props: {
  title: string;
  hostId: string;
  host?: Host;
  hostOf: (id: string) => Host | undefined;
  workspace: string;
  folder: string;
  id: string;
  task?: Task;
  tasks: Task[];
  running: boolean;
  onFinished: () => void;
  onChanged: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [sheet, setSheet] = useState<"menu" | "details" | "finish" | null>(null);
  const [revision, setRevision] = useState(0);
  const book = useTaskGit(props.hostOf, [{ host: props.hostId, workspace: props.workspace, folder: props.folder, id: props.id }], revision);
  const raw = effectiveGit(book, { ...props.task, id: props.id, host: props.hostId, workspace: props.workspace, folder: props.folder }, props.tasks);
  const on = props.host?.power() === "on" && props.host.canAct() === "now";
  const git: TaskGit | undefined = raw && !on ? { ...raw, stale: true } : raw;
  const pull = cardPull(git ? { ...git, shared_with: null } : git);
  const showFinish = pull?.state === "merged" && !git?.stale;
  const ready = !isPinned(props.task ?? { id: props.id, esperando: false }) && on && canFinishTask(props.task ?? {}, git, props.running);
  const current = git?.pull_known && git.head && git.head === git.pull?.head_sha;
  const checks = current ? git?.pull?.checks ?? "unknown" : "unknown";
  const review = current ? git?.pull?.review ?? "unknown" : "unknown";
  const color = git?.stale ? theme.textMuted : pull?.numberTone === "failure" ? theme.failedMark : pull?.tone === "merged" ? theme.merged : pull?.tone === "open" ? theme.unseenMark : theme.textMuted;
  const state = pull ? t(`task.git.${pull.state}`) : git?.kind === "kn" && git.kn === "saved" ? t("task.git.saved") : t("task.git.unknown");
  const open = (next: "menu" | "details" | "finish") => { Keyboard.dismiss(); setSheet(next); };
  const close = () => setSheet(null);
  return <>
    <View testID="task-header" style={{ paddingTop: insets.top, backgroundColor: theme.surface, borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth }}>
      <View style={styles.bar}>
        <Pressable accessibilityRole="button" accessibilityLabel={t("task.back")} style={styles.icon} onPress={() => router.canGoBack() ? router.back() : router.replace("/")}>
          <Icon name="arrow-left" size={22} color={theme.text} />
        </Pressable>
        <View style={styles.heading}>
          <Pressable onPress={() => open("details")} accessibilityRole="button" accessibilityLabel={props.title} accessibilityHint={t("task.header.details")} style={styles.titleTarget}>
            <Text numberOfLines={1} style={[styles.title, { color: theme.text }]}>{props.title}</Text>
          </Pressable>
          <Pressable style={styles.meta} accessibilityRole="button" accessibilityLabel={`${props.host?.label ?? props.hostId}, ${git?.stale ? t("task.git.stale") : state}`} onPress={() => open("details")}>
            <View style={[styles.dot, { backgroundColor: on ? theme.success : theme.textMuted }]} />
            <Text numberOfLines={1} style={[styles.machine, { color: theme.textMuted }]}>{props.host?.label ?? props.hostId}</Text>
            {pull ? <><Icon name={PULL_ICONS[pull.state]} size={12} color={color} /><Text numberOfLines={1} style={[styles.pull, { color }]}>{`#${pull.number}`} {state}</Text></> : null}
            {current && !git?.stale && checks !== "unknown" && checks !== "none" ? <Icon name={checks === "success" ? "check" : checks === "failure" ? "x" : "clock"} size={12} color={checks === "success" ? theme.success : checks === "failure" ? theme.failedMark : theme.approving} /> : null}
          </Pressable>
        </View>
        {showFinish ? <Pressable testID="task-finish" accessibilityRole="button" accessibilityLabel={t("task.header.finish")} accessibilityState={{ disabled: !ready }} disabled={!ready} onPress={() => open("finish")} style={[styles.icon, styles.rocket, { backgroundColor: theme.muted, opacity: ready ? 1 : 0.4 }]}>
          <Icon name="rocket" size={21} color={theme.merged} />
        </Pressable> : null}
        <Pressable accessibilityRole="button" accessibilityLabel={t("task.actions.menu")} onPress={() => open("menu")} style={styles.icon}>
          <Icon name="ellipsis" size={20} color={theme.textMuted} />
        </Pressable>
      </View>
    </View>
    <Sheet visible={sheet !== null} title={sheet === "finish" ? t("task.header.finish_on", { name: props.host?.label ?? props.hostId }) : t(sheet === "menu" ? "task.actions.menu" : "task.header.details")} onClose={close}>
      <View style={styles.body}>
        <Text selectable style={[styles.fullTitle, { color: theme.text }]}>{props.title}</Text>
        {sheet === "menu" ? <>
          <SheetOption label={t("task.header.details")} onPress={() => open("details")} />
          {showFinish ? <SheetOption label={t("task.header.finish")} icon="rocket" disabled={!ready} onPress={() => open("finish")} /> : null}
          {props.host && props.task ? <TaskActions host={props.host} task={props.task} running={props.running} onRemoved={props.onFinished} onChanged={props.onChanged} /> : null}
        </> : sheet === "details" ? <>
          <Text style={{ color: theme.textMuted }}>{props.host?.label ?? props.hostId}</Text>
          <Text selectable style={{ color: theme.textMuted }}>{git?.branch}</Text>
          <Text style={{ color }}>{pull ? `#${pull.number} · ${state}` : state}</Text>
          {git?.stale ? <Text style={{ color: theme.textMuted }}>{t("task.git.stale")}</Text> : <>
            <Text style={{ color: checks === "failure" ? theme.failedMark : theme.textMuted }}>{t(`task.git.checks.${checks}`)}</Text>
            <Text style={{ color: theme.textMuted }}>{t(`task.git.review.${review}`)}</Text>
          </>}
          {!ready ? <Text style={[styles.description, { color: theme.textMuted }]}>{t("task.header.finish_unavailable")}</Text> : null}
          <SheetOption label={t("task.header.refresh")} disabled={!on} onPress={() => setRevision((n) => n + 1)} />
          {showFinish ? <SheetOption label={t("task.header.finish")} icon="rocket" disabled={!ready} onPress={() => open("finish")} /> : null}
        </> : props.host ? <TaskFinishConfirmation host={props.host} workspace={props.workspace} folder={props.folder} id={props.id} shared={!!git?.shared_with} ready={!!ready} onBlocked={() => setRevision((n) => n + 1)} onFinished={props.onFinished} /> : null}
        <SheetOption label={t(sheet === "finish" ? "task.header.cancel" : "task.header.close")} onPress={close} />
      </View>
    </Sheet>
  </>;
}

const styles = StyleSheet.create({
  bar: { height: 66, flexDirection: "row", alignItems: "center", paddingHorizontal: 4, gap: 2 },
  icon: { width: 44, height: 44, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  rocket: { borderRadius: 12 },
  heading: { flex: 1, minWidth: 0 },
  titleTarget: { minHeight: 28, justifyContent: "center" },
  title: { fontSize: TEXT.lead, fontWeight: "600" },
  meta: { minHeight: 24, flexDirection: "row", alignItems: "center", gap: 5 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  machine: { fontSize: TEXT.caption, flexShrink: 1 },
  pull: { fontSize: TEXT.caption, flexShrink: 1 },
  body: { paddingHorizontal: 20, gap: 12 },
  fullTitle: { fontSize: 17, fontWeight: "600" },
  description: { fontSize: TEXT.body, lineHeight: 21 },
});
