import { TEXT } from "@terminus/design";
import { DEFAULT_SIDEBAR_VIEW, GROUPINGS, type SidebarView, agentOptions, folderCounts, groupingLabel, sameAgent } from "@terminus/tasks";
import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AgentAvatar } from "../ui/AgentAvatar";
import { lang, w } from "../lib/i18n";
import { useMachines } from "../lib/machines";
import { useWorkspaces } from "../lib/workspaces";
import { SheetTitle } from "../ui/components";
import { FolderIcon } from "../ui/FolderIcon";
import { useTheme } from "../ui/theme";

/**
 * «Filtrar y agrupar», el único filtro de la lista: las mismas opciones y
 * palabras que el popover del escritorio (carpetas, agente, agrupar,
 * densidad), en una hoja del sistema.
 */
export default function Filter() {
  const theme = useTheme();
  const { snapshot, space, view, setView } = useWorkspaces();
  const { hostOf } = useMachines();
  const set = (patch: Partial<SidebarView>) => setView({ ...view, ...patch });
  const tasks = (snapshot?.tasks ?? []).filter((task) => !space || task.folder === "" || space.folders.includes(task.folderKey));
  const counts = folderCounts(tasks.map((task) => ({ project: task.folderKey, row: task })));
  // Solo las carpetas que tienen tareas, como en el escritorio. Con varias máquinas, cada una con la suya.
  const folders = (snapshot?.folders ?? []).filter((f) => (counts.get(f.key) ?? 0) > 0);
  const several = new Set(folders.map((f) => f.host)).size > 1;
  const hostLabel = (id: string) => hostOf(id)?.label ?? id;
  const installed = (snapshot?.agents ?? []).filter((a) => !space || a.places.some((p) => space.folders.includes(`${p.host}/${p.folder}`)));
  // Los instalados y, de los desinstalados, los que aún tienen tareas; sin repetir por mayúsculas.
  const agents = agentOptions(installed.map((a) => a.name), tasks);
  const toggleFolder = (id: string) =>
    set({ folders: view.folders.includes(id) ? view.folders.filter((f) => f !== id) : [...view.folders, id] });

  const Option = ({ on, onPress, children, aside, check, testID }: { on: boolean; onPress: () => void; children: ReactNode; aside?: ReactNode; check?: boolean; testID?: string }) => (
    <Pressable testID={testID} accessibilityRole={check ? "checkbox" : "radio"} accessibilityState={{ checked: on }} onPress={onPress} style={styles.option}>
      <View style={[check ? styles.box : styles.radio, { borderColor: on ? theme.text : theme.textMuted, backgroundColor: on && check ? theme.text : "transparent" }]}>
        {on && !check ? <View style={[styles.dot, { backgroundColor: theme.text }]} /> : null}
        {on && check ? <Text style={{ color: theme.bg, fontSize: TEXT.caption, fontWeight: "800" }}>✓</Text> : null}
      </View>
      <View style={styles.label}>{children}</View>
      {aside !== undefined ? <Text style={{ color: theme.textMuted, fontVariant: ["tabular-nums"] }}>{aside}</Text> : null}
    </Pressable>
  );
  const Title = ({ children, action }: { children: string; action?: ReactNode }) => (
    <View style={styles.titleRow}>
      <Text style={[styles.title, { color: theme.textMuted }]}>{children}</Text>
      {action}
    </View>
  );
  const text = (s: string) => <Text style={{ color: theme.text, fontSize: 16 }} numberOfLines={1}>{s}</Text>;

  return (
    <ScrollView contentContainerStyle={styles.page} contentInsetAdjustmentBehavior="automatic">
      <SheetTitle>{w("shell.sidebar.view.trigger")}</SheetTitle>
      <Title
        action={
          view.folders.length ? (
            <Pressable onPress={() => set({ folders: [] })}>
              <Text style={{ color: theme.textMuted }}>{w("shell.sidebar.view.all")}</Text>
            </Pressable>
          ) : undefined
        }
      >
        {w("shell.sidebar.view.folders")}
      </Title>
      <Option check on={view.folders.length === 0} onPress={() => set({ folders: [] })} aside={tasks.length}>
        {text(w("shell.sidebar.view.all_folders"))}
      </Option>
      {folders.map((f) => (
        <Option key={f.key} testID={`filter-folder-${f.id}`} check on={view.folders.includes(f.key)} onPress={() => toggleFolder(f.key)} aside={counts.get(f.key) ?? 0}>
          <FolderIcon folder={f} size={13} />
          {text(several ? `${f.name} · ${hostLabel(f.host)}` : f.name)}
        </Option>
      ))}

      {agents.length ? (
        <>
          <View style={[styles.rule, { backgroundColor: theme.border }]} />
          <Title>{w("shell.sidebar.view.agent")}</Title>
          <Option on={view.agent === null} onPress={() => set({ agent: null })}>
            {text(w("shell.sidebar.view.all_agents"))}
          </Option>
          {agents.map((a) => (
            <Option key={a.name} testID={`filter-agent-${a.name}`} on={sameAgent(view.agent, a.name)} onPress={() => set({ agent: a.name })} aside={a.installed ? undefined : w("shell.sidebar.view.agent_uninstalled")}>
              <AgentAvatar name={a.name} size={18} />
              {text(a.name)}
            </Option>
          ))}
        </>
      ) : null}

      <View style={[styles.rule, { backgroundColor: theme.border }]} />
      <Title>{w("shell.sidebar.view.group")}</Title>
      {GROUPINGS.filter((g) => g !== "machine" || view.group === g || tasks.some((task) => !!task.machine)).map((g) => (
        <Option key={g} testID={`filter-group-${g}`} on={view.group === g} onPress={() => set({ group: g })} aside={g === DEFAULT_SIDEBAR_VIEW.group ? w("shell.sidebar.view.default") : undefined}>
          {text(groupingLabel(lang, g))}
        </Option>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 12, paddingBottom: 40 },
  titleRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 8, paddingTop: 10, paddingBottom: 4 },
  title: { fontSize: TEXT.ui, fontWeight: "600" },
  option: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 8, paddingVertical: 10 },
  label: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  box: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rule: { height: StyleSheet.hairlineWidth, marginVertical: 8 },
});
