import type { SessionRow } from "@terminus/protocol";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { t } from "../../lib/i18n";
import { useMachines } from "../../lib/machines";
import { useWorkspaces } from "../../lib/workspaces";
import { Avatar, Row, SectionTitle, openTask } from "../../ui/components";
import { TaskMark, type TaskState, stateText } from "../../ui/TaskStatus";
import { useTheme } from "../../ui/theme";

const ORDER: TaskState[] = ["approving", "asked", "failed", "unseen"];

type Entry = { host: string; workspace: string; session: string; folder: string | null; state: TaskState; at?: number };

/**
 * Todas las máquinas y todos sus workspaces en una lista, con las marcas del
 * sidebar. «Ahora» es lo que cada motor sigue reportando en `attention` (con
 * la VM apagada, la copia del relay); «Antes», lo que llegó con la app abierta
 * y ya no espera.
 */
export default function Notifications() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { attention, activity, titleOf, reasonOf, hostOf, hosts } = useMachines();
  const { list } = useWorkspaces();
  const [titles, setTitles] = useState<Record<string, string>>({});
  // El nombre del workspace por el id que le da su máquina.
  const nameOf = (host: string, id: string) => list.find((w) => w.members.get(host) === id)?.name ?? id;
  const several = hosts.length > 1;

  const now: Entry[] = Object.entries(attention)
    .flatMap(([host, ws]) => ws.flatMap((w) => w.tasks.map((task) => ({ host, workspace: w.workspace, session: task.session, folder: task.project, state: task.state as TaskState }))))
    .filter((entry) => ORDER.includes(entry.state))
    .sort((a, b) => ORDER.indexOf(a.state) - ORDER.indexOf(b.state));
  const waiting = new Set(now.map((entry) => `${entry.host}/${entry.session}`));
  const earlier: Entry[] = activity
    .filter(({ notice }) => !waiting.has(`${notice.host}/${notice.session}`))
    .map(({ notice, at }) => ({
      host: notice.host,
      workspace: notice.workspace,
      session: notice.session,
      folder: notice.folder,
      state: notice.state === "finished" ? "unseen" : (notice.state as TaskState),
      at,
    }));

  // Títulos de tareas de otros workspaces: la lista de Tareas solo conoce el actual.
  useEffect(() => {
    const missing = [...now, ...earlier].filter((e) => e.folder !== null && !titleOf(`${e.host}/${e.session}`) && !titles[`${e.host}/${e.session}`]);
    const asked = new Set<string>();
    for (const entry of missing) {
      const host = hostOf(entry.host);
      const scope = `${entry.host}/${entry.workspace}/${entry.folder}`;
      if (!host || asked.has(scope)) continue;
      asked.add(scope);
      void host
        .call<SessionRow[]>("list_live_sessions", entry.workspace, { project: entry.folder, open: [] })
        .then(({ value }) => setTitles((old) => ({ ...old, ...Object.fromEntries((value ?? []).map((row) => [`${entry.host}/${row.id}`, row.title])) })))
        .catch(() => {});
    }
  }, [attention, activity]);

  const row = (entry: Entry, key: string) => {
    const time = entry.at ? new Date(entry.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null;
    const id = `${entry.host}/${entry.session}`;
    const machine = several ? hostOf(entry.host)?.label : null;
    const reason = entry.state === "failed" ? reasonOf(`${entry.host}/${entry.session}`) : undefined;
    return (
      <Row
        key={key}
        testID={`notification-${entry.session}`}
        left={
          <View>
            <Avatar name={nameOf(entry.host, entry.workspace)} size={36} />
            <View style={[styles.mark, { backgroundColor: theme.bg }]}>
              <TaskMark state={entry.state} size={16} />
            </View>
          </View>
        }
        title={titleOf(id) ?? titles[id] ?? t("notify.untitled")}
        bold={entry.state !== "unseen"}
        subtitle={[reason || stateText(entry.state), nameOf(entry.host, entry.workspace), machine, time].filter(Boolean).join(" · ")}
        onPress={() => openTask(entry.host, entry.workspace, entry.folder ?? "", entry.session)}
      />
    );
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg }} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
      {now.length ? <SectionTitle>{t("notifications.now")}</SectionTitle> : null}
      {now.map((entry) => row(entry, `n-${entry.host}-${entry.session}`))}
      {earlier.length ? <SectionTitle>{t("notifications.earlier")}</SectionTitle> : null}
      {earlier.map((entry) => row(entry, `e-${entry.at}-${entry.host}-${entry.session}`))}
      {!now.length && !earlier.length ? <Text style={[styles.empty, { color: theme.textMuted }]}>{t("notifications.empty")}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  mark: { position: "absolute", right: -6, bottom: -6, borderRadius: 10, padding: 2 },
  empty: { padding: 32, textAlign: "center" },
});
