import { RADIUS, TEXT, markedState } from "@terminus/design";
import { type CardPull, type TaskCard as Card, type PullTone, cardPull, canFinishTask, type TaskGit, taskTitle } from "@terminus/tasks";
import * as Haptics from "expo-haptics";
import { memo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { secondLine } from "../lib/cardLine";
import { sameCard } from "../lib/reconcile";
import type { Folder, Task } from "../lib/engine";
import { lang, t, w } from "../lib/i18n";
import { FolderIcon } from "./FolderIcon";
import { BrandMark } from "./BrandMark";
import { Icon, type IconName } from "./Icon";
import { TaskMark } from "./TaskStatus";
import { type Theme, useTheme } from "./theme";

/**
 * La chapa de la máquina que corre la tarea, como `MachineChip` del escritorio:
 * el servidor y su nombre; apagada, más tenue (nunca como error).
 */
export function MachineChip({ name, on, size = 14 }: { name: string; on: boolean; size?: number }) {
  const theme = useTheme();
  return (
    <View style={[styles.chip, { opacity: on ? 1 : 0.6 }]} accessibilityLabel={on ? name : w("shell.machines.task_off", { name })}>
      <Icon name="server" size={size - 1} color={theme.textMuted} />
      <Text numberOfLines={1} style={[styles.meta, { color: theme.textMuted, minWidth: 0, flexShrink: 1, fontSize: size }]}>
        {name}
      </Text>
    </View>
  );
}

const PULL_ICONS: Record<CardPull["state"], IconName> = {
  open: "git-pull-request",
  draft: "git-pull-request-draft",
  closed: "git-pull-request-closed",
  merged: "git-merge",
  merged_other_head: "git-branch",
};

const toneColor = (theme: Theme, tone: PullTone) =>
  tone === "open" ? theme.unseenMark : tone === "closed" || tone === "failure" ? theme.failedMark : tone === "merged" ? theme.merged : theme.textMuted;

/** El PR de la tarea, como `ChipDeGit` del riel: su icono y `#número`, rojo si el CI falló. */
export function PullChip({ pull, git, compact = false }: { pull: CardPull; git?: TaskGit | null; compact?: boolean }) {
  const theme = useTheme();
  const checks = git?.pull_known && git.head === git.pull?.head_sha ? git.pull?.checks : undefined;
  const state = t(`task.git.${pull.state}`);
  const checkLabel = !git?.stale && (pull.state === "open" || pull.state === "draft") && (checks === "pending" || checks === "failure") ? t(`task.git.checks.${checks}`) : state;
  const label = git?.stale ? t("task.git.stale_short") : checkLabel;
  return (
    <View testID="task-pull" style={[styles.chip, { minWidth: 0, maxWidth: 200, gap: compact ? 3 : 4 }]} accessibilityLabel={`#${pull.number}, ${state}${label === state ? "" : `, ${label}`}`}>
      <Icon name={PULL_ICONS[pull.state]} size={11} color={toneColor(theme, pull.tone)} />
      <Text numberOfLines={1} style={[styles.meta, { minWidth: 0, flexShrink: 1, fontSize: compact ? TEXT.caption : TEXT.label, color: toneColor(theme, pull.numberTone) }]}>#{pull.number}{compact ? "" : ` · ${label}`}</Text>
      {compact && (git?.stale ? <Icon name="clock" size={11} color={theme.textMuted} /> : pull.state === "open" && git?.head === git?.pull?.head_sha ? (
        git?.pull?.review === "changes_requested" ? <Icon name="message-square-warning" size={11} color={theme.warningStrong} /> : checks === "failure" ? <Icon name="circle-x" size={11} color={theme.failedMark} /> : checks === "pending" ? <Icon name="circle-dashed" size={11} color={theme.warningStrong} /> : git?.pull?.review === "approved" ? <Icon name="user-check" size={11} color={theme.unseenMark} /> : checks === "success" ? <Icon name="circle-check" size={11} color={theme.unseenMark} /> : null
      ) : null)}
    </View>
  );
}

type TaskCardProps = {
  task: Task;
  card: Card;
  git?: TaskGit | null;
  folderOf: (key: string) => Folder | undefined;
  onPress: () => void;
  onLongPress?: () => void;
  onFinish?: () => void;
  online: boolean;
  /** La hora corta a la derecha («2 min»); el menú queda en la pulsación larga. */
  when?: string;
  /** Una etiqueta al final de la segunda línea («Archivada» en Buscar). */
  tag?: string;
};

/**
 * Una tarjeta solo se repinta si cambia lo que enseña: su tarea (el mismo
 * objeto mientras no cambie, `keepSame`), su tarjeta, su git o el nombre de su
 * carpeta. `onPress` y `onLongPress` llegan nuevas en cada render
 * pero solo abren la tarea, que es la misma: no cuentan.
 */
const sameFolder = (a: Folder | undefined, b: Folder | undefined) =>
  a?.key === b?.key && a?.name === b?.name && a?.kind === b?.kind && a?.cloud === b?.cloud;

const sameProps = (a: TaskCardProps, b: TaskCardProps) =>
  a.task === b.task &&
  a.git === b.git &&
  a.online === b.online &&
  a.when === b.when &&
  a.tag === b.tag &&
  !a.onFinish === !b.onFinish &&
  !a.onLongPress === !b.onLongPress &&
  sameCard(a.card, b.card) &&
  sameFolder(a.card.folder ? a.folderOf(a.card.folder) : undefined, b.card.folder ? b.folderOf(b.card.folder) : undefined);

/**
 * La lista del teléfono: título, marca y acciones en la primera línea;
 * proveedor, carpeta, máquina y PR o rama en la segunda. La lista lee
 * el Git por carpeta; pulsar el cohete confirma sin abrir la conversación.
 */
export const TaskCard = memo(TaskCardView, sameProps);

function TaskCardView({
  task,
  card,
  git: observed,
  folderOf,
  onPress,
  onLongPress,
  onFinish,
  online,
  when,
  tag,
}: TaskCardProps) {
  const theme = useTheme();
  const git = observed && !online ? { ...observed, stale: true } : observed;
  const folder = card.folder ? folderOf(card.folder) ?? { id: card.folder, key: card.folder, host: task.host, name: card.folder } : null;
  const pull = cardPull(git);
  const chips = secondLine(card, pull);
  const [width, setWidth] = useState(320);
  const room = Math.max(0, width - 32 - 16 - 86 - 20);
  const sections = { folder: Math.floor(room * 0.3), machine: Math.floor(room * 0.3), git: Math.floor(room * 0.4) };
  const ready = online && canFinishTask(task, git, card.activity.viva || card.activity.aprobando);
  const branch = !git?.shared_with ? git?.branch : null;
  const kn = git?.kind === "kn" && !git.shared_with ? git.kn : null;
  return (
    <Pressable
      testID={`task-${task.host}-${task.id}`}
      onLayout={event => setWidth(event.nativeEvent.layout.width)}
      onPress={onPress}
      onLongPress={
        onLongPress
          ? () => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
              onLongPress();
            }
          : undefined
      }
      delayLongPress={350}
      accessibilityActions={onLongPress ? [{ name: "longpress", label: t("task.actions.menu") }] : undefined}
      onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === "longpress") onLongPress?.(); }}
      android_ripple={{ color: theme.border }}
      style={({ pressed }) => [styles.card, { backgroundColor: pressed && Platform.OS !== "android" ? theme.border : "transparent" }]}
    >
      <View style={styles.line}>
        <Text numberOfLines={1} style={[styles.title, { color: theme.text }]}>
          {taskTitle(lang, task)}
        </Text>
        {card.pinned ? (
          <View accessibilityRole="image" accessibilityLabel={w("projects.sessions.pinned")}>
            <Icon name="pin" size={13} color={theme.textMuted} />
          </View>
        ) : null}
        <View style={styles.mark}>
          <TaskMark state={markedState(card.activity)} identity={{ agent: task.agent, host: task.host, folder: task.folder }} />
        </View>
      </View>
      <View style={[styles.line, styles.second]}>
        <View testID="task-provider" accessibilityRole="image" accessibilityLabel={card.provider ?? task.provider} {...(Platform.OS === "web" ? { title: card.provider ?? task.provider } : {})} style={styles.provider}>
          <BrandMark id={card.provider ?? task.provider} size={13} color={theme.text} />
        </View>
        {chips.includes("folder") && folder ? <View testID="task-folder" style={[styles.chip, { width: sections.folder, flexShrink: 0 }]} accessibilityLabel={folder.name}>
          <FolderIcon folder={folder} size={13} />
          <Text numberOfLines={1} style={[styles.meta, styles.clip, { color: theme.textMuted }]}>{folder.name ?? folder.id}</Text>
        </View> : null}
        {chips.includes("machine") && card.machine ? <View testID="task-machine" style={{ width: sections.machine, flexShrink: 0 }}><MachineChip name={card.machine.id} on={card.machine.on} /></View> : null}
        {pull || kn || branch ? <View testID="task-git" style={[styles.chip, { width: sections.git, flexShrink: 0, overflow: "hidden" }]}>
          {pull ? <PullChip pull={pull} git={git} compact /> : kn ? <View accessibilityRole="image" accessibilityLabel={w(kn === "clean" ? "projects.kn.clean" : kn === "saved" ? "projects.kn.saved" : "projects.kn.draft")}>
            <Icon name={kn === "draft" ? "file-pen-line" : kn === "saved" ? "file-check" : "file"} size={12} color={git?.stale ? theme.textMuted : kn === "saved" ? theme.merged : theme.textMuted} />
          </View> : <><Icon name="git-branch" size={11} color={theme.textMuted} /><Text numberOfLines={1} style={[styles.meta, styles.clip, { color: theme.textMuted }]}>{branch}</Text></>}
        </View> : null}
        {tag ? <Text numberOfLines={1} style={[styles.tag, { color: theme.textMuted, backgroundColor: theme.muted }]}>{tag}</Text> : null}
        <View style={{ flex: 1, minWidth: 0 }} />
        <View style={styles.tail}>
          <View style={styles.action}>
            {onFinish && ready ? <Pressable testID={`finish-${task.host}-${task.id}`} accessibilityRole="button" accessibilityLabel={`${t("task.header.finish")}: ${taskTitle(lang, task)}`} hitSlop={8} onPress={event => { event.stopPropagation(); onFinish(); }} style={styles.action}>
              <Icon name="rocket" size={15} color={theme.merged} />
            </Pressable> : null}
          </View>
          <Text testID="task-time" numberOfLines={1} style={[styles.when, { color: theme.textMuted }]}>{when}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { paddingHorizontal: 16, paddingVertical: 10, gap: 4, minHeight: 60, justifyContent: "center" },
  tag: { fontSize: TEXT.caption, fontWeight: "600", paddingHorizontal: 6, paddingVertical: 1, maxWidth: 64, minWidth: 0, flexShrink: 1, borderRadius: RADIUS.sm, overflow: "hidden" },
  when: { width: 62, textAlign: "right", fontSize: 12.5, fontVariant: ["tabular-nums"], flexShrink: 0 },
  line: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 18 },
  second: { gap: 4 },
  mark: { width: 24, height: 24, flexShrink: 0, alignItems: "center", justifyContent: "center" },
  provider: { width: 16, flexShrink: 0, alignItems: "flex-start", justifyContent: "center" },
  clip: { flex: 1, minWidth: 0 },
  action: { width: 20, height: 20, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  tail: { flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 0 },
  title: { flex: 1, minWidth: 0, fontSize: 16, fontWeight: "500" },
  chip: { flexDirection: "row", alignItems: "center", gap: 4, minWidth: 0, flexShrink: 1 },
  meta: { fontSize: TEXT.label },
});
