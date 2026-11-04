import { envolver } from "@terminus/chat/sandbox";
import { parseTable, delimiterFor } from "@terminus/chat/table";
import { TEXT } from "@terminus/design";
import type { FilePreview, TreeContent } from "@terminus/protocol";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { previewFile, taskTrees, treeBytes, treeFile, treeOfficePdf, treeTypstPdf, type TypstDiagnostic } from "../lib/engine";
import { baseName, parentOf } from "../lib/files";
import { fileKindOf, hasTwoSides, type FileKind } from "../lib/fileKinds";
import { type Host } from "../lib/hosts";
import { t } from "../lib/i18n";
import { useMachines } from "../lib/machines";
import { Markdown } from "../ui/chat/Markdown";
import { SandboxedPage } from "../ui/chat/Page";
import { MediaView } from "../ui/files/MediaView";
import { PdfView } from "../ui/files/PdfView";
import { CAN_SAVE, saveFile } from "../ui/files/share";
import { Icon, type IconName } from "../ui/Icon";
import { NavBar, Tap, pageColor } from "../ui/list";
import { SlideIn } from "../ui/SlideIn";
import { useTheme } from "../ui/theme";

/**
 * Un archivo a pantalla completa: la tercera pantalla de Chat → Archivos → Visor.
 * Se abre con `tree` (un archivo de la lista de la tarea, `tree_show`) o sin él
 * (una ruta que nombró el chat, `preview_file`). `from` dice a dónde vuelve
 * «‹»: al chat si se abrió desde el chat, a Archivos si desde la lista; la pila
 * ya vuelve a la pantalla de antes, el rótulo lo dice.
 * Solo lee: la máquina apagada no se enciende por mirar.
 */
export default function FileScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ host: string; workspace: string; folder: string; id: string; path: string; tree?: string; from?: string }>();
  const { hostOf } = useMachines();
  const host = hostOf(params.host);
  const where = useWhere(host, params);
  const path = where?.path ?? params.path ?? "";
  const tree = where?.tree ?? null;
  const kind = fileKindOf(path);
  const twoSides = hasTwoSides(kind);
  const [side, setSide] = useState<"view" | "code">("view");
  const [page, setPage] = useState<{ page: number; pages: number } | null>(null);
  const [content, setContent] = useState<TreeContent | FilePreview | null | "error">(null);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const dark = kind === "image" || kind === "video";

  useEffect(() => {
    if (!host || !where) return;
    let live = true;
    setContent(null);
    // El video y el audio no pasan por `tree_show`: el motor leería el archivo entero para decir «binario».
    if (tree && (kind === "video" || kind === "audio")) return;
    const read = tree
      ? treeFile(host, params.workspace, params.folder, params.id, tree, path)
      : previewFile(host, params.workspace, path, { folder: params.folder, session: params.id });
    read.then((value) => live && setContent(value), () => live && setContent("error"));
    return () => {
      live = false;
    };
  }, [host, where, params.workspace, params.folder, params.id, tree, path, kind]);

  const loadBytes = useCallback(
    (onProgress: (done: number, total: number) => void) => treeBytes(host!, params.workspace, params.folder, params.id, tree!, path, onProgress),
    [host, params.workspace, params.folder, params.id, tree, path],
  );

  // Fuera de los árboles de la tarea solo se baja lo que `preview_file` trajo entero.
  const loose = !tree && content && content !== "error" ? bytesOf(content) : null;
  const canSave = CAN_SAVE && !!host && (!!tree || !!loose);

  async function share() {
    if (!host || saving || (!tree && !loose)) return;
    setSaving(true);
    setSaveFailed(false);
    try {
      const { bytes, mime } = tree ? await treeBytes(host, params.workspace, params.folder, params.id, tree, path) : loose!;
      await saveFile(baseName(path), bytes, mime);
    } catch {
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  }

  // Vuelve a donde se abrió: el chat, o la carpeta de la lista de la que salió.
  const back = params.from === "chat" ? t("task.tools.chat") : parentOf(path) ? baseName(parentOf(path)) : t("task.files.title");
  const subtitle = page && (kind === "pdf" || kind === "office" || (kind === "typst" && side === "view"))
    ? t("task.files.page", { page: page.page, pages: page.pages })
    : parentOf(path) || undefined;
  const right = twoSides ? (
    <View style={styles.sides}>
      <SideButton icon="code" label={t("task.files.code")} on={side === "code"} onPress={() => setSide("code")} />
      <SideButton icon="eye" label={t("task.files.view")} on={side === "view"} onPress={() => setSide("view")} />
    </View>
  ) : undefined;

  return (
    <SlideIn>
      <View style={{ flex: 1, backgroundColor: pageColor(theme) }}>
        <NavBar back={back} title={baseName(path)} subtitle={subtitle} right={right} />
        <View style={{ flex: 1, backgroundColor: dark ? "#000" : undefined }}>
          {!host ? <Note>{t("task.files.off")}</Note> : !where ? <Loading /> : (
            <Body
              host={host}
              params={params}
              tree={tree}
              path={path}
              kind={kind}
              side={side}
              content={content}
              loadBytes={loadBytes}
              onPage={(n, total) => setPage({ page: n, pages: total })}
            />
          )}
        </View>
        {canSave ? (
          <View style={[styles.bar, { borderTopColor: theme.border, paddingBottom: insets.bottom + 10 }]}>
            {saveFailed ? <Text style={{ color: theme.error, fontSize: TEXT.label }}>{t("task.files.share_failed")}</Text> : null}
            <Pressable accessibilityRole="button" disabled={saving} onPress={() => void share()} style={styles.barButton}>
              {saving ? <ActivityIndicator size="small" color={theme.text} /> : <Icon name="download" size={17} color={theme.text} />}
              <Text style={{ color: theme.text, fontSize: TEXT.label }}>{t("task.files.share")}</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </SlideIn>
  );
}

/** Los bytes de lo que llegó entero por `preview_file`; truncado o sin cuerpo no hay. */
function bytesOf(content: TreeContent | FilePreview): { bytes: Uint8Array; mime: string } | null {
  if (content.truncated) return null;
  const decode = (base64: string) => Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  if (content.pdf) return { bytes: decode(content.pdf), mime: "application/pdf" };
  const data = content.data_url?.match(/^data:([^;,]+)(;base64)?,(.*)$/s);
  if (data) return { bytes: data[2] ? decode(data[3]) : new TextEncoder().encode(decodeURIComponent(data[3])), mime: data[1] };
  if ((content.kind === "text" || content.kind === "html") && typeof content.text === "string") {
    return { bytes: new TextEncoder().encode(content.text), mime: content.kind === "html" ? "text/html" : "text/plain" };
  }
  return null;
}

/**
 * El árbol y la ruta dentro de él. Una ruta del chat es absoluta en la máquina:
 * si cae en un árbol de la tarea se lee como los de la lista (con video, Typst,
 * Office y Compartir); si no, queda suelta y se lee con `preview_file`.
 */
function useWhere(host: Host | undefined, params: { workspace: string; folder: string; id: string; path: string; tree?: string }) {
  const [where, setWhere] = useState<{ tree: string | null; path: string } | null>(params.tree ? { tree: params.tree, path: params.path } : null);
  useEffect(() => {
    if (params.tree) return setWhere({ tree: params.tree, path: params.path });
    setWhere(null);
    if (!host || !params.path.startsWith("/")) return setWhere({ tree: null, path: params.path });
    let live = true;
    taskTrees(host, params.workspace, params.folder, params.id).then(
      (trees) => {
        const found = trees.find((tree) => params.path.startsWith(`${tree.path.replace(/\/+$/, "")}/`));
        if (live) setWhere(found ? { tree: found.key, path: params.path.slice(found.path.replace(/\/+$/, "").length + 1) } : { tree: null, path: params.path });
      },
      () => live && setWhere({ tree: null, path: params.path }),
    );
    return () => {
      live = false;
    };
  }, [host, params.workspace, params.folder, params.id, params.path, params.tree]);
  return where;
}

function SideButton({ icon, label, on, onPress }: { icon: IconName; label: string; on: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={[styles.side, on ? { borderColor: theme.border, backgroundColor: theme.muted } : null]}
    >
      <Icon name={icon} size={17} color={on ? theme.text : theme.textMuted} />
    </Tap>
  );
}

function Note({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <Text style={[styles.note, { color: theme.textMuted }]}>{children}</Text>;
}

function Loading({ light }: { light?: boolean }) {
  const theme = useTheme();
  return (
    <View style={styles.center}>
      <ActivityIndicator color={light ? "#ddd" : theme.textMuted} />
    </View>
  );
}

function Body({ host, params, tree, path, kind, side, content, loadBytes, onPage }: {
  host: Host;
  params: { workspace: string; folder: string; id: string };
  tree: string | null;
  path: string;
  kind: FileKind;
  side: "view" | "code";
  content: TreeContent | FilePreview | null | "error";
  loadBytes: (onProgress: (done: number, total: number) => void) => Promise<{ bytes: Uint8Array; mime: string }>;
  onPage: (page: number, pages: number) => void;
}) {
  if (kind === "video" || kind === "audio") {
    if (!tree) return <Note>{t("task.files.no_preview")}</Note>;
    return (
      <View style={styles.media}>
        <MediaView kind={kind} load={loadBytes} />
      </View>
    );
  }
  if (content === "error") return <Note>{t("task.files.error")}</Note>;
  if (content === null) return <Loading light={kind === "image"} />;
  const text = typeof content.text === "string" ? content.text : "";
  if (kind === "typst" && side === "view" && tree) return <TypstView host={host} params={params} tree={tree} path={path} version={text} onPage={onPage} />;
  if (kind === "office" && tree) return <OfficeView host={host} params={params} tree={tree} path={path} onPage={onPage} />;
  if (content.kind === "image" && content.data_url) return <ZoomImage uri={content.data_url} label={baseName(path)} />;
  if (content.kind === "pdf" && content.pdf) return <PdfView base64={content.pdf} onPage={onPage} />;
  if (content.kind === "html" || content.kind === "text") {
    if (kind === "markdown" && side === "view") {
      return (
        <ScrollView contentContainerStyle={styles.page}>
          <Markdown text={text} />
        </ScrollView>
      );
    }
    if (kind === "html" && side === "view") return <SandboxedPage html={envolver(text)} />;
    if (kind === "table") return <Table text={text} path={path} />;
    return <Code text={text} truncated={!!content.truncated} />;
  }
  return <Opaque path={path} bytes={"bytes" in content ? content.bytes : null} />;
}

function Code({ text, truncated }: { text: string; truncated: boolean }) {
  const theme = useTheme();
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
      <ScrollView horizontal contentContainerStyle={{ minWidth: "100%" }}>
        <Text selectable style={[styles.mono, { color: theme.text }]}>{text}</Text>
      </ScrollView>
      {truncated ? <Note>{t("task.files.file_truncated")}</Note> : null}
    </ScrollView>
  );
}

function Table({ text, path }: { text: string; path: string }) {
  const theme = useTheme();
  const table = useMemo(() => parseTable(text, delimiterFor(path) ?? ","), [text, path]);
  // Cada columna al ancho de su celda más larga, con tope: sin eso cada fila se acomoda sola y no alinean.
  const widths = useMemo(() => {
    const out: number[] = [];
    for (const row of table.rows) row.forEach((cell, c) => (out[c] = Math.max(out[c] ?? 64, Math.min(220, 18 + cell.length * 7.5))));
    return out;
  }, [table]);
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
      <ScrollView horizontal>
        <View style={{ padding: 12 }}>
          {table.rows.map((row, r) => (
            <View key={r} style={{ flexDirection: "row" }}>
              {row.map((cell, c) => (
                <Text
                  key={c}
                  numberOfLines={1}
                  style={[styles.cell, { width: widths[c], color: theme.text, borderColor: theme.border, backgroundColor: r === 0 ? theme.muted : "transparent", fontWeight: r === 0 ? "600" : "400" }]}
                >
                  {cell}
                </Text>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
      {table.truncated ? <Note>{t("task.files.table_truncated")}</Note> : null}
    </ScrollView>
  );
}

/** Doble toque acerca y aleja; en iOS además se pellizca (`maximumZoomScale`). */
function ZoomImage({ uri, label }: { uri: string; label: string }) {
  const [ratio, setRatio] = useState(16 / 9);
  const [zoomed, setZoomed] = useState(false);
  const [box, setBox] = useState({ width: 0, height: 0 });
  useEffect(() => {
    Image.getSize(uri, (w, h) => h && setRatio(w / h), () => undefined);
  }, [uri]);
  let last = 0;
  const tap = () => {
    const now = Date.now();
    if (now - last < 300) setZoomed((z) => !z);
    last = now;
  };
  const fit = box.width / Math.max(1, box.height) > ratio
    ? { width: box.height * ratio, height: box.height }
    : { width: box.width, height: box.width / ratio };
  const scale = zoomed ? 2.5 : 1;
  return (
    <View style={{ flex: 1 }} onLayout={(e) => setBox(e.nativeEvent.layout)}>
      <ScrollView horizontal={zoomed} maximumZoomScale={4} minimumZoomScale={1} centerContent contentContainerStyle={zoomed ? null : styles.centerFill}>
        <ScrollView contentContainerStyle={zoomed ? null : styles.centerFill} scrollEnabled={zoomed}>
          <Pressable onPress={tap} accessibilityLabel={label}>
            <Image source={{ uri }} resizeMode="contain" style={{ width: fit.width * scale, height: fit.height * scale }} />
          </Pressable>
        </ScrollView>
      </ScrollView>
    </View>
  );
}

function TypstView({ host, params, tree, path, version, onPage }: {
  host: Host;
  params: { workspace: string; folder: string; id: string };
  tree: string;
  path: string;
  version: string;
  onPage: (page: number, pages: number) => void;
}) {
  const [state, setState] = useState<{ pdf: string | null; diagnostics: TypstDiagnostic[]; tooBig: boolean } | "error" | "missing" | null>(null);
  useEffect(() => {
    let live = true;
    setState(null);
    treeTypstPdf(host, params.workspace, params.folder, params.id, tree, path).then(
      (value) => live && setState(value),
      (error) => {
        const detail = error && typeof error === "object" && "detail" in error ? String(error.detail) : "";
        if (live) setState(detail.includes("plugin_not_enabled") ? "missing" : "error");
      },
    );
    return () => {
      live = false;
    };
  }, [host, params.workspace, params.folder, params.id, tree, path, version]);
  if (state === null) return <Compiling />;
  if (state === "missing") return <Note>{t("task.files.typst_missing")}</Note>;
  if (state === "error") return <Note>{t("task.files.typst_failed")}</Note>;
  if (state.pdf) return <PdfView base64={state.pdf} onPage={onPage} />;
  if (state.tooBig) return <Note>{t("task.files.pdf_too_big")}</Note>;
  return <Diagnostics list={state.diagnostics} />;
}

function Compiling() {
  const theme = useTheme();
  return (
    <View style={styles.center}>
      <ActivityIndicator color={theme.textMuted} />
      <Text style={{ color: theme.textMuted, fontSize: TEXT.label }}>{t("task.files.compiling")}</Text>
    </View>
  );
}

function Diagnostics({ list }: { list: TypstDiagnostic[] }) {
  const theme = useTheme();
  const errors = list.filter((d) => d.severity === "error");
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={{ color: theme.error, fontWeight: "600", fontSize: TEXT.body, marginBottom: 8 }}>{t("task.files.typst_errors", { count: errors.length })}</Text>
      {list.map((d, i) => (
        <View key={i} style={{ flexDirection: "row", gap: 8, paddingVertical: 4 }}>
          <Icon name={d.severity === "error" ? "circle-x" : "shield-alert"} size={14} color={d.severity === "error" ? theme.error : theme.warningStrong} />
          <Text style={{ color: theme.text, fontSize: TEXT.label, flex: 1 }}>
            {d.path && d.line ? <Text style={{ color: theme.textMuted }}>{`${d.path}:${d.line}  `}</Text> : null}
            {d.message}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

function OfficeView({ host, params, tree, path, onPage }: {
  host: Host;
  params: { workspace: string; folder: string; id: string };
  tree: string;
  path: string;
  onPage: (page: number, pages: number) => void;
}) {
  const [pdf, setPdf] = useState<string | null | "none" | "error">(null);
  useEffect(() => {
    let live = true;
    setPdf(null);
    treeOfficePdf(host, params.workspace, params.folder, params.id, tree, path).then(
      (value) => live && setPdf(value ?? "none"),
      () => live && setPdf("error"),
    );
    return () => {
      live = false;
    };
  }, [host, params.workspace, params.folder, params.id, tree, path]);
  if (pdf === null) return <Compiling />;
  if (pdf === "none" || pdf === "error") return <Opaque path={path} bytes={null} note={t("task.files.office_missing")} />;
  return <PdfView base64={pdf} onPage={onPage} />;
}

function Opaque({ path, bytes, note }: { path: string; bytes: number | null; note?: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.center, { paddingHorizontal: 32 }]}>
      <View style={[styles.big, { backgroundColor: theme.muted }]}>
        <Icon name="file" size={34} color={theme.textMuted} />
      </View>
      <Text style={{ color: theme.text, fontWeight: "600", fontSize: TEXT.body, textAlign: "center" }}>{baseName(path)}</Text>
      <Text style={{ color: theme.textMuted, fontSize: TEXT.label, textAlign: "center" }}>
        {note ?? (bytes !== null ? t("task.files.opaque", { size: `${Math.max(1, Math.round(bytes / 1024))} KB` }) : t("task.files.no_preview"))}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center", gap: 12, paddingVertical: 32 },
  media: { flex: 1, justifyContent: "center", alignItems: "stretch" },
  centerFill: { flexGrow: 1, alignItems: "center", justifyContent: "center" },
  note: { fontSize: TEXT.body, paddingHorizontal: 24, paddingVertical: 16, textAlign: "center" },
  page: { padding: 16, paddingBottom: 40 },
  sides: { flexDirection: "row", gap: 2 },
  side: { width: 34, height: 30, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: "transparent", alignItems: "center", justifyContent: "center" },
  bar: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10 },
  barButton: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 4 },
  mono: { fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }), fontSize: 12.5, lineHeight: 18, padding: 12 },
  cell: { borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 8, paddingVertical: 5, fontSize: TEXT.label },
  big: { width: 76, height: 88, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 4 },
});
