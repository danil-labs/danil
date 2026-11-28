import { TEXT } from "@terminus/design";
import { dockStatusText, orderDockAgents, taskTitle } from "@terminus/tasks";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAccount } from "../lib/account";
import { ALPHA_DEMO, ALPHA_ORDINARY } from "../lib/alpha-mode";
import { cardOf, familyTasks, marksOf } from "../lib/cards";
import { useCustomization } from "../lib/customization";
import { foldersForNewTask, taskInSpace, taskKey, type Folder, type Task } from "../lib/engine";
import { folderByKey } from "../lib/folderIcon";
import { lang, t, w } from "../lib/i18n";
import { useInbox } from "../lib/inbox";
import { useMachines } from "../lib/machines";
import { shortWhen } from "../lib/when";
import { useWorkspaces } from "../lib/workspaces";
import { AgentAvatar } from "./AgentAvatar";
import { BrandMark } from "./BrandMark";
import { openTask } from "./components";
import { Icon } from "./Icon";
import { CountBadge, Tap } from "./list";
import { SidebarCard, SidebarCardAction } from "./SidebarCard";
import { TaskMark } from "./TaskStatus";
import { SCRIM, useTheme } from "./theme";
import { WorkspaceAvatar } from "./WorkspaceAvatar";

const MESSAGING_URL = "https://messaging.danil.ai";

const initials = (text: string | null | undefined) =>
  (text ?? "")
    .split(/[@\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";

/**
 * Claude-style left navigation drawer for mobile (`apps/mobile` & `/m/`).
 *
 * Order (exact parity with desktop):
 *   1. Nueva tarea (ONLY at top — never repeated at bottom)
 *   2. Mensajería
 *   3. Proyectos (collapsible dropdown of `SidebarCard`s without folder icon, each with `+`)
 *   4. Tus agentes (Orca style: collapsed `justify-between` with snug avatars + `+`; expanded vertical `SidebarCard`s)
 *   5. Tareas (recent tasks as `SidebarCard`s)
 * Footer: account/profile row only.
 */
export function MobileDrawer({
  visible,
  onClose,
  activeTaskId = null,
  activeProjectId = null,
  onNewTask,
  onNewTaskInProject,
  onAddProject,
}: {
  visible: boolean;
  onClose: () => void;
  activeTaskId?: string | null;
  activeProjectId?: string | null;
  onNewTask: () => void;
  onNewTaskInProject: (folder: Folder) => void;
  onAddProject?: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const drawerWidth = Math.min(Math.round(windowWidth * 0.86), 348);

  const { email, name } = useAccount();
  const customization = useCustomization();
  const inbox = useInbox();
  const { attention, hosts } = useMachines();
  const { current, snapshot, space } = useWorkspaces();

  const [mounted, setMounted] = useState(visible);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [agentsOpen, setAgentsOpen] = useState(false);
  const [agentSearchOpen, setAgentSearchOpen] = useState(false);
  const [agentQuery, setAgentQuery] = useState("");

  const progress = useSharedValue(visible ? 1 : 0);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      progress.value = withTiming(1, { duration: 240, easing: Easing.out(Easing.cubic) });
    } else {
      progress.value = withTiming(0, { duration: 200, easing: Easing.in(Easing.cubic) }, (finished) => {
        if (finished) runOnJS(setMounted)(false);
      });
    }
  }, [visible, progress]);

  const scrimStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (progress.value - 1) * drawerWidth }],
  }));

  const marks = useMemo(
    () => marksOf(attention, current?.members, snapshot?.live ?? new Set()),
    [attention, current?.members, snapshot?.live],
  );

  const tasks = useMemo(
    () =>
      familyTasks(
        (snapshot?.tasks ?? []).filter((task) => taskInSpace(task, space)),
        snapshot?.delegated ?? [],
        marks,
      ).sort((a, b) => (b.last_turn_at ?? b.updated_at) - (a.last_turn_at ?? a.updated_at)),
    [snapshot?.tasks, snapshot?.delegated, space, marks],
  );

  const projects = useMemo(
    () => foldersForNewTask(snapshot?.folders ?? [], space, undefined),
    [snapshot?.folders, space],
  );

  const taskCountByFolder = useMemo(() => {
    const counts = new Map<string, number>();
    for (const task of tasks) {
      if (task.folder) counts.set(task.folder, (counts.get(task.folder) ?? 0) + 1);
    }
    return counts;
  }, [tasks]);

  const allAgents = useMemo(() => {
    const raw = (snapshot?.agents ?? []).filter((a) => a.workspace);
    const label = (a: { name: string; displayName?: string | null }) => a.displayName || a.name;
    return orderDockAgents(raw, label);
  }, [snapshot?.agents]);

  const filteredAgents = useMemo(() => {
    const q = agentSearchOpen ? agentQuery.trim().toLowerCase() : "";
    if (!q) return allAgents;
    return allAgents.filter((a) =>
      `${a.displayName || ""} ${a.name} ${a.description || ""}`.toLowerCase().includes(q),
    );
  }, [allAgents, agentSearchOpen, agentQuery]);

  const machineName = (id: string) => hosts.find((h) => h.id === id)?.label ?? id;
  const folderName = (task: Task) => {
    const f = folderByKey(snapshot?.folders ?? [], task.folderKey);
    return f?.name ?? (task.folder || null);
  };

  const alphaInboxEnabled =
    process.env.EXPO_PUBLIC_TERMINUS_ALPHA === "1" && !ALPHA_ORDINARY && customization.enabled("inbox");
  const unread = alphaInboxEnabled ? inbox.rows.reduce((sum, row) => sum + row.unread_count, 0) : 0;

  const openMessaging = () => {
    onClose();
    if (alphaInboxEnabled) {
      router.push((ALPHA_DEMO ? "/inbox?demo=1" : "/inbox") as never);
      return;
    }
    void Linking.openURL(MESSAGING_URL);
  };

  const openAgent = (agentName: string) => {
    onClose();
    if (current) {
      router.push({ pathname: "/agent/[workspace]/[name]", params: { workspace: current.id, name: agentName } });
    } else {
      router.push("/agents");
    }
  };

  const taskCountLabel = (count: number) =>
    count === 1 ? t("drawer.task_single") : t("drawer.tasks_count", { count });

  if (!mounted) return null;

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View style={styles.root}>
        <Animated.View style={[styles.scrim, scrimStyle]}>
          <Pressable
            testID="drawer-scrim"
            accessibilityRole="button"
            accessibilityLabel={t("drawer.close")}
            style={StyleSheet.absoluteFill}
            onPress={onClose}
          />
        </Animated.View>

        <Animated.View
          testID="mobile-drawer"
          style={[
            styles.panel,
            panelStyle,
            {
              width: drawerWidth,
              backgroundColor: theme.surface,
              borderRightColor: theme.border,
              paddingTop: insets.top + 8,
              paddingBottom: Math.max(insets.bottom, 10),
            },
          ]}
        >
          {/* Drawer top bar: real Danil logo + workspace switcher + close */}
          <View style={styles.topBar}>
            <Tap
              testID="drawer-workspace-switcher"
              accessibilityRole="button"
              accessibilityLabel={t("home.switch")}
              onPress={() => {
                onClose();
                router.push("/workspaces");
              }}
              style={[styles.brandButton, { backgroundColor: theme.muted }]}
            >
              <BrandMark id="danil" size={18} color={theme.text} />
              <WorkspaceAvatar id={current?.id} name={current?.name ?? "D"} size={20} />
              <Text numberOfLines={1} style={[styles.brandName, { color: theme.text }]}>
                {current?.name ?? w("common.brand_name")}
              </Text>
              <Icon name="chevron-down" size={13} color={theme.textMuted} />
            </Tap>
            <Tap
              testID="drawer-close"
              accessibilityRole="button"
              accessibilityLabel={t("drawer.close")}
              onPress={onClose}
              style={styles.iconBtn}
            >
              <Icon name="x" size={19} color={theme.textMuted} />
            </Tap>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* 1. Nueva tarea (ONLY at top — never duplicated in footer) */}
            <Pressable
              testID="drawer-new-task"
              accessibilityRole="button"
              accessibilityLabel={w("shell.sidebar.new_task")}
              onPress={() => {
                onClose();
                onNewTask();
              }}
              style={({ pressed }) => [
                styles.newTaskBtn,
                { backgroundColor: theme.text, opacity: pressed ? 0.86 : 1 },
              ]}
            >
              <View style={styles.newTaskLeft}>
                <Icon name="square-pen" size={16} color={theme.onPrimary} />
                <Text style={[styles.newTaskText, { color: theme.onPrimary }]}>
                  {w("shell.sidebar.new_task")}
                </Text>
              </View>
              <Icon name="plus" size={16} color={theme.onPrimary} />
            </Pressable>

            {/* 2. Mensajería */}
            <Pressable
              testID="drawer-messaging"
              accessibilityRole="button"
              accessibilityLabel={t("drawer.messaging")}
              onPress={openMessaging}
              style={({ pressed }) => [
                styles.navRow,
                { backgroundColor: pressed ? theme.muted : "transparent" },
              ]}
            >
              <Icon name="message-square" size={17} color={theme.textMuted} />
              <Text style={[styles.navRowLabel, { color: theme.text }]}>{t("drawer.messaging")}</Text>
              {unread > 0 ? <CountBadge count={unread} /> : null}
            </Pressable>

            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            {/* 3. Proyectos (collapsible dropdown of SidebarCards — NO folder icon) */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Pressable
                  testID="drawer-projects-toggle"
                  accessibilityRole="button"
                  accessibilityState={{ expanded: projectsOpen }}
                  onPress={() => setProjectsOpen((open) => !open)}
                  style={styles.sectionTitleBtn}
                >
                  <Icon
                    name={projectsOpen ? "chevron-down" : "chevron-right"}
                    size={15}
                    color={theme.textMuted}
                  />
                  <Text style={[styles.sectionTitle, { color: theme.text }]}>
                    {t("drawer.projects")}
                  </Text>
                </Pressable>
                {onAddProject ? (
                  <Tap
                    testID="drawer-add-project"
                    accessibilityRole="button"
                    accessibilityLabel={t("folder.new")}
                    onPress={() => {
                      onClose();
                      onAddProject();
                    }}
                    style={styles.smallAction}
                  >
                    <Icon name="plus" size={16} color={theme.textMuted} />
                  </Tap>
                ) : null}
              </View>

              {projectsOpen ? (
                <View style={styles.cardList}>
                  {projects.length === 0 ? (
                    <Text style={[styles.emptyHint, { color: theme.textMuted }]}>
                      {t("drawer.projects_empty")}
                    </Text>
                  ) : (
                    projects.map((project) => {
                      const count = taskCountByFolder.get(project.id) ?? 0;
                      return (
                        <SidebarCard
                          key={project.key}
                          testID={`drawer-project-${project.id}`}
                          active={activeProjectId === project.id}
                          title={project.name}
                          subtitle={count > 0 ? taskCountLabel(count) : undefined}
                          onPress={() => {
                            onClose();
                            onNewTaskInProject(project);
                          }}
                          trailing={
                            <SidebarCardAction
                              testID={`drawer-project-new-${project.id}`}
                              accessibilityLabel={t("drawer.new_task_in", { name: project.name })}
                              onPress={() => {
                                onClose();
                                onNewTaskInProject(project);
                              }}
                            >
                              <Icon name="plus" size={14} color={theme.text} />
                            </SidebarCardAction>
                          }
                        />
                      );
                    })
                  )}
                </View>
              ) : null}
            </View>

            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            {/* 4. Tus agentes (Orca style: justify-between with snug avatars + `+` when collapsed) */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Pressable
                  testID="drawer-agents-toggle"
                  accessibilityRole="button"
                  accessibilityState={{ expanded: agentsOpen }}
                  onPress={() => setAgentsOpen((open) => !open)}
                  style={styles.sectionTitleBtn}
                >
                  <Icon
                    name={agentsOpen ? "chevron-down" : "chevron-right"}
                    size={15}
                    color={theme.textMuted}
                  />
                  <Text style={[styles.sectionTitle, { color: theme.text }]}>
                    {w("shell.agent_dock.title")}
                  </Text>
                </Pressable>

                <View style={styles.sectionRight}>
                  {!agentsOpen ? (
                    allAgents.length > 0 ? (
                      <View style={styles.avatarCluster} testID="drawer-agents-strip">
                        {allAgents.slice(0, 4).map((agent, idx) => (
                          <Pressable
                            key={agent.name}
                            accessibilityRole="button"
                            accessibilityLabel={agent.displayName || agent.name}
                            onPress={() => openAgent(agent.name)}
                            style={[
                              styles.miniAvatarWrap,
                              {
                                marginLeft: idx === 0 ? 0 : -7,
                                borderColor: theme.surface,
                                backgroundColor: theme.muted,
                              },
                            ]}
                          >
                            <AgentAvatar name={agent.name} size={22} />
                            {agent.status === "working" ? (
                              <View
                                style={[
                                  styles.miniStatusDot,
                                  { backgroundColor: theme.success, borderColor: theme.surface },
                                ]}
                              />
                            ) : null}
                          </Pressable>
                        ))}
                      </View>
                    ) : null
                  ) : (
                    <Tap
                      testID="drawer-agents-search-toggle"
                      accessibilityRole="button"
                      accessibilityLabel={t("search.agents")}
                      onPress={() => setAgentSearchOpen((open) => !open)}
                      style={[
                        styles.smallAction,
                        agentSearchOpen ? { backgroundColor: theme.muted } : null,
                      ]}
                    >
                      <Icon name="search" size={15} color={agentSearchOpen ? theme.text : theme.textMuted} />
                    </Tap>
                  )}

                  <Tap
                    testID="drawer-agents-all"
                    accessibilityRole="button"
                    accessibilityLabel={w("shell.agent_dock.see_all")}
                    onPress={() => {
                      onClose();
                      router.push("/agents");
                    }}
                    style={styles.smallAction}
                  >
                    <Icon name="plus" size={16} color={theme.textMuted} />
                  </Tap>
                </View>
              </View>

              {agentsOpen ? (
                <View style={styles.cardList}>
                  {agentSearchOpen ? (
                    <View style={[styles.searchBox, { backgroundColor: theme.muted, borderColor: theme.border }]}>
                      <Icon name="search" size={14} color={theme.textMuted} />
                      <TextInput
                        testID="drawer-agents-search"
                        value={agentQuery}
                        onChangeText={setAgentQuery}
                        placeholder={t("search.agents")}
                        placeholderTextColor={theme.textMuted}
                        autoCorrect={false}
                        autoCapitalize="none"
                        style={[styles.searchInput, { color: theme.text }]}
                      />
                    </View>
                  ) : null}

                  {filteredAgents.length === 0 ? (
                    <Text style={[styles.emptyHint, { color: theme.textMuted }]}>
                      {t("drawer.agents_empty")}
                    </Text>
                  ) : (
                    filteredAgents.map((agent) => {
                      const display = agent.displayName || agent.name;
                      const subtitle = agent.description?.trim() || dockStatusText(lang, agent);
                      return (
                        <SidebarCard
                          key={agent.name}
                          testID={`drawer-agent-${agent.name}`}
                          title={display}
                          subtitle={subtitle}
                          onPress={() => openAgent(agent.name)}
                          leading={
                            <View
                              style={[
                                styles.agentAvatarBox,
                                { backgroundColor: theme.surface, borderColor: theme.border },
                              ]}
                            >
                              <AgentAvatar name={agent.name} size={26} />
                              {agent.status === "working" ? (
                                <View
                                  style={[
                                    styles.cardStatusDot,
                                    { backgroundColor: theme.success, borderColor: theme.surface },
                                  ]}
                                />
                              ) : null}
                            </View>
                          }
                          trailing={<Icon name="chevron-right" size={15} color={theme.textMuted} />}
                        />
                      );
                    })
                  )}
                </View>
              ) : null}
            </View>

            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            {/* 5. Tareas */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>
                  {t("home.title")}
                </Text>
                {tasks.length > 0 ? (
                  <Text style={[styles.countText, { color: theme.textMuted }]}>{tasks.length}</Text>
                ) : null}
              </View>

              <View style={styles.cardList}>
                {tasks.length === 0 ? (
                  <Text style={[styles.emptyHint, { color: theme.textMuted }]}>
                    {t("home.empty")}
                  </Text>
                ) : (
                  tasks.slice(0, 25).map((task) => {
                    const card = cardOf(task, marks);
                    const folder = folderName(task);
                    const machine = machineName(task.host);
                    const when = shortWhen(task.last_turn_at ?? task.updated_at, lang);
                    const meta = [folder, machine].filter(Boolean).join(" · ");
                    return (
                      <SidebarCard
                        key={taskKey(task)}
                        testID={`drawer-task-${task.id}`}
                        active={activeTaskId === task.id}
                        title={taskTitle(lang, task) || task.id}
                        subtitle={meta || undefined}
                        onPress={() => {
                          onClose();
                          openTask(task.host, task.workspace, task.folder, task.id);
                        }}
                        leading={<TaskMark state={card.state} />}
                        trailing={
                          <Text style={[styles.whenText, { color: theme.textMuted }]}>{when}</Text>
                        }
                      />
                    );
                  })
                )}
              </View>
            </View>
          </ScrollView>

          {/* Clean footer: account / profile ONLY (NO duplicate Nueva tarea button) */}
          <View style={[styles.footer, { borderTopColor: theme.border }]}>
            <Pressable
              testID="drawer-profile"
              accessibilityRole="button"
              accessibilityLabel={t("profile.title")}
              onPress={() => {
                onClose();
                router.push("/profile");
              }}
              style={({ pressed }) => [
                styles.profileRow,
                { backgroundColor: pressed ? theme.muted : "transparent" },
              ]}
            >
              <View style={[styles.avatar, { backgroundColor: theme.merged }]}>
                <Text style={styles.avatarText}>{initials(name ?? email)}</Text>
              </View>
              <View style={styles.profileInfo}>
                <Text numberOfLines={1} style={[styles.profileName, { color: theme.text }]}>
                  {name || email || t("profile.title")}
                </Text>
                {name && email ? (
                  <Text numberOfLines={1} style={[styles.profileSub, { color: theme.textMuted }]}>
                    {email}
                  </Text>
                ) : null}
              </View>
              <Icon name="settings" size={17} color={theme.textMuted} />
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: "row",
  },
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: SCRIM,
  },
  panel: {
    height: "100%",
    borderRightWidth: StyleSheet.hairlineWidth,
    shadowColor: "#000",
    shadowOpacity: 0.24,
    shadowRadius: 24,
    shadowOffset: { width: 4, height: 0 },
    elevation: 16,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  brandButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    flexShrink: 1,
    minHeight: 36,
  },
  brandName: {
    fontSize: TEXT.body,
    fontWeight: "700",
    flexShrink: 1,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 14,
    paddingBottom: 16,
    gap: 10,
  },
  newTaskBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 12,
    paddingHorizontal: 14,
    minHeight: 44,
  },
  newTaskLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  newTaskText: {
    fontSize: TEXT.body,
    fontWeight: "700",
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 10,
    paddingHorizontal: 10,
    minHeight: 40,
  },
  navRowLabel: {
    flex: 1,
    fontSize: TEXT.body,
    fontWeight: "500",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 2,
  },
  section: {
    gap: 8,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    minHeight: 34,
  },
  sectionTitleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
    paddingVertical: 4,
  },
  sectionTitle: {
    fontSize: TEXT.ui,
    fontWeight: "600",
  },
  sectionRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  smallAction: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarCluster: {
    flexDirection: "row",
    alignItems: "center",
  },
  miniAvatarWrap: {
    position: "relative",
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  miniStatusDot: {
    position: "absolute",
    right: -1,
    bottom: -1,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
  },
  agentAvatarBox: {
    position: "relative",
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  cardStatusDot: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    borderWidth: 1.5,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    height: 36,
  },
  searchInput: {
    flex: 1,
    fontSize: TEXT.ui,
    minWidth: 0,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
  },
  cardList: {
    gap: 6,
  },
  emptyHint: {
    fontSize: TEXT.caption,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  countText: {
    fontSize: TEXT.caption,
    fontWeight: "600",
  },
  whenText: {
    fontSize: TEXT.caption,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingTop: 8,
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#ffffff",
    fontSize: TEXT.ui,
    fontWeight: "700",
  },
  profileInfo: {
    flex: 1,
    minWidth: 0,
  },
  profileName: {
    fontSize: TEXT.ui,
    fontWeight: "600",
  },
  profileSub: {
    fontSize: TEXT.caption,
  },
});
