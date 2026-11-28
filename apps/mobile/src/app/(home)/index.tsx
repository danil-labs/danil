import { TEXT } from "@terminus/design";
import * as Crypto from "expo-crypto";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Keyboard, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAccount } from "../../lib/account";
import { carryForNewTask } from "../../lib/carry";
import {
  baseBranchesOf,
  createTask,
  foldersForNewTask,
  runShell,
  shareSpace,
  suggestedDefaults,
  usableProviders,
  type BranchList,
  type Folder,
} from "../../lib/engine";
import { failureKey } from "../../lib/failureNotice";
import { HostError } from "../../lib/hosts";
import { hasKey, t, w } from "../../lib/i18n";
import { useMachines } from "../../lib/machines";
import { store } from "../../lib/store";
import { spaceName, useWorkspaces } from "../../lib/workspaces";
import { AddFolderSheets, type AddFolderMode } from "../../ui/AddFolder";
import { AgentAvatar } from "../../ui/AgentAvatar";
import { BrandMark } from "../../ui/BrandMark";
import { openTask } from "../../ui/components";
import { Composer, SelectorChip, type Submission } from "../../ui/Composer";
import { HeaderToolsDial } from "../../ui/HeaderToolsDial";
import { Icon } from "../../ui/Icon";
import { KeyboardScreen } from "../../ui/KeyboardScreen";
import { MachineNote } from "../../ui/MachineNote";
import { MobileDrawer } from "../../ui/MobileDrawer";
import { matches, NoMatch } from "../../ui/Search";
import { Sheet, SheetOption } from "../../ui/Sheet";
import { useTheme } from "../../ui/theme";

const firstNameOf = (name: string | null | undefined) => {
  const clean = (name ?? "").trim();
  if (!clean) return null;
  return clean.split(/\s+/)[0] || null;
};

/**
 * Chat-first mobile home screen (Claude-style):
 *   - Minimal 2-button header: left `=` opens `MobileDrawer`; right `[⊞]` expands
 *     into 3 individual animated floating buttons (Search, Subtasks, Files).
 *   - Centered real Danil brand mark + warm greeting.
 *   - Slim mobile `Composer` pill at the bottom with Machine & Project selector
 *     chips directly above it.
 */
export default function Home() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ folder?: string; agent?: string; host?: string }>();
  const { name } = useAccount();
  const { hosts, fleet, preferred, rememberMachine, tick } = useMachines();
  const { current, snapshot, loading, space, spaceCatalogManaged, recordTaskSpace, hostsOfCurrent, reload } =
    useWorkspaces();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [hostId, setHostId] = useState<string | null>(null);
  const [folder, setFolder] = useState<string | null>(null);
  const [agent, setAgent] = useState<string | null>(null);
  const [branch, setBranch] = useState<string | null>(null);
  const [branches, setBranches] = useState<BranchList | null>(null);
  const [picker, setPicker] = useState<"machine" | "folder" | "branch" | "agent" | AddFolderMode | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [waking, setWaking] = useState(false);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    if (params.folder) setFolder(params.folder);
    if (params.host) setHostId(params.host);
    if (params.agent !== undefined) setAgent(params.agent || null);
  }, [params.folder, params.agent, params.host]);

  const host = hostsOfCurrent.find((h) => h.id === hostId) ?? preferred(hostsOfCurrent);
  const folders = foldersForNewTask(snapshot?.folders ?? [], space, host?.id);
  const target = folders.find((f) => f.id === folder) ?? folders[0] ?? null;
  const folderId = target?.id ?? "";
  const workspace = host ? (current?.members.get(host.id) ?? null) : null;
  const agents = (snapshot?.agents ?? []).filter((a) =>
    a.places.some((p) => p.host === host?.id && p.folder === folderId),
  );
  const chosenAgent = agents.some((a) => a.name === agent) ? agent : null;
  const act = host?.canAct();
  const power = host?.power();
  const defaults =
    host && workspace
      ? suggestedDefaults(snapshot?.tasks ?? [], host.id, workspace, chosenAgent)
      : { provider: null, model: null };
  const hostProviders = host ? (snapshot?.providers[host.id] ?? []) : [];
  const hasProvider = Boolean(defaults.provider || usableProviders(hostProviders).length);
  void tick;

  useEffect(() => {
    setBranches(null);
    setBranch(null);
    if (!host || !workspace || !target || power !== "on") return;
    let alive = true;
    void baseBranchesOf(host, workspace, target.id).then((b) => alive && setBranches(b));
    return () => {
      alive = false;
    };
  }, [host, workspace, target?.id, power]);

  const selectedBranch = branch ?? branches?.selected ?? null;
  const branchLabel = branches?.branches.find((b) => b.reference === selectedBranch)?.name ?? selectedBranch;
  const spaceOn = (id: string | undefined) => (id ? (space?.on[id] ?? null) : null);

  async function start(s: Submission) {
    if (!host || workspace === null) return false;
    setNote(null);
    const wakes = act === "wakes" && power !== "on";
    setWaking(wakes);
    if (wakes) setPending(s.shell ? `!${s.command}` : s.prompt);
    try {
      const clientMessageId = Crypto.randomUUID();
      let spaceId: string | null = null;
      if (!spaceCatalogManaged) {
        spaceId = spaceOn(host.id);
        const owner = !spaceId && space ? Object.entries(space.on)[0] : undefined;
        const keeper = owner ? hostsOfCurrent.find((h) => h.id === owner[0]) : undefined;
        const keeperWs = keeper ? current?.members.get(keeper.id) : undefined;
        if (owner && keeper && keeperWs) {
          spaceId = await shareSpace(keeper, keeperWs, owner[1]).then(
            () => owner[1],
            () => null,
          );
        }
      }
      let baseRef = branch;
      let unwrapSnapshot = false;
      const from = target && target.host !== host.id ? hostsOfCurrent.find((h) => h.id === target.host) : undefined;
      const fromWorkspace = from ? (current?.members.get(from.id) ?? null) : null;
      if (target && from && fromWorkspace && from.power() === "on" && !s.shell) {
        setNote(t("new.carrying", { from: from.label, to: host.label }));
        const carried = await carryForNewTask({
          source: { host: from, workspace: fromWorkspace },
          target: { host, workspace },
          folder: target,
          targetHasFolder: false,
          pins: { get: (m) => store.get(`carry.key.${m}`), set: (m, key) => store.set(`carry.key.${m}`, key) },
          newId: () => Crypto.randomUUID(),
        });
        if (carried) {
          baseRef = carried.baseRef;
          unwrapSnapshot = carried.unwrapSnapshot;
        }
        setNote(null);
      }
      const id = s.shell
        ? (
            await runShell(host, workspace, {
              folder: folderId,
              session: null,
              command: s.command,
              provider: s.provider,
              model: s.model,
              effort: s.effort,
              permissionMode: s.permissionMode,
              space: spaceId,
              agent: chosenAgent,
              baseRef,
            })
          ).session
        : await createTask(host, workspace, {
            folder: folderId,
            prompt: s.prompt,
            provider: s.provider,
            model: s.model,
            effort: s.effort,
            permissionMode: s.permissionMode,
            attachments: s.attachments,
            agent: chosenAgent,
            space: spaceId,
            baseRef,
            unwrapSnapshot,
            clientMessageId,
          });
      if (spaceCatalogManaged) void recordTaskSpace(id, space?.id ?? null);
      rememberMachine(host.id);
      openTask(host.id, workspace, folderId, id, false);
      return true;
    } catch (error) {
      if (error instanceof HostError && error.code === "key_changed") {
        setNote(t("new.carry_key_changed", { name: host.label }));
      } else if (error instanceof HostError && error.code === "machine_asleep") {
        setNote(w("web.machines.off_action", { name: host.label }));
      } else if (error instanceof HostError && error.code === "machine_outdated") {
        setNote(w("web.machines.outdated_action", { name: host.label }));
      } else if (error instanceof HostError && (error.code === "start_failed" || error.code === "start_timeout")) {
        setNote(t("machines.start_failed", { name: host.label }));
      } else {
        const clave = failureKey(error);
        if (clave && hasKey(clave)) setNote(t(clave));
        else setNote(t("task.error", { detail: error instanceof Error ? error.message : String(error) }));
      }
      return false;
    } finally {
      setWaking(false);
      setPending(null);
    }
  }

  const stateOf = (h: typeof host) =>
    !h
      ? ""
      : h.power() === "on"
        ? w("web.computers.state.online")
        : h.power() === "starting"
          ? w("web.computers.state.starting")
          : h.power() === "outdated"
            ? w("web.computers.state.outdated")
            : w("web.computers.state.offline");

  const notice = !host
    ? current
      ? t("new.no_workspace")
      : null
    : waking
      ? w("shell.machines.waking", { name: host.label })
      : act === "asleep"
        ? w("web.machines.off_action", { name: host.label })
        : act === "outdated"
          ? w("web.machines.outdated_action", { name: host.label })
          : act === "wakes" && power === "off"
            ? w("shell.machines.asleep_notice", { name: host.label })
            : !loading && snapshot && power === "on" && !hasProvider
              ? t("new.no_provider")
              : null;

  const firstName = firstNameOf(name);
  const greeting = firstName ? t("home.greeting_name", { name: firstName }) : t("home.greeting");
  const subtitle = [current?.name, space ? spaceName(space, t("space.general")) : null]
    .filter(Boolean)
    .join(" · ");

  const selectProjectForNewTask = (proj: Folder) => {
    setHostId(proj.host);
    setFolder(proj.id);
    setAgent(null);
    setNote(null);
  };

  const resetDraft = () => {
    setAgent(null);
    setBranch(null);
    setNote(null);
  };

  const composerHeader = (
    <View style={styles.selectors}>
      {host ? (
        <SelectorChip
          testID="pick-machine"
          icon="server"
          value={host.label}
          onPress={() => setPicker("machine")}
        />
      ) : null}
      <SelectorChip
        testID="pick-folder"
        value={target?.name ?? t("home.no_project")}
        muted={!target}
        onPress={host && workspace ? () => setPicker("folder") : undefined}
      />
      {branches?.branches.length ? (
        <SelectorChip
          testID="pick-branch"
          icon="git-branch"
          value={branchLabel ?? w("worktrees.base.choose")}
          onPress={() => setPicker("branch")}
        />
      ) : null}
      {agents.length ? (
        <SelectorChip
          testID="pick-agent"
          left={
            chosenAgent ? (
              <AgentAvatar name={chosenAgent} size={15} host={host?.id} folder={target?.id} />
            ) : (
              <Icon name="user-round" size={13} color={theme.textMuted} />
            )
          }
          value={chosenAgent ?? t("new.agent")}
          muted={!chosenAgent}
          onPress={() => setPicker("agent")}
        />
      ) : null}
    </View>
  );

  return (
    <KeyboardScreen style={{ backgroundColor: theme.bg }}>
      {/* Minimal 2-button mobile header: bare left `=` drawer icon + bare right `[⊞]` speed-dial */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Pressable
          testID="home-open-drawer"
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t("drawer.open")}
          onPress={() => {
            Keyboard.dismiss();
            setDrawerOpen(true);
          }}
          style={({ pressed }) => [styles.headerBtn, { opacity: pressed ? 0.5 : 1 }]}
        >
          <Icon name="menu" size={22} color={theme.text} />
        </Pressable>

        <HeaderToolsDial
          testID="home-tools-dial"
          actions={[
            {
              id: "search",
              testID: "dial-search",
              icon: "search",
              label: w("search.title"),
              onPress: () => router.push("/search"),
            },
            {
              id: "subtasks",
              testID: "dial-subtasks",
              icon: "git-fork",
              label: t("task.tools.subtasks_title"),
              disabled: true,
              onPress: () => {},
            },
            {
              id: "files",
              testID: "dial-files",
              icon: "folder",
              label: t("task.tools.files"),
              disabled: true,
              onPress: () => {},
            },
          ]}
        />
      </View>

      {/* Center hero stage: real Danil logo + greeting */}
      <View style={styles.hero} testID="home-chat-stage">
        <MachineNote hosts={hosts} fleet={fleet} />
        <View style={styles.heroCenter}>
          <View style={[styles.logoBadge, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <BrandMark id="danil" size={30} color={theme.text} />
          </View>
          <Text style={[styles.greeting, { color: theme.text }]}>{greeting}</Text>
          {subtitle ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/workspaces")}
              style={({ pressed }) => [styles.contextPill, { opacity: pressed ? 0.65 : 1 }]}
            >
              <Text numberOfLines={1} style={[styles.contextText, { color: theme.textMuted }]}>
                {subtitle}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {pending && waking ? (
        <View style={[styles.pending, { backgroundColor: theme.userBubble, borderColor: theme.border }]}>
          <Text style={{ color: theme.text, fontSize: TEXT.lead, lineHeight: 21 }}>{pending}</Text>
        </View>
      ) : null}
      {notice || note ? (
        <View style={styles.notes}>
          {notice ? <Text style={{ color: theme.textMuted, fontSize: TEXT.ui }}>{notice}</Text> : null}
          {note ? <Text style={{ color: theme.error, fontSize: TEXT.ui }}>{note}</Text> : null}
        </View>
      ) : null}

      {/* Existing thin mobile Composer pill with Machine & Project selector chips */}
      <Composer
        testID="new-message"
        host={host ?? undefined}
        workspace={workspace}
        folder={host && workspace !== null ? folderId : null}
        session={null}
        providers={host ? (snapshot?.providers[host.id] ?? []) : []}
        provider={defaults.provider}
        model={defaults.model}
        permissionMode={current?.defaultPermissionMode ?? null}
        disabled={!host || workspace === null || act === "asleep" || act === "outdated" || waking}
        placeholder={t("new.placeholder")}
        header={composerHeader}
        onSubmit={start}
        onAccounts={() => router.push("/accounts")}
      />

      {/* Left slide-over Claude-style navigation drawer */}
      <MobileDrawer
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        activeProjectId={target?.id ?? null}
        onNewTask={resetDraft}
        onNewTaskInProject={selectProjectForNewTask}
        onAddProject={host && workspace ? () => setPicker("new-folder") : undefined}
      />

      {/* Pickers for Machine, Project, Branch, Agent, and Create/Clone Project */}
      <Sheet
        visible={picker === "machine"}
        title={w("shell.machines.label")}
        search={t("search.machines")}
        onClose={() => setPicker(null)}
      >
        {(query) => {
          const shown = hostsOfCurrent.filter((h) => matches(query, h.label));
          return shown.length ? (
            shown.map((h) => (
              <SheetOption
                key={h.id}
                testID={`machine-${h.id}`}
                icon="server"
                label={h.label}
                detail={`${stateOf(h)} · ${h.managed ? t("machines.managed") : t("machines.own")}`}
                selected={h.id === host?.id}
                onPress={() => {
                  setHostId(h.id);
                  setFolder(null);
                  setPicker(null);
                }}
              />
            ))
          ) : (
            <NoMatch />
          );
        }}
      </Sheet>

      <Sheet
        visible={picker === "folder"}
        title={t("home.project")}
        search={t("search.folders")}
        onClose={() => setPicker(null)}
      >
        {(query) => {
          const shown = folders.filter((f) => matches(query, f.name, f.working_directory));
          return (
            <>
              {shown.length ? (
                shown.map((f) => (
                  <SheetOption
                    key={f.key}
                    testID={`folder-${f.id}`}
                    label={f.name}
                    detail={
                      f.host === host?.id
                        ? (f.working_directory ?? null)
                        : t("new.carry_from", {
                            name: hostsOfCurrent.find((h) => h.id === f.host)?.label ?? f.host,
                          })
                    }
                    selected={f.id === target?.id}
                    onPress={() => {
                      setFolder(f.id);
                      setPicker(null);
                    }}
                  />
                ))
              ) : (
                <NoMatch />
              )}
              <SheetOption
                testID="add-folder"
                icon="plus"
                label={t("folder.new")}
                disabled={act === "asleep" || act === "outdated"}
                onPress={() => setPicker("new-folder")}
              />
              <SheetOption
                testID="add-clone"
                icon="git-branch"
                label={t("clone.title")}
                disabled={act === "asleep" || act === "outdated"}
                onPress={() => setPicker("clone")}
              />
            </>
          );
        }}
      </Sheet>

      <AddFolderSheets
        mode={picker === "clone" || picker === "new-folder" ? picker : null}
        host={host ?? undefined}
        workspace={workspace}
        space={spaceOn(host?.id)}
        onClose={() => setPicker(null)}
        onDone={(project) => {
          setFolder(project.id);
          setPicker(null);
          void reload();
        }}
      />

      <Sheet
        visible={picker === "branch"}
        title={w("worktrees.base.from")}
        search={t("search.branches")}
        onClose={() => setPicker(null)}
      >
        {(query) => {
          const shown = (branches?.branches ?? []).filter((b) => matches(query, b.name, b.detail));
          return shown.length ? (
            shown.map((b) => (
              <SheetOption
                key={b.reference}
                icon="git-branch"
                label={b.name}
                detail={b.detail}
                selected={b.reference === selectedBranch}
                onPress={() => {
                  setBranch(b.reference === branches?.selected ? null : b.reference);
                  setPicker(null);
                }}
              />
            ))
          ) : (
            <NoMatch />
          );
        }}
      </Sheet>

      <Sheet
        visible={picker === "agent"}
        title={t("new.agent")}
        search={t("search.agents")}
        onClose={() => setPicker(null)}
      >
        {(query) => {
          const shown = agents.filter((a) => matches(query, a.name, a.description));
          return (
            <>
              {query.trim() ? null : (
                <SheetOption
                  icon="user-round"
                  label={t("new.no_agent")}
                  selected={!chosenAgent}
                  onPress={() => {
                    setAgent(null);
                    setPicker(null);
                  }}
                />
              )}
              {shown.length ? (
                shown.map((a) => (
                  <SheetOption
                    key={a.name}
                    testID={`agent-${a.name}`}
                    left={<AgentAvatar name={a.name} size={22} />}
                    label={a.name}
                    detail={a.description}
                    selected={chosenAgent === a.name}
                    onPress={() => {
                      setAgent(a.name);
                      setPicker(null);
                    }}
                  />
                ))
              ) : (
                <NoMatch />
              )}
            </>
          );
        }}
      </Sheet>
    </KeyboardScreen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
    zIndex: 50,
  },
  headerBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  hero: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  heroCenter: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingBottom: 24,
  },
  logoBadge: {
    width: 58,
    height: 58,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  greeting: {
    fontSize: 24,
    fontWeight: "600",
    letterSpacing: -0.4,
    textAlign: "center",
  },
  contextPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  contextText: {
    fontSize: TEXT.ui,
    textAlign: "center",
  },
  notes: {
    paddingHorizontal: 16,
    paddingBottom: 6,
    gap: 4,
  },
  pending: {
    alignSelf: "flex-end",
    maxWidth: "92%",
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 14,
    padding: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  selectors: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingHorizontal: 2,
  },
});
