import { TEXT } from "@terminus/design";
import type { TaskTree, TreeFiles } from "@terminus/protocol";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type Host } from "../lib/hosts";
import { taskTrees, treeFiles } from "../lib/engine";
import { baseName, listDir, parentOf } from "../lib/files";
import { fileKindOf, type FileKind } from "../lib/fileKinds";
import { t } from "../lib/i18n";
import { useMachines } from "../lib/machines";
import { Icon, type IconName } from "../ui/Icon";
import { Group, GroupFooter, NavBar, Tap, pageColor } from "../ui/list";
import { SlideIn } from "../ui/SlideIn";
import { useTheme } from "../ui/theme";

type Read =
  | { state: "loading" }
  | { state: "off" }
  | { state: "error" }
  | { state: "ready"; trees: TaskTree[]; files: TreeFiles | null };

/** El ícono de cada archivo de la lista, por lo que el visor hará con él. */
const KIND_ICON: Record<FileKind, IconName> = {
  image: "image",
  pdf: "file",
  typst: "file-text",
  markdown: "file-text",
  html: "code",
  table: "table",
  video: "film",
  audio: "music",
  office: "presentation",
  text: "file-text",
};

/**
 * Los archivos de la tarea, como en el panel de la ventana: sus carpetas y archivos.
 * Una carpeta y un archivo entran como pantalla nueva desde la derecha (`dir`,
 * y el visor `/file`), y «‹» vuelve a esta. Solo lee: la máquina apagada no se
 * enciende por mirar.
 */
export default function TaskFilesScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ host: string; workspace: string; folder: string; id: string; tree?: string; dir?: string }>();
  const { hostOf } = useMachines();
  const host = hostOf(params.host);
  const on = host?.power() === "on";
  const [tree, setTree] = useState<string | null>(params.tree || null);
  const dir = params.dir ?? "";
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
    void load(host, params.tree || null);
  }, [host, on, load, params.tree]);

  const listing = useMemo(
    () => (read.state === "ready" && read.files ? listDir(read.files.paths, read.files.folders, dir) : { dirs: [], files: [] }),
    [read, dir],
  );
  // Dentro de una carpeta el título ya es su nombre: el subtítulo es la ruta, si tiene más de un nivel.
  const where = dir ? (dir.includes("/") ? dir : undefined) : t("task.files.root");
  const base = { host: params.host, workspace: params.workspace, folder: params.folder, id: params.id };
  const openDir = (path: string) => tree && router.push({ pathname: "/task-files", params: { ...base, tree, dir: path } });
  const openFile = (path: string) => tree && router.push({ pathname: "/file", params: { ...base, tree, path, from: "files" } });

  return (
    <SlideIn>
      <View style={{ flex: 1, backgroundColor: pageColor(theme) }}>
        <NavBar back={dir ? (parentOf(dir) ? baseName(parentOf(dir)) : t("task.files.title")) : t("task.tools.chat")} title={dir ? baseName(dir) : t("task.files.title")} subtitle={where} />
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
          {read.state === "ready" && read.trees.length > 1 && !dir ? (
            <Group>
              {read.trees.map((item) => (
                <Entry key={item.key} icon="folder" label={item.name} selected={item.key === tree} onPress={() => { if (host) void load(host, item.key); }} />
              ))}
            </Group>
          ) : null}
          {read.state === "ready" && read.files ? (
            <>
              <Group>
                {listing.dirs.map((name) => (
                  <Entry key={`d:${name}`} icon="folder" label={name} chevron onPress={() => openDir(dir ? `${dir}/${name}` : name)} />
                ))}
                {listing.files.map((name) => (
                  <Entry key={`f:${name}`} icon={KIND_ICON[fileKindOf(name)]} label={name} chevron onPress={() => openFile(dir ? `${dir}/${name}` : name)} />
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
    </SlideIn>
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

const styles = StyleSheet.create({
  center: { alignItems: "center", gap: 12, paddingVertical: 32 },
  note: { fontSize: TEXT.body, paddingHorizontal: 20, paddingVertical: 12, textAlign: "center" },
  retry: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  entry: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, minHeight: 46 },
});
