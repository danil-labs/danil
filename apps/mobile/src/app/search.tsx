import { folderByKey } from "../lib/folderIcon";
import { TEXT } from "@terminus/design";
import { contactDisplayName, contactSubIdentifier } from "../../../../packages/attention/src/inbox.ts";
import { taskTitle } from "@terminus/tasks";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Keyboard, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cardOf, marksOf } from "../lib/cards";
import { type Task, taskKey } from "../lib/engine";
import { lang, t, w } from "../lib/i18n";
import { useInbox } from "../lib/inbox";
import { useMachines } from "../lib/machines";
import { archivedOf, ready } from "../lib/pending";
import { shortWhen } from "../lib/when";
import { useWorkspaces } from "../lib/workspaces";
import { Avatar, openTask } from "../ui/components";
import { Icon } from "../ui/Icon";
import { Chip, goBack, Group, GroupHeader, ListRow, pageColor, Tap } from "../ui/list";
import { FolderIcon } from "../ui/FolderIcon";
import { TaskCard } from "../ui/TaskCard";
import { useTheme } from "../ui/theme";

type Kind = "all" | "tasks" | "archived" | "folders" | "inbox" | "actions";

/** Sin acentos ni mayúsculas, como el ⌘K del escritorio. */
const plain = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** El texto con lo buscado marcado. */
function Marked({ text, query, style }: { text: string; query: string; style: object }) {
  const theme = useTheme();
  const q = plain(query.trim());
  const at = q ? plain(text).indexOf(q) : -1;
  if (at < 0) return <Text numberOfLines={1} style={style}>{text}</Text>;
  return (
    <Text numberOfLines={1} style={style}>
      {text.slice(0, at)}
      <Text style={{ backgroundColor: theme.dark ? "#5b5320" : "#fdf3a7" }}>{text.slice(at, at + q.length)}</Text>
      {text.slice(at + q.length)}
    </Text>
  );
}

/**
 * Buscar: el ⌘K del escritorio en el teléfono, con sus chips. Sin texto,
 * Recientes; con texto, los resultados agrupados (Tareas, Archivadas,
 * Carpetas, Inbox y Acciones) con lo buscado marcado. Aquí sí salen las
 * subtareas. Archivadas solo aparece si el teléfono puede pedirlas
 * (`archived_tasks`). Al desplazarse se esconde el teclado.
 */
export default function Search() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { attention, hostOf } = useMachines();
  const { current, snapshot } = useWorkspaces();
  const inbox = useInbox();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<Kind>("all");
  const [archived, setArchived] = useState<Task[] | null>(null);
  const withArchived = ready("archived") && !!current && [...current.members.keys()].some((id) => ready("archived", hostOf(id)));

  // Las archivadas se piden una vez al abrir, a cada máquina encendida del workspace.
  useEffect(() => {
    if (!withArchived || !current) return;
    let live = true;
    void Promise.all([...current.members].map(async ([hostId, workspace]) => {
      const host = hostOf(hostId);
      if (!host || host.power() !== "on") return [];
      const answer = await archivedOf(host, workspace).catch(() => null);
      return (answer?.tasks ?? []).map((row): Task => ({ ...row, archived: true, host: hostId, workspace, folder: row.folder, folderKey: `${hostId}/${row.folder}` }));
    })).then((parts) => { if (live) setArchived(parts.flat()); });
    return () => { live = false; };
  }, [withArchived, current, hostOf]);

  const marks = useMemo(() => marksOf(attention, current?.members, snapshot?.live ?? new Set()), [attention, current?.members, snapshot?.live]);
  const all = [...(snapshot?.tasks ?? []), ...(snapshot?.delegated ?? [])];
  const q = plain(query.trim());
  const hit = (...fields: (string | null | undefined)[]) => !q || fields.some((f) => f && plain(f).includes(q));
  const tasks = q ? all.filter((task) => hit(taskTitle(lang, task), task.last_message)) : [];
  const old = q ? (archived ?? []).filter((task) => hit(taskTitle(lang, task))) : [];
  // Una carpeta de la cuenta tiene el mismo id en cada máquina: sale una vez, con sus máquinas.
  const folders = q ? [...new Map((snapshot?.folders ?? []).filter((f) => hit(f.name)).map((f) => [f.id, f])).values()] : [];
  const machinesOf = (id: string) => (snapshot?.folders ?? []).filter((f) => f.id === id).map((f) => hostOf(f.host)?.label ?? f.host).join(" · ");
  const chats = q ? inbox.rows.filter((row) => hit(row.contact_name, row.last_message, row.channel_name)) : [];
  const actions = q ? folders.slice(0, 3) : [];
  const recent = [...all].sort((a, b) => (b.last_turn_at ?? b.updated_at) - (a.last_turn_at ?? a.updated_at)).slice(0, 6);
  const show = (k: Kind) => kind === "all" || kind === k;
  const chips: { kind: Kind; label: string; count?: number; on: boolean }[] = [
    { kind: "all", label: w("search.chip.all"), on: true },
    { kind: "tasks", label: w("search.chip.tasks"), count: q ? tasks.length : undefined, on: true },
    { kind: "archived", label: w("search.chip.archived"), count: q ? old.length : undefined, on: withArchived },
    { kind: "folders", label: w("search.chip.folders"), count: q ? folders.length : undefined, on: true },
    { kind: "inbox", label: w("search.chip.inbox"), count: q ? chats.length : undefined, on: inbox.rows.length > 0 },
    { kind: "actions", label: w("search.chip.actions"), count: q ? actions.length : undefined, on: true },
  ];
  const nothing = q && !tasks.length && !old.length && !folders.length && !chats.length;

  const card = (task: Task, archivedTag = false) => (
    <View key={`${archivedTag ? "a" : "t"}-${taskKey(task)}`}>
      <TaskCard
        task={task}
        card={cardOf(task, marks)}
        folderOf={(key) => folderByKey(snapshot?.folders ?? [], key)}
        when={shortWhen(task.last_turn_at ?? task.updated_at, lang)}
        onPress={() => openTask(task.host, task.workspace, task.folder, task.id)}
        online={hostOf(task.host)?.power() === "on"}
        tag={archivedTag ? t("search.archived_tag") : undefined}
      />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: pageColor(theme) }}>
      <View style={[styles.bar, { paddingTop: insets.top + 8 }]}>
        <View style={[styles.field, { backgroundColor: theme.dark ? theme.surface : theme.border }]}>
          <Icon name="search" size={16} color={theme.textMuted} />
          <TextInput
            testID="search-input"
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder={w("search.placeholder")}
            placeholderTextColor={theme.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel={w("search.title")}
            onKeyPress={(event) => { if (Platform.OS === "web" && event.nativeEvent.key === "Escape") goBack(); }}
            style={[styles.input, { color: theme.text }]}
          />
          {query ? (
            <Tap accessibilityRole="button" accessibilityLabel={t("search.clear")} onPress={() => setQuery("")} hitSlop={10} style={styles.clear}>
              <Icon name="x" size={14} color={theme.textMuted} />
            </Tap>
          ) : null}
        </View>
        <Tap testID="search-cancel" accessibilityRole="button" onPress={goBack} style={styles.cancel} pressedColor="transparent">
          <Text style={{ color: theme.text, fontSize: 16 }}>{t("task.header.cancel")}</Text>
        </Tap>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
        {chips.filter((chip) => chip.on).map((chip) => (
          <Chip key={chip.kind} testID={`search-chip-${chip.kind}`} label={chip.label} count={chip.count} active={kind === chip.kind} onPress={() => setKind(chip.kind)} />
        ))}
      </ScrollView>
      <ScrollView onScrollBeginDrag={Keyboard.dismiss} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        {!q ? (
          <>
            <GroupHeader>{w("search.recent")}</GroupHeader>
            <Group inset={46}>{recent.map((task) => card(task))}</Group>
          </>
        ) : null}
        {q && show("tasks") && tasks.length ? <><GroupHeader>{w("search.group.tasks")}</GroupHeader><Group inset={46}>{tasks.map((task) => card(task))}</Group></> : null}
        {q && withArchived && show("archived") && old.length ? <><GroupHeader>{w("search.group.archived")}</GroupHeader><Group inset={46}>{old.map((task) => card(task, true))}</Group></> : null}
        {q && withArchived && show("archived") && archived === null ? <Text style={[styles.empty, { color: theme.textMuted }]}>{w("search.loading_archived")}</Text> : null}
        {q && show("folders") && folders.length ? (
          <>
            <GroupHeader>{w("search.group.folders")}</GroupHeader>
            <Group inset={52}>
              {folders.map((f) => (
                <ListRow key={f.key} left={<FolderIcon folder={f} size={14} />} title={f.name} subtitle={machinesOf(f.id)} chevron onPress={() => router.push({ pathname: "/new", params: { folder: f.id, host: f.host } })} />
              ))}
            </Group>
          </>
        ) : null}
        {q && show("inbox") && chats.length ? (
          <>
            <GroupHeader>{w("search.group.inbox")}</GroupHeader>
            <Group inset={68}>
              {chats.map((row) => (
                <ListRow
                  key={row.id}
                  left={<Avatar name={contactDisplayName(row, "?")} size={40} round />}
                  title={contactDisplayName(row, t("customize.unknown"))}
                  subtitle={
                    <View style={{ gap: 2 }}>
                      <Text numberOfLines={1} style={{ color: theme.textMuted, fontSize: TEXT.ui }}>{[row.channel_name, contactSubIdentifier(row)].filter(Boolean).join(" · ")}</Text>
                      <Marked text={row.last_message} query={query} style={{ color: theme.textMuted, fontSize: TEXT.body }} />
                    </View>
                  }
                  value={shortWhen(row.last_message_at, lang)}
                  onPress={() => { void inbox.open(row); router.push("/inbox-thread"); }}
                />
              ))}
            </Group>
          </>
        ) : null}
        {q && show("actions") && actions.length ? (
          <>
            <GroupHeader>{w("search.group.actions")}</GroupHeader>
            <Group inset={56}>
              {actions.map((f) => (
                <ListRow
                  key={f.key}
                  left={<View style={[styles.plus, { backgroundColor: theme.muted }]}><Icon name="plus" size={16} color={theme.text} /></View>}
                  title={w("search.action.new_task", { name: f.name })}
                  onPress={() => router.push({ pathname: "/new", params: { folder: f.id, host: f.host } })}
                />
              ))}
            </Group>
          </>
        ) : null}
        {nothing ? <Text style={[styles.empty, { color: theme.textMuted }]}>{w("search.no_results")}</Text> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingBottom: 10 },
  field: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, height: 44, borderRadius: 12, paddingHorizontal: 12 },
  input: { flex: 1, fontSize: 16, paddingVertical: 8, minWidth: 0, ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null) },
  clear: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  cancel: { minHeight: 44, justifyContent: "center" },
  chipsScroll: { flexGrow: 0 },
  chips: { gap: 8, paddingHorizontal: 16, paddingBottom: 4 },
  plus: { width: 28, height: 28, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  empty: { paddingHorizontal: 32, paddingVertical: 16, fontSize: TEXT.lead },
});
