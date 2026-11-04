import { TEXT } from "@terminus/design";
import type { HistoryRef } from "@terminus/protocol";
import { useContext, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { loadDetail } from "../../lib/engine";
import { t } from "../../lib/i18n";
import { useTheme } from "../theme";
import { MessageBody } from "./Message";
import { ChatScopeContext } from "./scope";

/** Lo que no cupo en la página de la conversación: se trae al pedirlo, con el mismo turno comprobado. */
export function HistoryDetail({ reference, turnId }: { reference: HistoryRef; turnId?: string }) {
  const theme = useTheme();
  const scope = useContext(ChatScopeContext);
  const [state, setState] = useState<"idle" | "loading" | "failed" | "large">("idle");
  const [text, setText] = useState<string | null>(null);
  const open = () => {
    if (!scope || state === "loading") return;
    setState("loading");
    loadDetail(scope.host, scope.workspace, scope.folder, scope.session, reference, turnId)
      .then((whole) => {
        if (whole === null) setState("large");
        else setText(whole);
      })
      .catch(() => setState("failed"));
  };
  // El texto del mensaje es la respuesta misma, no un adjunto que se abre.
  useEffect(() => {
    if (reference.pointer === "/text") open();
  }, [reference.pointer, reference.turn]);
  if (text !== null) return <MessageBody text={text} />;
  const note = state === "failed" ? t("task.history.failed") : state === "large" ? t("task.history.too_large") : state === "loading" ? t("task.history.older_loading") : null;
  return (
    <View style={{ gap: 4 }}>
      {state === "large" ? null : (
        <Pressable onPress={open} accessibilityRole="button" testID="history-detail">
          <Text style={{ color: theme.primary, fontSize: TEXT.ui }}>{t("task.history.open", { size: Math.ceil(reference.bytes / 1024) })}</Text>
        </Pressable>
      )}
      {note ? <Text style={{ color: theme.textMuted, fontSize: TEXT.ui }}>{note}</Text> : null}
    </View>
  );
}
