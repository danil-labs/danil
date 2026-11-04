import { TEXT } from "@terminus/design";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { t } from "../../lib/i18n";
import { useTheme } from "../theme";

export type LoadBytes = (onProgress: (done: number, total: number) => void) => Promise<{ bytes: Uint8Array; mime: string }>;

const mb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

/**
 * Un video o un audio de la tarea en el navegador del teléfono: llega por partes
 * (`tree_read_part`) y se reproduce desde un `blob:`, que es lo que Safari
 * reproduce (`media-src` de la web lo deja; nunca sale del navegador).
 */
export function MediaView({ kind, load }: { kind: "video" | "audio"; load: LoadBytes }) {
  const theme = useTheme();
  const [url, setUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [failed, setFailed] = useState<"too_big" | "failed" | null>(null);

  useEffect(() => {
    let alive = true;
    let made: string | null = null;
    setUrl(null);
    setFailed(null);
    load((done, total) => alive && setProgress({ done, total })).then(
      ({ bytes, mime }) => {
        if (!alive) return;
        made = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
        setUrl(made);
      },
      (error) => {
        const detail = error && typeof error === "object" && "detail" in error ? error.detail : null;
        if (alive) setFailed(detail === "tree_file_too_large" ? "too_big" : "failed");
      },
    );
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [load]);

  const color = kind === "video" ? "#ddd" : theme.textMuted;
  if (failed) {
    return <Text style={{ color, padding: 24, textAlign: "center", fontSize: TEXT.body }}>{t(failed === "too_big" ? "task.files.media_too_big" : "task.files.media_failed")}</Text>;
  }
  if (!url) {
    const share = progress ? progress.done / Math.max(1, progress.total) : 0;
    return (
      <View style={{ alignItems: "center", gap: 10, padding: 24 }}>
        <ActivityIndicator color={color} />
        <Text style={{ color, fontSize: TEXT.label }}>{t("task.files.media_loading")}</Text>
        <View style={{ width: 200, height: 4, borderRadius: 2, backgroundColor: "rgba(128,128,128,.3)", overflow: "hidden" }}>
          <View style={{ width: `${Math.round(share * 100)}%`, height: 4, backgroundColor: theme.primary }} />
        </View>
        {progress ? <Text style={{ color, fontSize: TEXT.label, fontVariant: ["tabular-nums"] }}>{`${mb(progress.done)} / ${mb(progress.total)}`}</Text> : null}
      </View>
    );
  }
  return kind === "video" ? (
    <video src={url} controls playsInline autoPlay style={{ width: "100%", maxHeight: "100%", background: "#000" }} />
  ) : (
    <View style={{ padding: 20, alignItems: "stretch" }}>
      <audio src={url} controls style={{ width: "100%" }} />
    </View>
  );
}
