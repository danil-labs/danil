import { folderByKey } from "../../lib/folderIcon";
import { RADIUS, TEXT } from "@terminus/design";
import { applySidebarView, groupCardOptions, workStateOf, folderCounts, groupKey, groupLabel, isPinned, type SidebarView } from "@terminus/tasks";
import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAccount } from "../../lib/account";
import { ALPHA_DEMO, ALPHA_ORDINARY } from "../../lib/alpha-mode";
import { cardOf, cardTask, marksOf, familyTasks } from "../../lib/cards";
import { useCustomization } from "../../lib/customization";
import { archiveTask, failureText, setPinned, type Task, taskInSpace, taskKey } from "../../lib/engine";
import { lang, t, w } from "../../lib/i18n";
import { decodeFolded, FOLDED_KEY, toggleFolded } from "../../lib/foldedGroups";
import { useInbox } from "../../lib/inbox";
import { useMachines } from "../../lib/machines";
import { Notifications } from "../../lib/notifications";
import { can, ready, renameSpace } from "../../lib/pending";
import { store } from "../../lib/store";
import { effectiveGit } from "../../lib/taskGit";
import { useTaskGit } from "../../lib/useTaskGit";
import { shortWhen } from "../../lib/when";
import { spaceName, useWorkspaces } from "../../lib/workspaces";
import { AgentAvatar } from "../../ui/AgentAvatar";
import { openPreview, openTask } from "../../ui/components";
import { Icon, type IconName } from "../../ui/Icon";
import { CountBadge, Group, GroupHeader, ListRow, pageColor, Tap } from "../../ui/list";
import { MachineNote } from "../../ui/MachineNote";
import { type MenuItem, Popover, useMenuAnchor } from "../../ui/Popover";
import { SpaceMenu } from "../../ui/SpaceMenu";
import { DeleteSpaceSheet, NewSpaceSheet } from "../../ui/SpaceSheets";
import { spaceTitle } from "../../ui/spaceTitle";
import { SwipeRow } from "../../ui/SwipeRow";
import { TaskCard } from "../../ui/TaskCard";
import { useTheme } from "../../ui/theme";
import { WorkspaceAvatar } from "../../ui/WorkspaceAvatar";

const NEEDS_YOU = new Set(["approving", "asked", "failed"]);

/** Las secciones de Personalizar que Inicio enseña arriba, con su ícono y su ruta. */
const SECTIONS: Record<string, { icon: IconName; color: string; route: string }> = {
  inbox: { icon: "inbox", color: "#6539f5", route: "/inbox" },
  broadcasts: { icon: "megaphone", color: "#ec4899", route: "/broadcasts" },
  agents: { icon: "bot", color: "#10b981", route: "/attention-agents" },
  channels: { icon: "radio", color: "#0ea5e9", route: "/channels" },
};

const initials = (text: string | null | undefined) =>
  (text ?? "").split(/[@\s._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";

/**
 * Inicio (listas nativas v2): la raíz y la única pantalla sin atrás. Arriba el
 * workspace, la lupa, Personalizar, Nueva tarea y el avatar; el título grande
 * es el espacio y abre su menú. Debajo, las secciones elegidas en Personalizar
 * y Agentes; después las tareas en grupos, cada una en su tarjeta de dos
 * líneas. Deslizar a la izquierda enseña Fijar y Archivar; la pulsación larga,
 * el menú de la tarea. Las subtareas no salen aquí: viven en su chat y en
 * Buscar. Nada flota.
 */
export default function Home() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const customization = useCustomization();
  const inbox = useInbox();
  const { email } = useAccount();
  const { attention, hosts, hostOf, fleet } = useMachines();
  const { list, current, snapshot, loading, reload, space, selectSpace, view } = useWorkspaces();
  const [askNotifications, setAskNotifications] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [newSpace, setNewSpace] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [folded, setFolded] = useState<string[]>([]);
  useEffect(() => {
    void store.get(FOLDED_KEY).then((raw) => setFolded((now) => (now.length ? now : decodeFolded(raw)))).catch(() => {});
  }, []);
  const toggleGroup = (key: string) => setFolded((now) => {
    const next = toggleFolded(now, key);
    void store.set(FOLDED_KEY, JSON.stringify(next)).catch(() => {});
    return next;
  });

  useEffect(() => {
    void Notifications?.getPermissionsAsync().then((p) => setAskNotifications(p.canAskAgain && !p.granted));
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  const marks = useMemo(() => marksOf(attention, current?.members, snapshot?.live ?? new Set()), [attention, current?.members, snapshot?.live]);
  const locals = new Set(current ? [...current.members.values()] : []);
  const otherPending = Object.values(attention)
    .flat()
    .filter((x) => !locals.has(x.workspace))
    .reduce((sum, x) => sum + x.tasks.filter((task) => NEEDS_YOU.has(task.state)).length, 0);

  const spaces = snapshot?.spaces ?? [];
  const inSpace = (key: string) => !space || key.endsWith("/") || space.folders.includes(key);
  const tasks = familyTasks((snapshot?.tasks ?? []).filter((task) => taskInSpace(task, space)), snapshot?.delegated ?? [], marks);
  const counts = folderCounts(tasks.map((task) => ({ project: task.folderKey, row: task })));
  const kept = view.folders.filter((f) => (counts.get(f) ?? 0) > 0);
  const effective: SidebarView = kept.length === view.folders.length ? view : { ...view, folders: kept };
  const folderIdOf = (key: string) => snapshot?.folders.find((f) => f.key === key)?.id ?? key.slice(key.indexOf("/") + 1);
  const git = useTaskGit(hostOf, tasks);
  const groups = applySidebarView(tasks.map((task) => ({ ...cardTask(task, marks), task })), { ...effective, folders: effective.folders.map(folderIdOf) }, {
    live: marks.live,
    approving: [...marks.attention].filter(([, s]) => s === "approving").map(([k]) => k),
    folderOf: (row) => row.task.folder,
    machineOf: (row) => row.task.host,
    workStateOf: (row) => workStateOf(effectiveGit(git, row.task, snapshot?.tasks ?? [])),
  });
  const groupFolderName = (id: string) => snapshot?.folders.find((f) => f.id === id)?.name ?? id;
  const machineName = (id: string) => hosts.find((h) => h.id === id)?.label ?? id;
  const agents = (snapshot?.agents ?? []).filter((a) => a.places.some((p) => inSpace(`${p.host}/${p.folder}`)));
  const working = agents.filter((a) => a.status === "working").length;

  // Los espacios se crean, renombran y eliminan en la primera máquina del workspace (la VM administrada).
  const firstHost = current ? [...current.members.keys()].map(hostOf).find(Boolean) ?? null : null;
  const target = firstHost && current ? { host: firstHost, workspace: current.members.get(firstHost.id)! } : null;
  const spaceTarget = (s: typeof space) => {
    const on = s ? Object.entries(s.on)[0] : undefined;
    const host = on ? hostOf(on[0]) : undefined;
    return host && on && current?.members.has(host.id) ? { host, workspace: current.members.get(host.id)!, id: on[1] } : null;
  };
  const title = space ? spaceName(space, t("space.general")) : current?.name ?? w("common.brand_name");
  const manage = !!target && ready("spaces", target.host);
  const spaceItems: MenuItem[] = [
    ...(spaces.length > 1 ? spaces.map((s) => ({
      key: `space-${s.id}`,
      label: spaceName(s, t("space.general")),
      checked: s.id === space?.id,
      count: (snapshot?.tasks ?? []).filter((task) => taskInSpace(task, s)).length,
      onPress: () => selectSpace(s.id),
    })) : []),
    ...(manage ? [
      { key: "new", label: w("spaces.new.title"), icon: "plus" as const, section: true, onPress: () => setNewSpace(true) },
      ...(space ? [
        { key: "rename", label: w("spaces.menu.rename"), icon: "pencil" as const, onPress: () => setRenaming(spaceName(space, "")) },
        { key: "delete", label: w("spaces.menu.delete"), icon: "trash-2" as const, destructive: true, onPress: () => setDeleting(true) },
      ] : []),
    ] : []),
  ];
  const saveName = async () => {
    const name = renaming?.trim();
    setRenaming(null);
    const at = spaceTarget(space);
    if (!name || !at || name === title) return;
    try {
      await renameSpace(at.host, at.workspace, at.id, name);
      void reload();
    } catch (cause) {
      setNotice(failureText(cause));
    }
  };

  const act = async (work: () => Promise<unknown>) => {
    try {
      await work();
      void reload();
    } catch (cause) {
      setNotice(failureText(cause));
    }
  };
  const pin = (task: Task) => {
    const host = hostOf(task.host);
    if (host) void act(() => setPinned(host, task.workspace, task.folder, task.id, !isPinned(task)));
  };
  const archive = (task: Task) => {
    const host = hostOf(task.host);
    if (host) void act(async () => {
      const result = await archiveTask(host, task.workspace, task.folder, task.id);
      if ("blocked" in result) setNotice(t("task.actions.blocked"));
    });
  };
  const rowMenu = (task: Task): MenuItem[] => [
    { key: "pin", label: w(isPinned(task) ? "projects.sessions.unpin" : "projects.sessions.pin"), icon: "pin", onPress: () => pin(task) },
    { key: "rename", label: w("shell.sidebar.rename"), icon: "pencil", onPress: () => openPreview(task.host, task.id) },
    ...(can("move_task_to_space") && spaces.length > 1 ? [{ key: "move", label: w("spaces.move.to"), icon: "layers" as const, onPress: () => openPreview(task.host, task.id) }] : []),
    { key: "archive", label: w("projects.hover_card.archive"), icon: "archive", onPress: () => archive(task) },
    { key: "finish", label: w("projects.sessions.finish"), icon: "trash-2", destructive: true, onPress: () => openPreview(task.host, task.id, "finish") },
  ];

  const sections = process.env.EXPO_PUBLIC_TERMINUS_ALPHA === "1" && !ALPHA_ORDINARY ? customization.entries.filter((entry) => entry.selected && SECTIONS[entry.id]) : [];
  const unread = inbox.rows.reduce((sum, row) => sum + row.unread_count, 0);
  const iosSearch = Platform.OS === "ios";

  return (
    <View style={[styles.page, { backgroundColor: pageColor(theme) }]}>
      <View style={[styles.top, { paddingTop: insets.top + 6 }]}>
        {renaming !== null ? (
          <>
            <View style={[styles.chip, { opacity: 0.5, backgroundColor: theme.surface }]}>
              <WorkspaceAvatar id={current?.id} name={current?.name ?? "T"} size={24} />
              <Text numberOfLines={1} style={[styles.chipText, { color: theme.text }]}>{current?.name ?? w("common.brand_name")}</Text>
            </View>
            <Tap testID="rename-done" accessibilityRole="button" onPress={() => void saveName()} style={[styles.done, { backgroundColor: theme.text }]}>
              <Text style={{ color: theme.onPrimary, fontWeight: "700", fontSize: TEXT.lead }}>{t("attention.close")}</Text>
            </Tap>
          </>
        ) : (
          <>
            <Tap testID="workspace-switcher" accessibilityRole="button" accessibilityLabel={t("home.switch")} onPress={() => router.push("/workspaces")} style={[styles.chip, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <WorkspaceAvatar id={current?.id} name={current?.name ?? "T"} size={24} />
              <Text numberOfLines={1} style={[styles.chipText, { color: theme.text }]}>{current?.name ?? w("common.brand_name")}</Text>
              <Icon name="chevron-down" size={14} color={theme.textMuted} />
            </Tap>
            <View style={[styles.tools, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Tap testID="search" accessibilityRole="button" accessibilityLabel={w("search.title")} onPress={() => router.push("/search")} style={styles.tool}>
                <Icon name="search" size={20} color={theme.text} />
              </Tap>
              <Tap testID="personalize" accessibilityRole="button" accessibilityLabel={t("attention.personalize")} onPress={() => router.push("/personalize")} style={styles.tool}>
                <Icon name="sliders-horizontal" size={20} color={theme.text} />
              </Tap>
              <Tap testID="new-task" accessibilityRole="button" accessibilityLabel={w("shell.sidebar.new_task")} onPress={() => router.push("/new")} style={styles.tool}>
                <Icon name="square-pen" size={20} color={theme.text} />
              </Tap>
            </View>
            <Tap testID="profile" accessibilityRole="button" accessibilityLabel={t("profile.title")} onPress={() => router.push("/profile")} style={styles.avatarTap}>
              <View style={[styles.avatar, { backgroundColor: theme.merged }]}>
                <Text style={styles.avatarText}>{initials(email)}</Text>
              </View>
              {otherPending ? <View style={[styles.avatarDot, { backgroundColor: theme.approving, borderColor: pageColor(theme) }]} /> : null}
            </Tap>
          </>
        )}
      </View>

      <ScrollView
        testID="home-list"
        refreshControl={Platform.OS === "web" ? undefined : <RefreshControl refreshing={loading} onRefresh={reload} />}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        contentOffset={iosSearch ? { x: 0, y: 52 } : undefined}
        keyboardShouldPersistTaps="handled"
      >
        {iosSearch ? (
          <Tap testID="pull-search" accessibilityRole="search" onPress={() => router.push("/search")} style={[styles.pullSearch, { backgroundColor: theme.dark ? theme.surface : theme.border }]}>
            <Icon name="search" size={16} color={theme.textMuted} />
            <Text style={{ color: theme.textMuted, fontSize: 16 }}>{w("search.placeholder")}</Text>
          </Tap>
        ) : null}

        {renaming !== null ? (
          <View style={spaceTitle.wrap}>
            <TextInput
              testID="space-rename"
              autoFocus
              selectTextOnFocus
              value={renaming}
              onChangeText={setRenaming}
              onSubmitEditing={() => void saveName()}
              onBlur={() => setRenaming(null)}
              onKeyPress={(event) => { if (event.nativeEvent.key === "Escape") setRenaming(null); }}
              returnKeyType="done"
              style={[spaceTitle.text, styles.renameInput, { color: theme.text, borderColor: theme.primary, backgroundColor: `${theme.merged}22` }]}
            />
          </View>
        ) : spaceItems.length ? (
          <SpaceMenu title={title} items={spaceItems} label={t("home.space_menu")} />
        ) : (
          <View style={spaceTitle.wrap}><Text accessibilityRole="header" numberOfLines={1} style={[spaceTitle.text, { color: theme.text }]}>{title}</Text></View>
        )}

        <View style={{ opacity: renaming !== null ? 0.45 : 1 }} pointerEvents={renaming !== null ? "none" : "auto"}>
          <MachineNote hosts={hosts} fleet={fleet} />
          {notice ? <Text accessibilityRole="alert" style={[styles.notice, { color: theme.text, backgroundColor: theme.surface }]}>{notice}</Text> : null}
          {askNotifications ? (
            <Group style={{ marginBottom: 12 }}>
              <ListRow
                testID="enable-notifications"
                icon={{ name: "bell", color: theme.approving }}
                title={t("notify.enable")}
                right={<Text style={{ color: theme.merged, fontWeight: "600" }}>{t("notify.enable_button")}</Text>}
                onPress={() => void Notifications?.requestPermissionsAsync().then(() => setAskNotifications(false))}
              />
            </Group>
          ) : null}

          <Group inset={56}>
            {sections.map((entry) => (
              <ListRow
                key={entry.id}
                testID={`section-${entry.id}`}
                icon={{ name: SECTIONS[entry.id].icon, color: SECTIONS[entry.id].color }}
                title={entry.title}
                right={entry.id === "inbox" ? <CountBadge count={unread} /> : undefined}
                chevron
                onPress={() => router.push((ALPHA_DEMO ? `${SECTIONS[entry.id].route}?demo=1` : SECTIONS[entry.id].route) as never)}
              />
            ))}
            {agents.length ? (
              <ListRow
                testID="agents"
                icon={{ name: "users", color: theme.dark ? "#3f3f46" : "#334155" }}
                title={w("shell.agent_dock.title")}
                right={
                  <View style={styles.faces}>
                    <View style={styles.faceRow}>
                      {agents.slice(0, 3).map((agent, i) => (
                        <View key={agent.name} style={{ marginLeft: i ? -8 : 0, borderRadius: 12, borderWidth: 2, borderColor: theme.surface }}>
                          <AgentAvatar name={agent.name} size={20} />
                        </View>
                      ))}
                    </View>
                    {working ? <Text style={{ color: theme.textMuted, fontSize: TEXT.body }}>{t("home.agents_working", { count: working })}</Text> : null}
                  </View>
                }
                chevron
                onPress={() => router.push("/agents")}
              />
            ) : null}
          </Group>

          {groups.map((group) => {
            const key = groupKey(group);
            const isFolded = folded.includes(key);
            const name = groupLabel(lang, group, groupFolderName, machineName);
            const needing = isFolded ? group.tasks.filter(({ task }) => NEEDS_YOU.has(marks.attention.get(taskKey(task)) ?? "")).length : 0;
            return (
            <View key={key}>
              <GroupHeader
                strong
                count={group.tasks.length}
                folded={isFolded}
                onToggle={() => toggleGroup(key)}
                foldLabel={t(isFolded ? "home.group.expand" : "home.group.collapse", { name })}
                right={needing ? <CountBadge count={needing} /> : undefined}
              >{name}</GroupHeader>
              {isFolded ? null : <Group inset={46}>
                {group.tasks.map(({ task }) => (
                  <TaskRow
                    key={taskKey(task)}
                    task={task}
                    menu={rowMenu(task)}
                    onPin={() => pin(task)}
                    onArchive={() => archive(task)}
                    render={(onLongPress) => (
                      <TaskCard
                        task={task}
                        card={cardOf(task, marks, groupCardOptions(group).hideFolder, groupCardOptions(group).hideMachine)}
                        git={effectiveGit(git, task, snapshot?.tasks ?? [])}
                        folderOf={(key) => folderByKey(snapshot?.folders ?? [], key)}
                        when={shortWhen(task.last_turn_at ?? task.updated_at, lang)}
                        onPress={() => openTask(task.host, task.workspace, task.folder, task.id)}
                        onLongPress={onLongPress}
                        onFinish={() => openPreview(task.host, task.id, "finish")}
                        online={hostOf(task.host)?.power() === "on" && hostOf(task.host)?.canAct() === "now"}
                      />
                    )}
                  />
                ))}
              </Group>}
              {!isFolded && !group.tasks.length ? <Text style={[styles.empty, { color: theme.textMuted }]}>{t("folder.empty")}</Text> : null}
            </View>
            );
          })}
          {list.length === 0 && !loading && fleet === "ok" ? (
            <Text style={[styles.empty, { color: theme.textMuted }]}>{t(hosts.some((h) => h.linked) ? "home.no_linked_workspaces" : "home.no_workspaces")}</Text>
          ) : null}
        </View>
      </ScrollView>

      <NewSpaceSheet target={newSpace ? target : null} onClose={() => setNewSpace(false)} onCreated={(id) => { void reload().then(() => selectSpace(id)); }} />
      <DeleteSpaceSheet
        target={deleting && space ? spaceTarget(space) : null}
        space={deleting && space ? { id: spaceTarget(space)?.id ?? space.id, name: title } : null}
        onClose={() => setDeleting(false)}
        onDeleted={() => void reload()}
      />
    </View>
  );
}

/** Una tarea de Inicio: se desliza (Fijar · Archivar) y su pulsación larga abre el menú junto a ella. */
function TaskRow({ task, menu, onPin, onArchive, render }: { task: Task; menu: MenuItem[]; onPin: () => void; onArchive: () => void; render: (onLongPress: () => void) => React.ReactNode }) {
  const theme = useTheme();
  const anchor = useMenuAnchor();
  const opened = useRef(false);
  opened.current = !!anchor.rect;
  return (
    <View ref={anchor.ref} collapsable={false}>
      <SwipeRow
        testID={`swipe-${task.host}-${task.id}`}
        actions={[
          { key: "pin", label: w(isPinned(task) ? "projects.sessions.unpin" : "projects.sessions.pin"), icon: "pin", color: theme.approving, onPress: onPin },
          { key: "archive", label: w("projects.hover_card.archive"), icon: "archive", color: theme.merged, onPress: onArchive },
        ]}
      >
        {render(() => void anchor.open(true))}
      </SwipeRow>
      <Popover testID={`menu-${task.host}-${task.id}`} anchor={anchor.rect} items={menu} onClose={anchor.close} align="end" />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  top: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingBottom: 6 },
  chip: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 40, paddingLeft: 6, paddingRight: 12, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, flexShrink: 1, marginRight: "auto" },
  chipText: { fontSize: TEXT.lead, fontWeight: "700", flexShrink: 1 },
  tools: { flexDirection: "row", borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  tool: { width: 44, height: 40, alignItems: "center", justifyContent: "center" },
  avatarTap: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 22 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#ffffff", fontWeight: "700", fontSize: TEXT.body },
  avatarDot: { position: "absolute", top: 3, right: 3, width: 12, height: 12, borderRadius: RADIUS.md, borderWidth: 2 },
  done: { marginLeft: "auto", minHeight: 40, paddingHorizontal: 18, borderRadius: 20, justifyContent: "center" },
  pullSearch: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, marginBottom: 8, height: 44, borderRadius: 12, paddingHorizontal: 12 },
  renameInput: { borderWidth: 1.5, borderRadius: RADIUS.lg, paddingHorizontal: 6, minHeight: 48 },
  faces: { flexDirection: "row", alignItems: "center", gap: 8 },
  faceRow: { flexDirection: "row" },
  notice: { marginHorizontal: 16, marginBottom: 12, padding: 12, borderRadius: 12, fontSize: TEXT.body },
  empty: { paddingHorizontal: 32, paddingVertical: 8, fontSize: TEXT.body },
});
