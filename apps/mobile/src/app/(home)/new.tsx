import { TEXT } from "@terminus/design";
import * as Crypto from "expo-crypto";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { AgentAvatar } from "../../ui/AgentAvatar";
import { carryForNewTask } from "../../lib/carry";
import { baseBranchesOf, createTask, runShell, shareSpace, suggestedDefaults, type BranchList } from "../../lib/engine";
import { store } from "../../lib/store";
import { HostError } from "../../lib/hosts";
import { t, w } from "../../lib/i18n";
import { useMachines } from "../../lib/machines";
import { spaceName, useWorkspaces } from "../../lib/workspaces";
import { AddFolderSheets, type AddFolderMode } from "../../ui/AddFolder";
import { openTask } from "../../ui/components";
import { Composer, SelectorChip, type Submission } from "../../ui/Composer";
import { Icon } from "../../ui/Icon";
import { KeyboardScreen } from "../../ui/KeyboardScreen";
import { matches, NoMatch } from "../../ui/Search";
import { Sheet, SheetOption } from "../../ui/Sheet";
import { FolderIcon } from "../../ui/FolderIcon";
import { useTheme } from "../../ui/theme";

/**
 * «Nueva tarea» (el lápiz de arriba en Tareas): la tarea nueva del escritorio. Arriba el workspace; abajo
 * el cuadro de escribir con sus selectores encima: en qué máquina («Ejecutar
 * en», solo con más de una), en qué carpeta, desde qué rama base (si la
 * carpeta tiene git) y con qué agente. La máquina por omisión es la última
 * usada o la VM de Danil; una VM apagada se enciende al empezar, una máquina
 * propia apagada no.
 */
export default function NewTask() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ folder?: string; agent?: string; host?: string }>();
  const { preferred, rememberMachine, tick } = useMachines();
  const { current, snapshot, space, hostsOfCurrent, reload } = useWorkspaces();
  const [hostId, setHostId] = useState<string | null>(null);
  const [folder, setFolder] = useState<string | null>(null);
  const [agent, setAgent] = useState<string | null>(null);
  const [branch, setBranch] = useState<string | null>(null);
  const [branches, setBranches] = useState<BranchList | null>(null);
  const [picker, setPicker] = useState<"machine" | "folder" | "branch" | "agent" | AddFolderMode | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [waking, setWaking] = useState(false);
  // Lo que se mandó mientras la VM enciende: sin él, el mensaje desaparece el minuto o dos que tarda.
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    if (params.folder) setFolder(params.folder);
    if (params.host) setHostId(params.host);
    setAgent(params.agent ?? null);
  }, [params.folder, params.agent, params.host]);

  const host = hostsOfCurrent.find((h) => h.id === hostId) ?? preferred(hostsOfCurrent);
  const visible = (snapshot?.folders ?? []).filter((f) => !space || space.folders.includes(f.key));
  const here = visible.filter((f) => f.host === host?.id);
  // Una carpeta de git de otra máquina del workspace también vale: su trabajo se lleva al crear la tarea.
  const elsewhere = visible.filter((f) => f.host !== host?.id && f.kind !== "folder" && !here.some((h) => h.id === f.id));
  const folders = [...here, ...elsewhere.filter((f, i) => elsewhere.findIndex((x) => x.id === f.id) === i)];
  const target = folders.find((f) => f.id === folder) ?? folders[0] ?? null;
  // El id del workspace en esa máquina: cada motor tiene el suyo.
  const workspace = host ? (current?.members.get(host.id) ?? null) : null;
  const agents = (snapshot?.agents ?? []).filter((a) => a.places.some((p) => p.host === host?.id && p.folder === target?.id));
  const chosenAgent = agents.some((a) => a.name === agent) ? agent : null;
  const act = host?.canAct();
  const power = host?.power();
  const defaults = host && workspace ? suggestedDefaults(snapshot?.tasks ?? [], host.id, workspace, chosenAgent) : { provider: null, model: null };
  void tick;

  // Las ramas base de la carpeta, si tiene git y la máquina contesta. Leer no enciende nada.
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

  // Cada máquina tiene sus ids de space; una que no tiene este, ninguno.
  const spaceOn = (id: string | undefined) => (id ? (space?.on[id] ?? null) : null);

  async function start(s: Submission) {
    if (!host || !workspace || !target) return false;
    setNote(null);
    const wakes = act === "wakes" && power !== "on";
    setWaking(wakes);
    if (wakes) setPending(s.shell ? `!${s.command}` : s.prompt);
    try {
      // Un space que la máquina de destino no tiene se comparte antes desde la que lo guarda, con el mismo id.
      let spaceId = spaceOn(host.id);
      const owner = !spaceId && space ? Object.entries(space.on)[0] : undefined;
      const keeper = owner ? hostsOfCurrent.find((h) => h.id === owner[0]) : undefined;
      const keeperWs = keeper ? current?.members.get(keeper.id) : undefined;
      if (owner && keeper && keeperWs) spaceId = await shareSpace(keeper, keeperWs, owner[1]).then(() => owner[1], () => null);
      let baseRef = branch;
      let unwrapSnapshot = false;
      const from = target.host !== host.id ? hostsOfCurrent.find((h) => h.id === target.host) : undefined;
      const fromWorkspace = from ? (current?.members.get(from.id) ?? null) : null;
      if (from && fromWorkspace && from.power() === "on" && !s.shell) {
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
        ? (await runShell(host, workspace, { folder: target.id, session: null, command: s.command, provider: s.provider, model: s.model, effort: s.effort, permissionMode: s.permissionMode, space: spaceId, agent: chosenAgent, baseRef })).session
        : await createTask(host, workspace, { folder: target.id, prompt: s.prompt, provider: s.provider, model: s.model, effort: s.effort, permissionMode: s.permissionMode, attachments: s.attachments, agent: chosenAgent, space: spaceId, baseRef, unwrapSnapshot });
      rememberMachine(host.id);
      openTask(host.id, workspace, target.id, id, true);
      return true;
    } catch (error) {
      if (error instanceof HostError && error.code === "key_changed") setNote(t("new.carry_key_changed", { name: host.label }));
      else if (error instanceof HostError && error.code === "machine_asleep") setNote(w("web.machines.off_action", { name: host.label }));
      else if (error instanceof HostError && error.code === "machine_outdated") setNote(w("web.machines.outdated_action", { name: host.label }));
      else if (error instanceof HostError && (error.code === "start_failed" || error.code === "start_timeout")) setNote(t("machines.start_failed", { name: host.label }));
      else setNote(t("task.error", { detail: error instanceof Error ? error.message : String(error) }));
      return false;
    } finally {
      setWaking(false);
      setPending(null);
    }
  }

  const stateOf = (h: typeof host) =>
    !h ? "" : h.power() === "on" ? w("web.computers.state.online") : h.power() === "starting" ? w("web.computers.state.starting") : h.power() === "outdated" ? w("web.computers.state.outdated") : w("web.computers.state.offline");

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
            : null;

  const header = (
    <View style={styles.selectors}>
      {hostsOfCurrent.length > 1 && host ? (
        <SelectorChip testID="pick-machine" icon="server" label={w("shell.machines.label")} value={host.label} onPress={() => setPicker("machine")} />
      ) : null}
      <SelectorChip
        testID="pick-folder"
        left={target ? <FolderIcon folder={target} size={13} /> : <Icon name="folder" size={13} color={theme.textMuted} />}
        value={target?.name ?? t("new.folder")}
        muted={!target}
        onPress={host && workspace ? () => setPicker("folder") : undefined}
      />
      {branches?.branches.length ? (
        <SelectorChip testID="pick-branch" icon="git-branch" value={branchLabel ?? w("worktrees.base.choose")} onPress={() => setPicker("branch")} />
      ) : null}
      {agents.length ? (
        <SelectorChip
          testID="pick-agent"
          left={chosenAgent ? <AgentAvatar name={chosenAgent} size={15} host={host?.id} folder={target?.id} /> : <Icon name="user-round" size={13} color={theme.textMuted} />}
          value={chosenAgent ?? t("new.agent")}
          muted={!chosenAgent}
          onPress={() => setPicker("agent")}
        />
      ) : null}
    </View>
  );

  return (
    <KeyboardScreen style={{ backgroundColor: theme.bg }}>
      <View style={styles.top}>
        <Text style={{ color: theme.textMuted }}>
          {current?.name}
          {space ? ` · ${spaceName(space, t("space.general"))}` : ""}
        </Text>
      </View>
      <View style={{ flex: 1 }} />
      {pending && waking ? (
        <View style={[styles.pending, { backgroundColor: theme.userBubble, borderColor: theme.border }]}>
          <Text style={{ color: theme.text, fontSize: TEXT.lead, lineHeight: 21 }}>{pending}</Text>
        </View>
      ) : null}
      {notice || note ? (
        <View style={styles.notes}>
          {notice ? <Text style={{ color: theme.textMuted }}>{notice}</Text> : null}
          {note ? <Text style={{ color: theme.textMuted }}>{note}</Text> : null}
        </View>
      ) : null}
      <Composer
        testID="new-message"
        host={host ?? undefined}
        workspace={workspace}
        folder={target?.id ?? null}
        session={null}
        providers={host ? (snapshot?.providers[host.id] ?? []) : []}
        provider={defaults.provider}
        model={defaults.model}
        permissionMode={current?.defaultPermissionMode ?? null}
        disabled={!host || !target || act === "asleep" || act === "outdated" || waking}
        placeholder={t("new.placeholder")}
        header={header}
        onSubmit={start}
      />

      <Sheet visible={picker === "machine"} title={w("shell.machines.label")} search={t("search.machines")} onClose={() => setPicker(null)}>
        {(query) => {
          const shown = hostsOfCurrent.filter((h) => matches(query, h.label));
          return shown.length ? shown.map((h) => (
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
          )) : <NoMatch />;
        }}
      </Sheet>
      <Sheet visible={picker === "folder"} title={t("new.folder")} search={t("search.folders")} onClose={() => setPicker(null)}>
        {(query) => {
          const shown = folders.filter((f) => matches(query, f.name, f.working_directory));
          return (
            <>
              {shown.length ? shown.map((f) => (
                <SheetOption key={f.key} testID={`folder-${f.id}`} left={<FolderIcon folder={f} size={13} />} label={f.name}
                  detail={f.host === host?.id ? (f.working_directory ?? null) : t("new.carry_from", { name: hostsOfCurrent.find((h) => h.id === f.host)?.label ?? f.host })} selected={f.id === target?.id} onPress={() => {
                  setFolder(f.id);
                  setPicker(null);
                }} />
              )) : <NoMatch />}
              <SheetOption testID="add-folder" icon="plus" label={t("folder.new")} disabled={act === "asleep" || act === "outdated"} onPress={() => setPicker("new-folder")} />
              <SheetOption testID="add-clone" icon="git-branch" label={t("clone.title")} disabled={act === "asleep" || act === "outdated"} onPress={() => setPicker("clone")} />
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
      <Sheet visible={picker === "branch"} title={w("worktrees.base.from")} search={t("search.branches")} onClose={() => setPicker(null)}>
        {(query) => {
          const shown = (branches?.branches ?? []).filter((b) => matches(query, b.name, b.detail));
          return shown.length ? shown.map((b) => (
            <SheetOption key={b.reference} icon="git-branch" label={b.name} detail={b.detail} selected={b.reference === selectedBranch} onPress={() => {
              setBranch(b.reference === branches?.selected ? null : b.reference);
              setPicker(null);
            }} />
          )) : <NoMatch />;
        }}
      </Sheet>
      <Sheet visible={picker === "agent"} title={t("new.agent")} search={t("search.agents")} onClose={() => setPicker(null)}>
        {(query) => {
          const shown = agents.filter((a) => matches(query, a.name, a.description));
          return (
            <>
              {query.trim() ? null : (
                <SheetOption icon="user-round" label={t("new.no_agent")} selected={!chosenAgent} onPress={() => {
                  setAgent(null);
                  setPicker(null);
                }} />
              )}
              {shown.length ? shown.map((a) => (
                <SheetOption key={a.name} testID={`agent-${a.name}`} left={<AgentAvatar name={a.name} size={22} />} label={a.name} detail={a.description} selected={chosenAgent === a.name} onPress={() => {
                  setAgent(a.name);
                  setPicker(null);
                }} />
              )) : <NoMatch />}
            </>
          );
        }}
      </Sheet>
    </KeyboardScreen>
  );
}

const styles = StyleSheet.create({
  top: { paddingHorizontal: 16, paddingTop: 12, gap: 4 },
  notes: { paddingHorizontal: 16, paddingBottom: 6, gap: 4 },
  pending: { alignSelf: "flex-end", maxWidth: "92%", marginHorizontal: 12, marginBottom: 8, borderRadius: 14, padding: 10, borderWidth: StyleSheet.hairlineWidth },
  selectors: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingHorizontal: 2 },
});
