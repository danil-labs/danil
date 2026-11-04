import { TEXT } from "@terminus/design";
import type { TaskTree, TreeContent, TreeFiles } from "@terminus/protocol";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type Host } from "../lib/hosts";
import { taskTrees, treeFile, treeFiles } from "../lib/engine";
import { baseName, listDir, parentOf } from "../lib/files";
import { t } from "../lib/i18n";
import { useMachines } from "../lib/machines";
import { Icon, type IconName } from "../ui/Icon";
import { Group, GroupFooter, NavBar, Tap, pageColor } from "../ui/list";
import { useTheme } from "../ui/theme";

type Read =
  | { state: "loading" }
  | { state: "off" }
  | { state: "error" }
  | { state: "ready"; trees: TaskTree[]; files: TreeFiles | null };

/**
 * Los archivos de la tarea, como en el panel de la ventana: sus carpetas y archivos,
 * y cada archivo abre aquí mismo. Solo lee: la máquina apagada no se enciende por mirar.
 */
export default function TaskFilesScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ host: string; workspace: string; folder: string; id: string }>();
  const { hostOf } = useMachines();
  const host = hostOf(params.host);
  const on = host?.power() === "on";
  const [tree, setTree] = useState<string | null>(null);
  const [dir, setDir] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [read, setRead] = useState<Read>({ state: "loading" });

  const load = useCallback(async (host: Host, key: string | null) => {
    try {
      const trees = await taskTrees(host, params.workspace, params.folder, params.id);
      const chosen = trees.find((item) => item.key === key) ?? trees[0] ?? null;
      const files = chosen ? await treeFiles(host, params.workspace, params.folder, params.id, chosen.key) : null;
      setTree(chosen?.key ?? null);
      setRead({ state: "ready", trees, files });
    } catch {
      setRead({ state: "error" });
    }
  }, [params.workspace, params.folder, params.id]);

  useEffect(() => {
    if (!host || !on) { setRead({ state: "off" }); return; }
    setRead({ state: "loading" });
    void load(host, null);
  }, [host, on, load]);

  const listing = useMemo(
    () => (read.state === "ready" && read.files ? listDir(read.files.paths, read.files.folders, dir) : { dirs: [], files: [] }),
    [read, dir],
  );
  const where = dir ? dir : t("task.files.root");

  if (open && host && tree) {
    return <FileView host={host} params={params} tree={tree} path={open} onBack={() => setOpen(null)} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: pageColor(theme) }}>
      <NavBar back={t("task.tools.chat")} title={t("task.files.title")} subtitle={where} />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        {read.state === "loading" ? <View style={styles.center}><ActivityIndicator color={theme.textMuted} /></View> : null}
        {read.state === "off" ? <Text style={[styles.note, { color: theme.textMuted }]}>{t("task.files.off")}</Text> : null}
        {read.state === "error" ? (
          <View style={styles.center}>
            <Text style={[styles.note, { color: theme.textMuted }]}>{t("task.files.error")}</Text>
            <Tap accessibilityRole="button" onPress={() => host && void load(host, tree)} style={styles.retry}>
              <Text style={{ color: theme.text, fontWeight: "600" }}>{t("task.files.retry")}</Text>
            </Tap>
          </View>
        ) : null}
        {read.state === "ready" && read.trees.length > 1 ? (
          <Group>
            {read.trees.map((item) => (
              <Entry key={item.key} icon="folder" label={item.name} selected={item.key === tree} onPress={() => { setDir(""); if (host) void load(host, item.key); }} />
            ))}
          </Group>
        ) : null}
        {read.state === "ready" && read.files ? (
          <>
            <Group>
              {dir ? <Entry icon="chevron-left" label=".." onPress={() => setDir(parentOf(dir))} /> : null}
              {listing.dirs.map((name) => (
                <Entry key={`d:${name}`} icon="folder" label={name} chevron onPress={() => setDir(dir ? `${dir}/${name}` : name)} />
              ))}
              {listing.files.map((name) => (
                <Entry key={`f:${name}`} icon="file-text" label={name} onPress={() => setOpen(dir ? `${dir}/${name}` : name)} />
              ))}
            </Group>
            <GroupFooter>
              {listing.dirs.length + listing.files.length === 0 ? t("task.files.empty") : read.files.truncated ? t("task.files.truncated") : ""}
            </GroupFooter>
          </>
        ) : null}
        {read.state === "ready" && !read.files ? <GroupFooter>{t("task.files.none")}</GroupFooter> : null}
      </ScrollView>
    </View>
  );
}

function Entry({ icon, label, chevron, selected, onPress }: { icon: IconName; label: string; chevron?: boolean; selected?: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Tap accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: !!selected }} onPress={onPress} style={styles.entry}>
      <Icon name={icon} size={18} color={icon === "folder" ? theme.text : theme.textMuted} />
      <Text numberOfLines={1} style={{ color: theme.text, fontSize: TEXT.body, flex: 1, fontWeight: selected ? "700" : "400" }}>{label}</Text>
      {chevron ? <Icon name="chevron-right" size={16} color={theme.textMuted} /> : null}
    </Tap>
  );
}

function FileView({ host, params, tree, path, onBack }: { host: Host; params: { workspace: string; folder: string; id: string }; tree: string; path: string; onBack: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [content, setContent] = useState<TreeContent | null | "error">(null);
  useEffect(() => {
    let live = true;
    setContent(null);
    void treeFile(host, params.workspace, params.folder, params.id, tree, path).then(
      (value) => { if (live) setContent(value); },
      () => { if (live) setContent("error"); },
    );
    return () => { live = false; };
  }, [host, params.workspace, params.folder, params.id, tree, path]);

  return (
    <View style={{ flex: 1, backgroundColor: pageColor(theme) }}>
      <NavBar title={baseName(path)} subtitle={parentOf(path) || undefined} right={
        <Tap accessibilityRole="button" accessibilityLabel={t("task.files.title")} onPress={onBack} style={styles.back}>
          <Icon name="list-tree" size={18} color={theme.text} />
        </Tap>
      } />
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 32 }}>
        {content === null ? <View style={styles.center}><ActivityIndicator color={theme.textMuted} /></View> : null}
        {content === "error" ? <Text style={[styles.note, { color: theme.textMuted }]}>{t("task.files.error")}</Text> : null}
        {content && content !== "error" ? (
          content.kind === "image" && content.data_url ? (
            <Image accessibilityLabel={baseName(path)} source={{ uri: content.data_url }} resizeMode="contain" style={styles.image} />
          ) : content.kind === "text" ? (
            <>
              <Text selectable style={[styles.mono, { color: theme.text, backgroundColor: theme.muted }]}>{content.text}</Text>
              {content.truncated ? <GroupFooter>{t("task.files.file_truncated")}</GroupFooter> : null}
            </>
          ) : (
            <Text style={[styles.note, { color: theme.textMuted }]}>{t("task.files.no_preview")}</Text>
          )
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", gap: 12, paddingVertical: 32 },
  note: { fontSize: TEXT.body, paddingHorizontal: 20, paddingVertical: 12, textAlign: "center" },
  retry: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  entry: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, minHeight: 46 },
  back: { padding: 8 },
  image: { width: "100%", height: 320 },
  mono: { fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }), fontSize: 12.5, lineHeight: 18, padding: 10, borderRadius: 10 },
});
