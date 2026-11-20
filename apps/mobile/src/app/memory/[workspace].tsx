import { RADIUS, TEXT } from "@terminus/design";
import { Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import {
  type MemorySource,
  type MemoryVersion,
  deleteMemoryFile,
  memoryEntryText,
  memoryHistory,
  parseMemoryEntry,
  readMemoryFile,
  writeMemoryFile,
} from "@terminus/computers";
import { useAccount } from "../../lib/account";
import { lang, t } from "../../lib/i18n";
import { useMachines } from "../../lib/machines";
import { type MemoryItem, type MemoryOutcome, type MemoryProblem, entryFileName, loadMemory, memoryScopes, outcomeOf } from "../../lib/memory";
import { COMPUTERS } from "../../lib/computersEndpoint";
import { Icon } from "../../ui/Icon";
import { useTheme } from "../../ui/theme";

const PROBLEM: Record<MemoryProblem, "memory.busy" | "memory.disabled" | "memory.signed_out" | "memory.error"> = {
  busy: "memory.busy",
  disabled: "memory.disabled",
  signed_out: "memory.signed_out",
  error: "memory.error",
};

function when(iso: string | null): string {
  if (!iso || Number.isNaN(Date.parse(iso))) return "";
  return new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

/** Pregunta antes de borrar: en la web `Alert` no tiene botones. */
function confirmDelete(onYes: () => void) {
  if (Platform.OS === "web") {
    if (window.confirm(t("memory.delete_confirm"))) onYes();
    return;
  }
  Alert.alert(t("memory.delete"), t("memory.delete_confirm"), [
    { text: t("memory.cancel"), style: "cancel" },
    { text: t("memory.delete_yes"), style: "destructive", onPress: onYes },
  ]);
}

type Editing = { item: MemoryItem | null; file: string; type: string; body: string; saving: boolean; error: string | null };

/**
 * La memoria de un workspace en la cuenta de Danil: la del workspace y la de
 * cada proyecto, con el historial de cada entrada, editar, borrar y escribir.
 * Habla directo con el Worker (`src/lib/memory.ts`), así que funciona con todas
 * las máquinas apagadas y no enciende ninguna.
 */
export default function MemoryScreen() {
  const theme = useTheme();
  const { workspace } = useLocalSearchParams<{ workspace: string }>();
  const { getToken } = useAccount();
  const { registry } = useMachines();
  const account = registry?.find((w) => w.id === workspace) ?? null;
  const scopes = useMemo(() => memoryScopes(account), [account]);
  const [scopeKey, setScopeKey] = useState("workspace");
  const scope = scopes.find((s) => s.key === scopeKey) ?? scopes[0];
  const source = useMemo<MemorySource>(() => ({ endpoint: COMPUTERS, getToken }), [getToken]);

  const [items, setItems] = useState<MemoryItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<MemoryProblem | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [history, setHistory] = useState<{ path: string; versions: MemoryVersion[] | null; open: string | null; text: string | null } | null>(null);
  const asked = useRef(0);

  const load = useCallback(async () => {
    if (!workspace || !scope) return;
    const turn = ++asked.current;
    setLoading(true);
    const loaded = await loadMemory(source, workspace, scope.dir);
    if (turn !== asked.current) return;
    setLoading(false);
    if ("problem" in loaded) {
      setProblem(loaded.problem);
      return;
    }
    setProblem(null);
    setItems(loaded.items);
  }, [source, workspace, scope]);

  useEffect(() => {
    setItems(null);
    setHistory(null);
    setEditing(null);
    setNotice(null);
    void load();
  }, [load]);

  /** Lo que se avisa tras guardar o borrar; la lista se vuelve a leer salvo si la memoria no contestó. */
  function settle(outcome: MemoryOutcome) {
    if (outcome.kind === "problem") {
      setNotice(t(PROBLEM[outcome.problem]));
      return;
    }
    setNotice(
      outcome.kind === "saved" && outcome.copy
        ? t("memory.saved_copy", { copy: outcome.copy })
        : outcome.kind === "changed"
          ? t("memory.changed")
          : outcome.kind === "gone"
            ? t("memory.gone")
            : null,
    );
    void load();
  }

  async function save() {
    if (!editing || !workspace || !scope || editing.saving) return;
    const file = editing.item ? editing.item.file : entryFileName(editing.file);
    if (!file) {
      setEditing({ ...editing, error: t("memory.file_invalid") });
      return;
    }
    if (!editing.body.trim()) return;
    setEditing({ ...editing, saving: true, error: null });
    const text = memoryEntryText({ type: editing.type.trim() || null, body: editing.body, workspace, project: scope.project });
    const outcome = outcomeOf(await writeMemoryFile(source, workspace, editing.item?.path ?? `${scope.dir}${file}`, text, editing.item?.oid ?? null));
    if (outcome.kind === "problem") {
      // Ocupada o sin red: lo escrito se queda en el formulario para volver a intentar.
      setEditing({ ...editing, saving: false, error: t(PROBLEM[outcome.problem]) });
      return;
    }
    setEditing(null);
    settle(outcome);
  }

  function remove(item: MemoryItem) {
    if (!workspace) return;
    confirmDelete(() => {
      void deleteMemoryFile(source, workspace, item.path, item.oid).then((answer) => settle(outcomeOf(answer)));
    });
  }

  async function openHistory(item: MemoryItem) {
    if (!workspace) return;
    if (history?.path === item.path) {
      setHistory(null);
      return;
    }
    setHistory({ path: item.path, versions: null, open: null, text: null });
    const answer = await memoryHistory(source, workspace, item.path);
    setHistory((h) => (h?.path === item.path ? { ...h, versions: answer.kind === "ok" ? answer.value : [] } : h));
    if (answer.kind !== "ok") setNotice(t("memory.error"));
  }

  async function openVersion(path: string, v: MemoryVersion) {
    if (!workspace || !v.oid) return;
    const answer = await readMemoryFile(source, workspace, path, v.commit);
    setHistory((h) => (h?.path === path ? { ...h, open: v.commit, text: answer.kind === "ok" ? parseMemoryEntry(answer.value.content).body.trim() : t("memory.error") } : h));
  }

  const copies = (items ?? []).filter((i) => i.conflictOf);
  const input = [styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }];

  return (
    <>
      <Stack.Screen options={{ title: account ? t("memory.open", { name: account.name }) : t("memory.title") }} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page} refreshControl={<RefreshControl refreshing={loading && items !== null} onRefresh={load} />}>
        <Text style={{ color: theme.textMuted }}>{t("memory.subtitle")}</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {scopes.map((s) => (
            <Pressable
              key={s.key}
              testID={`memory-scope-${s.key}`}
              onPress={() => setScopeKey(s.key)}
              style={[styles.chip, { borderColor: theme.border, backgroundColor: s.key === scope?.key ? theme.muted : "transparent" }]}
            >
              <Text style={{ color: theme.text, fontWeight: s.key === scope?.key ? "700" : "500" }}>{s.kind === "workspace" ? t("memory.scope_workspace") : s.name}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {problem ? <Text style={{ color: theme.failedMark }}>{t(PROBLEM[problem])}</Text> : null}
        {notice ? (
          <Text testID="memory-notice" style={{ color: theme.text }}>
            {notice}
          </Text>
        ) : null}
        {copies.length ? (
          <Text testID="memory-conflicts" style={{ color: theme.approving }}>
            {t("memory.conflicts_notice")}
          </Text>
        ) : null}

        {editing ? (
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            {editing.item ? (
              <Text style={{ color: theme.textMuted, fontFamily: "monospace" }}>{editing.item.file}</Text>
            ) : (
              <TextInput
                testID="memory-file"
                style={input}
                value={editing.file}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder={t("memory.file_placeholder")}
                placeholderTextColor={theme.textMuted}
                accessibilityLabel={t("memory.file")}
                onChangeText={(file) => setEditing({ ...editing, file, error: null })}
              />
            )}
            <TextInput
              style={input}
              value={editing.type}
              placeholder={t("memory.type")}
              placeholderTextColor={theme.textMuted}
              accessibilityLabel={t("memory.type")}
              onChangeText={(type) => setEditing({ ...editing, type })}
            />
            <TextInput
              testID="memory-text"
              style={[input, styles.body]}
              value={editing.body}
              multiline
              placeholder={t("memory.text")}
              placeholderTextColor={theme.textMuted}
              accessibilityLabel={t("memory.text")}
              onChangeText={(body) => setEditing({ ...editing, body })}
            />
            {editing.error ? <Text style={{ color: theme.failedMark }}>{editing.error}</Text> : null}
            <View style={styles.actions}>
              <Pressable style={[styles.button, { borderColor: theme.border }]} disabled={editing.saving} onPress={() => setEditing(null)}>
                <Text style={{ color: theme.text }}>{t("memory.cancel")}</Text>
              </Pressable>
              <Pressable testID="memory-save" style={[styles.button, { backgroundColor: theme.primary, borderColor: theme.primary }]} disabled={editing.saving} onPress={() => void save()}>
                <Text style={{ color: theme.onPrimary, fontWeight: "600" }}>{editing.saving ? t("memory.saving") : t("memory.save")}</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable
            testID="memory-write"
            style={[styles.button, styles.write, { borderColor: theme.primary }]}
            onPress={() => setEditing({ item: null, file: "", type: "", body: "", saving: false, error: null })}
          >
            <Icon name="square-pen" size={16} color={theme.primary} />
            <Text style={{ color: theme.primary, fontWeight: "600" }}>{t("memory.write")}</Text>
          </Pressable>
        )}

        {items === null ? (
          problem ? null : <Text style={{ color: theme.textMuted }}>{t("memory.loading")}</Text>
        ) : items.length === 0 ? (
          <Text style={{ color: theme.textMuted }}>{t("memory.empty")}</Text>
        ) : (
          items.map((item) => (
            <View key={item.path} testID={`memory-entry-${item.file}`} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={{ color: theme.text, fontSize: TEXT.lead }}>{item.body}</Text>
              <Text style={{ color: theme.textMuted, fontSize: TEXT.label }}>
                {[item.type, item.agent ?? t("memory.person"), when(item.modified), item.file].filter(Boolean).join(" · ")}
              </Text>
              {item.conflictOf ? <Text style={{ color: theme.approving, fontSize: TEXT.label, fontWeight: "600" }}>{t("memory.conflict_badge", { file: item.conflictOf })}</Text> : null}
              <View style={styles.actions}>
                <Pressable testID={`memory-history-${item.file}`} style={styles.link} onPress={() => void openHistory(item)}>
                  <Icon name="clock" size={14} color={theme.textMuted} />
                  <Text style={{ color: theme.text }}>{t("memory.history")}</Text>
                </Pressable>
                <Pressable
                  style={styles.link}
                  onPress={() => setEditing({ item, file: item.file, type: item.type ?? "", body: item.body, saving: false, error: null })}
                >
                  <Icon name="square-pen" size={14} color={theme.textMuted} />
                  <Text style={{ color: theme.text }}>{t("memory.edit")}</Text>
                </Pressable>
                <Pressable style={styles.link} onPress={() => remove(item)}>
                  <Icon name="x" size={14} color={theme.failedMark} />
                  <Text style={{ color: theme.failedMark }}>{t("memory.delete")}</Text>
                </Pressable>
              </View>
              {history?.path === item.path ? (
                <View style={styles.history}>
                  {history.versions === null ? (
                    <Text style={{ color: theme.textMuted }}>{t("memory.loading")}</Text>
                  ) : history.versions.length === 0 ? (
                    <Text style={{ color: theme.textMuted }}>{t("memory.history_empty")}</Text>
                  ) : (
                    history.versions.map((v, i) => (
                      <Pressable key={v.commit} testID={`memory-version-${v.commit}`} onPress={() => void openVersion(item.path, v)} style={[styles.version, { borderColor: theme.border }]}>
                        <Text style={{ color: theme.text, fontSize: TEXT.ui, fontWeight: "600" }}>
                          {[v.author.name || v.author.email, when(v.at), i === 0 ? t("memory.history_current") : null].filter(Boolean).join(" · ")}
                        </Text>
                        <Text style={{ color: theme.textMuted, fontSize: TEXT.label }}>{v.oid ? v.message : t("memory.history_deleted")}</Text>
                        {history.open === v.commit && history.text !== null ? <Text style={{ color: theme.text, fontSize: TEXT.ui }}>{history.text}</Text> : null}
                      </Pressable>
                    ))
                  )}
                </View>
              ) : null}
            </View>
          ))
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  page: { padding: 12, gap: 10 },
  chips: { gap: 8, paddingVertical: 4 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth },
  card: { padding: 12, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, gap: 6 },
  input: { borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.lg, paddingHorizontal: 10, paddingVertical: 8, fontSize: TEXT.lead },
  body: { minHeight: 110, textAlignVertical: "top" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 14, alignItems: "center" },
  button: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1, alignItems: "center" },
  write: { flexDirection: "row", gap: 8, justifyContent: "center" },
  link: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4 },
  history: { gap: 6, paddingTop: 4 },
  version: { borderLeftWidth: 2, paddingLeft: 8, gap: 2 },
});
