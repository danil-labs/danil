import { TEXT } from "@terminus/design";
import { useRef } from "react";
import { Pressable, Text, View } from "react-native";
import { enqueue } from "../lib/taskQueue";
import type { Host } from "../lib/hosts";
import { t } from "../lib/i18n";
import { useTheme } from "./theme";

/** La confirmación es la misma desde la cabecera y desde la lista. */
export function TaskFinishConfirmation(props: {
  host: Host;
  workspace: string;
  folder: string;
  id: string;
  shared: boolean;
  ready: boolean;
  onBlocked: () => void;
  onFinished: () => void;
}) {
  const theme = useTheme();
  const submitting = useRef(false);
  const finish = () => {
    if (!props.ready || submitting.current) return;
    // Entra a la cola: cerrar el trabajo no bloquea la pantalla. Si la máquina
    // lo rechaza, el error sale en la fila de la lista, no aquí.
    submitting.current = true;
    enqueue(props.host, { workspace: props.workspace, folder: props.folder, id: props.id }, "finish");
    props.onFinished();
  };
  return <View style={{ gap: 12 }}>
    <Text style={{ color: theme.textMuted, fontSize: TEXT.body, lineHeight: 21 }}>{t(props.shared ? "task.header.finish_shared" : "task.header.finish_description")}</Text>
    {!props.ready ? <Text style={{ color: theme.textMuted }}>{t("task.header.finish_unavailable")}</Text> : null}
    <Pressable testID="task-finish-confirm" accessibilityRole="button" disabled={!props.ready} onPress={finish} style={{ minHeight: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: theme.primary, opacity: props.ready ? 1 : 0.4 }}>
      <Text style={{ color: theme.onPrimary, fontWeight: "600" }}>{t("task.header.finish")}</Text>
    </Pressable>
  </View>;
}
