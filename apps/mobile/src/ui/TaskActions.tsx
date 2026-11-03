import { TEXT } from "@terminus/design";
import { isPinned } from "@terminus/tasks";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { deleteTask, renameTask, setPinned, type Task } from "../lib/engine";
import { enqueue } from "../lib/taskQueue";
import { HostError, type Host } from "../lib/hosts";
import { t, w } from "../lib/i18n";
import { SheetOption } from "./Sheet";
import { useTheme } from "./theme";

/** Las mismas acciones desde la conversación y la pulsación larga de la lista. */
export function TaskActions({ host, task, running, onRemoved, onChanged }: {
  host: Host;
  task: Task;
  running: boolean;
  onRemoved: () => void;
  onChanged: () => void;
}) {
  const theme = useTheme();
  const [confirm, setConfirm] = useState<"archive" | "delete" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // El nombre nuevo mientras se escribe; `null` es el menú sin editar.
  const [draft, setDraft] = useState<string | null>(null);
  const submitting = useRef(false);
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const available = host.canAct() === "now" || host.canAct() === "wakes";
  const pinned = isPinned(task);
  const act = async (action: "pin" | "rename" | "archive" | "delete") => {
    if (submitting.current || !available || ((action === "archive" || action === "delete") && running) || (action === "delete" && host.power() !== "on")) return;
    const title = draft?.trim() ?? "";
    // Vacío o igual al de ahora no cambia nada, como en la fila del escritorio.
    if (action === "rename" && (!title || title === task.title)) { setDraft(null); return; }
    // Archivar y borrar entran a la cola: la pantalla no espera al relay.
    if (action === "archive" || action === "delete") {
      enqueue(host, { workspace: task.workspace, folder: task.folder, id: task.id, title: task.title }, action);
      setConfirm(null);
      onRemoved();
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      if (action === "pin") {
        await setPinned(host, task.workspace, task.folder, task.id, !pinned);
        if (live.current) onChanged();
      } else if (action === "rename") {
        await renameTask(host, task.workspace, task.folder, task.id, title);
        if (live.current) { setDraft(null); onChanged(); }
      }
    } catch (failure) {
      if (live.current) setError(failure instanceof HostError && failure.code === "task_status_unavailable" ? t("task.header.status_unavailable") : t("task.error", { detail: failure instanceof Error ? failure.message : String(failure) }));
    } finally {
      submitting.current = false;
      if (live.current) setBusy(false);
    }
  };
  return <View style={{ gap: 8 }}>
    {draft !== null ? <>
      <TextInput
        testID="task-rename-input"
        value={draft}
        onChangeText={setDraft}
        autoFocus
        selectTextOnFocus
        editable={!busy}
        returnKeyType="done"
        onSubmitEditing={() => void act("rename")}
        accessibilityLabel={w("projects.sessions.rename_label", { title: task.title })}
        style={{ minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 16, color: theme.text, borderColor: theme.border, backgroundColor: theme.bg }}
      />
      <Pressable accessibilityRole="button" testID="task-rename-confirm" disabled={busy || !available} onPress={() => void act("rename")} style={{ minHeight: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: theme.primary, opacity: busy ? 0.5 : 1 }}>
        <Text style={{ color: theme.onPrimary, fontWeight: "600" }}>{t(busy ? "task.actions.working" : "task.actions.rename_save")}</Text>
      </Pressable>
      <SheetOption label={t("task.actions.cancel")} disabled={busy} onPress={() => { setDraft(null); setError(null); }} />
    </> : confirm ? <>
      <Text style={{ color: theme.text, fontSize: 17, fontWeight: "600" }}>{t(`task.actions.${confirm}`)}</Text>
      <Text style={{ color: theme.textMuted, fontSize: TEXT.body, lineHeight: 21 }}>{t(`task.actions.${confirm}_confirm`, { name: host.label })}</Text>
      <Pressable accessibilityRole="button" testID={`task-${confirm}-confirm`} disabled={busy || running || !available || (confirm === "delete" && host.power() !== "on")} onPress={() => void act(confirm)} style={{ minHeight: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: confirm === "delete" ? theme.failedMark : theme.primary, opacity: busy ? 0.5 : 1 }}>
        <Text style={{ color: theme.onPrimary, fontWeight: "600" }}>{t(busy ? "task.actions.working" : `task.actions.${confirm}`)}</Text>
      </Pressable>
      <SheetOption label={t("task.actions.cancel")} disabled={busy} onPress={() => { setConfirm(null); setError(null); }} />
    </> : <>
      <SheetOption testID="task-rename" icon="square-pen" label={w("projects.sessions.rename")} disabled={busy || !available} onPress={() => { setDraft(task.title); setError(null); }} />
      <SheetOption icon={pinned ? "pin-off" : "pin"} label={t(pinned ? "task.actions.unpin" : "task.actions.pin")} disabled={busy || !available} onPress={() => void act("pin")} />
      {!task.archived ? <SheetOption testID="task-archive" icon="archive" label={t("task.actions.archive")} detail={t("task.actions.archive_hint")} disabled={busy || running || !available} onPress={() => { setConfirm("archive"); setError(null); }} /> : null}
      <View style={{ borderTopWidth: 1, borderTopColor: theme.border, marginTop: 4 }}>
        <SheetOption testID="task-delete" icon="trash-2" destructive label={t("task.actions.delete")} detail={t("task.actions.delete_hint")} disabled={busy || running || host.power() !== "on" || !available} onPress={() => { setConfirm("delete"); setError(null); }} />
      </View>
      {running ? <Text style={{ color: theme.textMuted }}>{t("task.actions.busy")}</Text> : host.power() !== "on" ? <Text style={{ color: theme.textMuted }}>{t("task.actions.online")}</Text> : null}
    </>}
    {error ? <Text accessibilityRole="alert" style={{ color: theme.failedMark }}>{error}</Text> : null}
  </View>;
}
