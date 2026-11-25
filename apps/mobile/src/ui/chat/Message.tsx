import { TEXT } from "@terminus/design";
import { imagenInerte, splitNextSteps } from "@terminus/chat";
import type { TurnTool } from "@terminus/protocol";
import { memo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { type Theme, useTheme } from "../theme";
import { ChatImage, LocalFile } from "./Embeds";
import { Markdown } from "./Markdown";

/**
 * El cuerpo de un mensaje como en la ventana (`TextoConSiguientes`): su markdown
 * y, si el agente las dejó, las respuestas rápidas de `<NEXT_STEPS>` como
 * botones que mandan ese mensaje. Debajo, las imágenes que produjeron sus pasos.
 */
export const MessageBody = memo(function MessageBody({
  text,
  streaming = false,
  images = [],
  onQuickReply,
}: {
  text: string;
  streaming?: boolean;
  images?: string[];
  /** Solo el último mensaje del agente, y no mientras trabaja; devuelve si se mandó. */
  onQuickReply?: (prompt: string) => Promise<boolean>;
}) {
  const theme = useTheme();
  const parts = splitNextSteps(text, streaming);
  return (
    <View style={styles.body}>
      {parts.map((part) =>
        part.kind === "markdown" ? (
          part.markdown.trim() ? <Markdown key={part.id} text={part.markdown} streaming={streaming} /> : null
        ) : (
          <View key={part.id} style={styles.steps}>
            {part.prose ? <Markdown text={part.prose} /> : null}
            {part.options.map((option) => (
              <QuickReply key={option.id} prompt={option.prompt} theme={theme} onSend={part.complete ? onQuickReply : undefined} />
            ))}
          </View>
        ),
      )}
      {images.map((uri, i) => (
        <ChatImage key={`img${i}`} uri={uri} />
      ))}
    </View>
  );
});

function QuickReply({ prompt, theme, onSend }: { prompt: string; theme: Theme; onSend?: (prompt: string) => Promise<boolean> }) {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const disabled = !onSend || state !== "idle";
  return (
    <Pressable
      disabled={disabled}
      onPress={() => {
        setState("sending");
        void onSend!(prompt).then((sent) => setState(sent ? "sent" : "idle"));
      }}
      style={[styles.reply, { borderColor: theme.border, backgroundColor: theme.bg, opacity: disabled && state !== "sending" ? 0.55 : 1 }]}
    >
      <Text style={{ color: theme.text, fontSize: TEXT.body }}>{prompt}</Text>
    </Pressable>
  );
}

/** Las imágenes que devolvieron los pasos del turno, solo las que ya vienen en el mensaje (`data:image/…`). */
export function toolImages(tools: TurnTool[] | undefined): string[] {
  return [...new Set((tools ?? []).flatMap((tool) => tool.images ?? []))].flatMap((uri) => imagenInerte(uri) ?? []);
}

/** Lo que la persona adjuntó, leído de la máquina como en la ventana. */
export function Attachments({ paths }: { paths: string[] }) {
  return (
    <View style={styles.attachments}>
      {paths.map((path) => (
        <View key={path} style={styles.attachment}>
          <LocalFile path={path} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: 8 },
  steps: { gap: 6 },
  reply: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 },
  attachments: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  attachment: { width: 140 },
});
