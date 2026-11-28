import { TEXT } from "@terminus/design";
import { canFinishTask, cardPull, isPinned, type TaskGit } from "@terminus/tasks";
import { router } from "expo-router";
import { useState, type ReactNode } from "react";
import { Keyboard, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type Task } from "../lib/engine";
import type { Host } from "../lib/hosts";
import { t } from "../lib/i18n";
import { effectiveGit } from "../lib/taskGit";
import { useTaskGit } from "../lib/useTaskGit";
import { Icon, type IconName } from "./Icon";
import { Sheet, SheetOption } from "./Sheet";
import { TaskActions } from "./TaskActions";
import { TaskFinishConfirmation } from "./TaskFinishConfirmation";
import { useTheme } from "./theme";

const PULL_ICONS: Record<NonNullable<ReturnType<typeof cardPull>>["state"], IconName> = {
  open: "git-pull-request",
  draft: "git-pull-request-draft",
  closed: "git-pull-request-closed",
  merged: "git-merge",
  merged_other_head: "git-branch",
};

/**
 * Minimal 2-button mobile task header:
 *   - Left: `=` button opening the navigation drawer (falls back to back if no `onOpenDrawer`).
 *   - Center: tappable task title + machine/PR meta opening the Task Details/Menu sheet.
 *   - Right: custom `right` slot (`HeaderToolsDial` with Search / Subtasks / Files).
 */
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
  onOpenDrawer?: () => void;
  right?: ReactNode;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [sheet, setSheet] = useState<"menu" | "details" | "finish" | null>(null);
  const [revision, setRevision] = useState(0);
  const book = useTaskGit(
    props.hostOf,
    [{ host: props.hostId, workspace: props.workspace, folder: props.folder, id: props.id }],
    revision,
  );
  const raw = effectiveGit(
    book,
    { ...props.task, id: props.id, host: props.hostId, workspace: props.workspace, folder: props.folder },
    props.tasks,
  );
  const on = props.host?.power() === "on" && props.host.canAct() === "now";
  const git: TaskGit | undefined = raw && !on ? { ...raw, stale: true } : raw;
  const pull = cardPull(git ? { ...git, shared_with: null } : git);
  const showFinish = pull?.state === "merged" && !git?.stale;
  const ready =
    !isPinned(props.task ?? { id: props.id, esperando: false }) &&
    on &&
    canFinishTask(props.task ?? {}, git, props.running);
  const current = git?.pull_known && git.head && git.head === git.pull?.head_sha;
  const checks = current ? (git?.pull?.checks ?? "unknown") : "unknown";
  const review = current ? (git?.pull?.review ?? "unknown") : "unknown";
  const color = git?.stale
    ? theme.textMuted
    : pull?.numberTone === "failure"
      ? theme.failedMark
      : pull?.tone === "merged"
        ? theme.merged
        : pull?.tone === "open"
          ? theme.unseenMark
          : theme.textMuted;
  const state = pull
    ? t(`task.git.${pull.state}`)
    : git?.kind === "kn" && git.kn === "saved"
      ? t("task.git.saved")
      : t("task.git.unknown");
  const open = (next: "menu" | "details" | "finish") => {
    Keyboard.dismiss();
    setSheet(next);
  };
  const close = () => setSheet(null);

  return (
    <>
      <View
        testID="task-header"
        style={[
          styles.wrap,
          {
            paddingTop: insets.top + 4,
            backgroundColor: theme.surface,
            borderBottomColor: theme.border,
          },
        ]}
      >
        <View style={styles.bar}>
          <Pressable
            testID="task-header-left"
            accessibilityRole="button"
            accessibilityLabel={props.onOpenDrawer ? t("drawer.open") : t("task.back")}
            style={({ pressed }) => [
              styles.iconBtn,
              {
                backgroundColor: pressed ? theme.muted : "transparent",
                borderColor: "transparent",
              },
            ]}
            onPress={() => {
              Keyboard.dismiss();
              if (props.onOpenDrawer) props.onOpenDrawer();
              else if (router.canGoBack()) router.back();
              else router.replace("/");
            }}
          >
            <Icon name={props.onOpenDrawer ? "menu" : "arrow-left"} size={20} color={theme.text} />
          </Pressable>

          <Pressable
            onPress={() => open("menu")}
            accessibilityRole="button"
            accessibilityLabel={props.title}
            accessibilityHint={t("task.header.details")}
            style={styles.heading}
          >
            <Text numberOfLines={1} style={[styles.title, { color: theme.text }]}>
              {props.title}
            </Text>
            <View style={styles.meta}>
              <View style={[styles.dot, { backgroundColor: on ? theme.success : theme.textMuted }]} />
              <Text numberOfLines={1} style={[styles.machine, { color: theme.textMuted }]}>
                {props.host?.label ?? props.hostId}
              </Text>
              {pull ? (
                <>
                  <Icon name={PULL_ICONS[pull.state]} size={11} color={color} />
                  <Text numberOfLines={1} style={[styles.pull, { color }]}>
                    {`#${pull.number}`}
                  </Text>
                </>
              ) : null}
              {current && !git?.stale && checks !== "unknown" && checks !== "none" ? (
                <Icon
                  name={checks === "success" ? "check" : checks === "failure" ? "x" : "clock"}
                  size={11}
                  color={
                    checks === "success"
                      ? theme.success
                      : checks === "failure"
                        ? theme.failedMark
                        : theme.approving
                  }
                />
              ) : null}
            </View>
          </Pressable>

          {props.right ?? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("task.actions.menu")}
              onPress={() => open("menu")}
              style={styles.iconBtn}
            >
              <Icon name="ellipsis" size={20} color={theme.textMuted} />
            </Pressable>
          )}
        </View>
      </View>

      <Sheet
        visible={sheet !== null}
        title={
          sheet === "finish"
            ? t("task.header.finish_on", { name: props.host?.label ?? props.hostId })
            : t(sheet === "menu" ? "task.actions.menu" : "task.header.details")
        }
        onClose={close}
      >
        <View style={styles.body}>
          <Text selectable style={[styles.fullTitle, { color: theme.text }]}>
            {props.title}
          </Text>
          {sheet === "menu" ? (
            <>
              <SheetOption label={t("task.header.details")} onPress={() => open("details")} />
              {showFinish ? (
                <SheetOption
                  label={t("task.header.finish")}
                  icon="rocket"
                  disabled={!ready}
                  onPress={() => open("finish")}
                />
              ) : null}
              {props.host && props.task ? (
                <TaskActions
                  host={props.host}
                  task={props.task}
                  running={props.running}
                  onRemoved={props.onFinished}
                  onChanged={props.onChanged}
                />
              ) : null}
            </>
          ) : sheet === "details" ? (
            <>
              <Text style={{ color: theme.textMuted }}>{props.host?.label ?? props.hostId}</Text>
              <Text selectable style={{ color: theme.textMuted }}>
                {git?.branch}
              </Text>
              <Text style={{ color }}>{pull ? `#${pull.number} · ${state}` : state}</Text>
              {git?.stale ? (
                <Text style={{ color: theme.textMuted }}>{t("task.git.stale")}</Text>
              ) : (
                <>
                  <Text style={{ color: checks === "failure" ? theme.failedMark : theme.textMuted }}>
                    {t(`task.git.checks.${checks}`)}
                  </Text>
                  <Text style={{ color: theme.textMuted }}>{t(`task.git.review.${review}`)}</Text>
                </>
              )}
              {!ready ? (
                <Text style={[styles.description, { color: theme.textMuted }]}>
                  {t("task.header.finish_unavailable")}
                </Text>
              ) : null}
              <SheetOption
                label={t("task.header.refresh")}
                disabled={!on}
                onPress={() => setRevision((n) => n + 1)}
              />
              {showFinish ? (
                <SheetOption
                  label={t("task.header.finish")}
                  icon="rocket"
                  disabled={!ready}
                  onPress={() => open("finish")}
                />
              ) : null}
            </>
          ) : props.host ? (
            <TaskFinishConfirmation
              host={props.host}
              workspace={props.workspace}
              folder={props.folder}
              id={props.id}
              shared={!!git?.shared_with}
              ready={!!ready}
              onBlocked={() => setRevision((n) => n + 1)}
              onFinished={props.onFinished}
            />
          ) : null}
          <SheetOption label={t(sheet === "finish" ? "task.header.cancel" : "task.header.close")} onPress={close} />
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 50,
  },
  bar: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    gap: 8,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  heading: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  title: {
    fontSize: TEXT.body,
    fontWeight: "600",
    textAlign: "center",
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  machine: {
    fontSize: TEXT.caption,
    flexShrink: 1,
  },
  pull: {
    fontSize: TEXT.caption,
    fontWeight: "600",
  },
  body: {
    paddingHorizontal: 20,
    gap: 12,
  },
  fullTitle: {
    fontSize: 17,
    fontWeight: "600",
  },
  description: {
    fontSize: TEXT.body,
    lineHeight: 21,
  },
});
