import { AgentAvatar } from "../ui/AgentAvatar";
import { TEXT } from "@terminus/design";
import { canFinishTask, cardPull, previewLabel, taskPreview } from "@terminus/tasks";
import { router, useLocalSearchParams } from "expo-router";
import { useState, type ReactNode } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cardTask, marksOf } from "../lib/cards";
import { effectiveGit } from "../lib/taskGit";
import { useTaskGit } from "../lib/useTaskGit";
import { TaskFinishConfirmation } from "../ui/TaskFinishConfirmation";
import { Sheet, SheetOption } from "../ui/Sheet";
import { FolderIcon } from "../ui/FolderIcon";
import { PullChip } from "../ui/TaskCard";
import { TaskActions } from "../ui/TaskActions";
import { lang, t, w } from "../lib/i18n";
import { useMachines } from "../lib/machines";
import { useWorkspaces } from "../lib/workspaces";
import { BrandMark } from "../ui/BrandMark";
import { openTask } from "../ui/components";
import { Icon } from "../ui/Icon";
import { useTheme } from "../ui/theme";
import { modelLabel } from "../lib/model-presentation";

/**
 * La vista previa de una tarea al mantener pulsada su tarjeta: la tarjeta
 * flotante del sidebar del escritorio (`TaskHoverCard`) como hoja del sistema.
 * Título, carpeta, agente, proveedor y modelo, la
 * máquina si hay más de una; y Abrir, Fijar y Archivar con los mismos comandos
 * que la ventana (`set_session_pinned`, `task_blockers` y `set_task_archived`).
 * Abrirla no enciende nada; fijar o archivar encienden la VM si está apagada.
 */
export default function Preview() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { host: hostId, id, intent } = useLocalSearchParams<{ host: string; id: string; intent?: string }>();
  const [confirm, setConfirm] = useState(intent === "finish");
  const [revision, setRevision] = useState(0);
  // En web la hoja baja antes de quitar la pantalla.
  const [open, setOpen] = useState(true);
  const { hostOf, attention, hosts } = useMachines();
  const { snapshot, current, reload } = useWorkspaces();

  const task = snapshot?.tasks.find((x) => x.host === hostId && x.id === id);
  const host = hostOf(hostId);
  const book = useTaskGit(hostOf, task ? [task] : [], revision);
  if (!task || !host) return <View style={{ height: 120 }} />;

  const marks = marksOf(attention, current?.members, snapshot?.live ?? new Set());
  const row = cardTask(task, marks);
  const approving = [...marks.attention].filter(([, s]) => s === "approving").map(([k]) => k);
  const preview = taskPreview(lang, row, { live: marks.live, approving });
  const folder = snapshot?.folders.find((f) => f.key === task.folderKey);
  const provider = snapshot?.providers[task.host]?.find((p) => p.id === task.provider);
  const several = hosts.length > 1;
  const observed = effectiveGit(book, task, snapshot?.tasks ?? []);
  const git = host.power() === "on" ? observed : { ...observed, stale: true };
  const running = marks.live.has(`${task.host}/${task.id}`) || marks.attention.get(`${task.host}/${task.id}`) === "approving";
  const ready = host.power() === "on" && host.canAct() === "now" && canFinishTask(task, git, running);
  const pull = cardPull({ ...git, shared_with: null });
  const removed = () => { void reload(); router.back(); };
  const frame = (content: ReactNode) => Platform.OS === "web" ? <Sheet visible={open} onClose={() => setOpen(false)} onHidden={() => router.back()}>{content}</Sheet> : content;
  if (confirm) return frame(<View style={[styles.sheet, { backgroundColor: theme.surface, paddingBottom: insets.bottom + 16 }]}>
    <Text style={[styles.title, { color: theme.text }]}>{t("task.header.finish_on", { name: host.label })}</Text>
    <Text style={{ color: theme.text, fontWeight: "600" }}>{preview.title}</Text>
    {pull ? <PullChip pull={pull} git={git} /> : null}
    <TaskFinishConfirmation host={host} workspace={task.workspace} folder={task.folder} id={task.id} shared={!!git.shared_with} ready={ready} onBlocked={() => setRevision((n) => n + 1)} onFinished={removed} />
    <SheetOption label={t("task.header.cancel")} onPress={() => intent === "finish" ? router.back() : setConfirm(false)} />
  </View>);

  return frame(
    <View style={[styles.sheet, { backgroundColor: theme.surface, paddingBottom: insets.bottom + 16 }]} testID="task-preview">
      <View style={styles.head}>
        <Text style={[styles.title, { color: theme.text }]}>{preview.title}</Text>
      </View>
      {pull ? <PullChip pull={pull} git={git} /> : null}
      <View style={styles.rows}>
        {preview.folder ? (
          <Field label={previewLabel(lang, "folder")}>
            <FolderIcon folder={folder} size={13} />
            <Text numberOfLines={1} style={[styles.value, { color: theme.text }]}>{folder?.name ?? task.folder}</Text>
          </Field>
        ) : null}
        {preview.agent ? (
          <Field label={previewLabel(lang, "agent")}>
            <AgentAvatar name={preview.agent} size={16} host={task.host} folder={task.folder} />
            <Text numberOfLines={1} style={[styles.value, { color: theme.text }]}>{preview.agent}</Text>
          </Field>
        ) : null}
        <Field label={previewLabel(lang, "provider")}>
          <BrandMark id={task.provider} size={14} color={theme.text} />
          <Text numberOfLines={1} style={[styles.value, { color: theme.text }]}>
            {task.model ? modelLabel(task.model, { credits: t("services.credits"), router: t("composer.free_models") }) : previewLabel(lang, "default_model")}
          </Text>
          <Text numberOfLines={1} style={[styles.value, { color: theme.textMuted, flex: 0 }]}>{provider?.label ?? task.provider}</Text>
        </Field>
        {several ? (
          <Field label={t("preview.machine")}>
            <Icon name="server" size={13} color={theme.textMuted} />
            <Text numberOfLines={1} style={[styles.value, { color: theme.text }]}>{host.label}</Text>
            <Text style={[styles.value, { color: theme.textMuted, flex: 0 }]}>
              {host.power() === "on"
                ? w("web.computers.state.online")
                : host.power() === "starting"
                  ? w("web.computers.state.starting")
                  : host.power() === "outdated"
                    ? w("web.computers.state.outdated")
                    : w("web.computers.state.offline")}
            </Text>
          </Field>
        ) : null}
      </View>
      <Pressable accessibilityRole="button" onPress={() => { router.back(); openTask(task.host, task.workspace, task.folder, task.id); }} style={[styles.button, { backgroundColor: theme.primary, borderColor: theme.primary }]}>
        <Text style={{ color: theme.onPrimary, fontWeight: "600" }}>{previewLabel(lang, "open")}</Text>
      </Pressable>
      {pull?.state === "merged" && !git.stale ? <SheetOption testID="preview-finish" icon="rocket" label={t("task.header.finish")} disabled={!ready} onPress={() => setConfirm(true)} /> : null}
      <TaskActions host={host} task={task} running={running} onChanged={() => { void reload(); }} onRemoved={() => { void reload(); router.back(); }} />
    </View>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.textMuted }]}>{label}</Text>
      <View style={styles.fieldValue}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { paddingHorizontal: 20, paddingTop: 22, gap: 12 },
  head: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  title: { flex: 1, fontSize: 17, fontWeight: "600", lineHeight: 22 },
  rows: { gap: 8 },
  field: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 22 },
  label: { width: 84, fontSize: TEXT.ui },
  fieldValue: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6 },
  value: { flex: 1, fontSize: TEXT.body },
  button: { minHeight: 48, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", borderWidth: 1, borderRadius: 10, paddingVertical: 11 },
});
