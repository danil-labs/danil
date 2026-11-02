import { type DirectoryEntry, type DirectoryGroup, groupDirectory } from "@terminus/computers";
import { TEXT } from "@terminus/design";
import type { AttentionState } from "@terminus/protocol";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ALPHA_DEMO } from "../lib/alpha-mode";
import { useHomeLabel } from "../lib/homeLabel";
import { t, w } from "../lib/i18n";
import { useMachines } from "../lib/machines";
import { can } from "../lib/pending";
import { useWorkspaceDirectory } from "../lib/useWorkspaceDirectory";
import { directoryRole, directoryRows, pinnedFirst } from "../lib/workspaceDirectory";
import { type WorkspaceEntry, useWorkspaces } from "../lib/workspaces";
import { Icon } from "../ui/Icon";
import { Group, GroupFooter, GroupHeader, LargeTitle, ListRow, NavBar, pageColor, RoundButton, Tap } from "../ui/list";
import { useTheme } from "../ui/theme";
import { WorkspaceAvatar } from "../ui/WorkspaceAvatar";

const NEEDS_YOU = new Set<AttentionState>(["approving", "asked", "failed"]);

/** Crear y administrar workspaces desde el teléfono: no se ve mientras sus comandos no estén en la lista cerrada. */
const MANAGE = can("add_workspace") && can("rename_workspace");

/**
 * Cambiar de workspace, desde la ficha de Inicio: el directorio de la cuenta
 * (`GET /v1/me/workspaces`) con el rol de la persona y las máquinas donde corre,
 * más lo que el teléfono ya tiene. Un workspace sin máquina se ve, pero no se
 * abre: el teléfono no crea workspaces locales. Fijar es de la cuenta y no da
 * acceso; abrir no enciende nada.
 */
export default function Workspaces() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const back = useHomeLabel();
  const { attention, hosts } = useMachines();
  const { list, current, select } = useWorkspaces();
  const { directory, signedIn, loading, failure, reload, pin } = useWorkspaceDirectory();
  const [notice, setNotice] = useState<string | null>(null);

  const entries = directory?.workspaces ?? null;
  const machines = useMemo(() => hosts.map((host) => ({ id: host.id, linked: host.linked })), [hosts]);
  const rows = useMemo(() => new Map(directoryRows(entries ?? [], list, machines).map((row) => [row.entry.key, row])), [entries, list, machines]);
  const groups = useMemo(() => (entries ? groupDirectory(entries) : []), [entries]);
  const known = useMemo(() => new Set((entries ?? []).flatMap((entry) => (entry.workspace_id ? [entry.workspace_id] : []))), [entries]);
  const localOnly = entries ? list.filter((workspace) => !known.has(workspace.id)) : list;

  const hostOf = (id: string) => hosts.find((host) => host.id === id);
  const pendingOf = (workspace: WorkspaceEntry) =>
    Object.entries(attention)
      .flatMap(([host, ws]) => ws.filter((x) => x.workspace === workspace.members.get(host)).flatMap((x) => x.tasks))
      .filter((task) => NEEDS_YOU.has(task.state)).length;
  const machineText = (ids: string[]) => {
    const found = ids.map(hostOf).filter((host) => !!host);
    const asleep = found.length > 0 && found.every((host) => host.power() !== "on" && host.power() !== "starting");
    return [...ids.map((id) => hostOf(id)?.label ?? id), asleep ? w("web.computers.state.offline") : null].filter(Boolean).join(" · ");
  };
  const groupTitle = (group: DirectoryGroup) => {
    if (group.kind === "organization") return group.name;
    if (group.kind === "personal") return t("workspaces.group.personal");
    if (group.kind === "support") return t("workspaces.group.support");
    return t("workspaces.group.unlinked");
  };
  const roleLabel = (entry: DirectoryEntry) => {
    switch (directoryRole(entry)) {
      case "owner":
        return t("workspaces.role.owner");
      case "admin":
        return t("workspaces.role.admin");
      case "member":
        return t("workspaces.role.member");
      case "support":
        return t("workspaces.role.support");
      default:
        return null;
    }
  };
  const open = (id: string) => {
    select(id);
    router.back();
  };
  const openEntry = (workspace: WorkspaceEntry | null) => {
    setNotice(null);
    if (workspace) return open(workspace.id);
    // Tiene máquina, pero el teléfono no la ha oído todavía: no se elige a ciegas.
    setNotice(t("workspaces.not_ready"));
  };
  const togglePin = async (entry: DirectoryEntry) => {
    setNotice(null);
    const code = await pin(entry);
    if (code) setNotice(`${t("workspaces.pin_failed")} (${code})`);
  };

  const localRow = (workspace: WorkspaceEntry) => {
    const pending = pendingOf(workspace);
    const chosen = workspace.id === current?.id;
    return (
      <ListRow
        key={workspace.id}
        testID={`workspace-${workspace.id}`}
        left={<WorkspaceAvatar id={workspace.id} name={workspace.name} size={36} />}
        title={workspace.name}
        subtitle={machineText(workspace.hosts) || undefined}
        right={
          <View style={styles.right}>
            {pending ? <Count count={pending} /> : null}
            {chosen ? <Icon name="check" size={18} color={theme.merged} /> : <View style={{ width: 18 }} />}
          </View>
        }
        accessibilityLabel={`${workspace.name}${pending ? `, ${pending}` : ""}`}
        onPress={() => open(workspace.id)}
      />
    );
  };

  const directoryRow = (entry: DirectoryEntry) => {
    const row = rows.get(entry.key);
    const id = entry.workspace_id;
    const openable = row?.openable ?? false;
    const workspace = id ? list.find((item) => item.id === id) ?? null : null;
    const name = entry.name?.trim() || t("workspaces.unnamed");
    const pinned = entry.pin !== null;
    const pending = workspace ? pendingOf(workspace) : 0;
    const chosen = id !== null && id === current?.id;
    const subtitle = [roleLabel(entry), openable ? machineText(row?.machines ?? []) : t("workspaces.needs_machine")].filter(Boolean).join(" · ");
    return (
      <ListRow
        key={entry.key}
        testID={`workspace-${id ?? entry.key}`}
        left={<WorkspaceAvatar id={id ?? entry.key} name={name} size={36} />}
        title={name}
        subtitle={subtitle}
        muted={!openable}
        disabled={!openable}
        right={
          <View style={styles.right}>
            {pending ? <Count count={pending} /> : null}
            {!entry.support && openable ? (
              <Tap
                testID={`pin-${entry.key}`}
                accessibilityRole="button"
                accessibilityLabel={pinned ? t("workspaces.unpin", { name }) : t("workspaces.pin", { name })}
                accessibilityState={{ selected: pinned }}
                onPress={() => void togglePin(entry)}
                hitSlop={8}
                style={styles.pin}
              >
                <Icon name={pinned ? "pin-off" : "pin"} size={16} color={pinned ? theme.primary : theme.textMuted} />
              </Tap>
            ) : null}
            {chosen ? <Icon name="check" size={18} color={theme.merged} /> : null}
          </View>
        }
        accessibilityLabel={`${name}, ${subtitle}`}
        onPress={openable && id ? () => openEntry(workspace) : undefined}
      />
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: pageColor(theme) }}>
      <NavBar back={back} right={MANAGE ? <RoundButton icon="plus" label={w("settings.workspaces.manage")} onPress={() => router.push("/settings")} /> : null} />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        <LargeTitle>{t("workspaces.title")}</LargeTitle>
        {entries ? (
          <>
            {groups.map((group, index) => (
              <View key={`${group.kind}-${index}`}>
                <GroupHeader>{groupTitle(group)}</GroupHeader>
                <Group inset={68}>{pinnedFirst(group.entries).map(directoryRow)}</Group>
              </View>
            ))}
            {localOnly.length ? (
              <>
                <GroupHeader>{t("workspaces.group.local")}</GroupHeader>
                <Group inset={68}>{localOnly.map(localRow)}</Group>
              </>
            ) : null}
            {!groups.length && !localOnly.length ? <GroupFooter>{t("workspaces.directory_empty")}</GroupFooter> : null}
          </>
        ) : (
          <Group inset={68}>{list.map(localRow)}</Group>
        )}
        {entries ? <GroupFooter>{t("workspaces.directory_note")}</GroupFooter> : null}
        {entries && directory?.truncated ? <GroupFooter>{t("workspaces.directory_truncated")}</GroupFooter> : null}
        {list.length ? <GroupFooter>{t("workspaces.count_note")}</GroupFooter> : null}
        {!signedIn && !ALPHA_DEMO ? <GroupFooter>{t("workspaces.directory_signed_out")}</GroupFooter> : null}
        {loading && !entries ? <GroupFooter>{t("workspaces.directory_loading")}</GroupFooter> : null}
        {failure ? (
          <View style={[styles.note, { backgroundColor: theme.muted }]}>
            <Text style={{ color: theme.textMuted, fontSize: TEXT.ui }}>{t("workspaces.directory_failed", { code: failure })}</Text>
            <Tap accessibilityRole="button" onPress={() => void reload()}>
              <Text style={{ color: theme.primary, fontWeight: "600" }}>{t("workspaces.retry")}</Text>
            </Tap>
          </View>
        ) : null}
        {notice ? (
          <View style={[styles.note, { backgroundColor: theme.muted }]}>
            <Text style={{ color: theme.textMuted, fontSize: TEXT.ui }}>{notice}</Text>
          </View>
        ) : null}
        {MANAGE ? (
          <>
            <View style={{ height: 20 }} />
            <Group>
              <ListRow testID="manage-workspaces" title={w("settings.workspaces.manage")} chevron onPress={() => router.push("/settings")} />
            </Group>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Count({ count }: { count: number }) {
  const theme = useTheme();
  return (
    <View style={[styles.count, { backgroundColor: theme.muted }]}>
      <Text style={{ color: theme.text, fontSize: TEXT.label, fontWeight: "600" }}>{count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  right: { flexDirection: "row", alignItems: "center", gap: 10 },
  count: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" },
  pin: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  note: { marginHorizontal: 16, marginTop: 12, padding: 10, borderRadius: 10, gap: 4 },
});
