import { RADIUS } from "@terminus/design";
import { destinoAbrible, imagenInerte, imagenLocal, internalTaskLink, localFilePath } from "@terminus/chat/links";
import { MAX_CHAT_VISUALS, parseVisualDirective } from "@terminus/chat/visual";
import * as Clipboard from "expo-clipboard";
import { type Token, type Tokens, marked } from "marked";
import { type ReactNode, memo, useMemo, useState } from "react";
import { Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { t } from "../../lib/i18n";
import { columnWidths } from "../../lib/tableColumns";
import { openTask } from "../components";
import { Icon } from "../Icon";
import { type Theme, useTheme } from "../theme";
import { ChatImage, ChatVisual, LocalFile } from "./Embeds";
import { MermaidDiagram } from "./Mermaid";
import { type ChatScope, useChatScope } from "./scope";

const MONO = Platform.select({ ios: "Menlo", default: "monospace" });

type Ctx = { theme: Theme; scope: ChatScope | null; streaming: boolean; visuals: { count: number }; size: number };

/**
 * El markdown de un mensaje con lo mismo que pinta la ventana (`Markdown.tsx`):
 * GFM con tablas y casillas, código con copiar, ```mermaid como diagrama,
 * imágenes (`data:` del mensaje o rutas de la máquina), tarjetas de archivo,
 * enlaces a tareas y `::terminus-visual{…}` sola en su párrafo. El HTML crudo
 * se queda como texto; las URLs pasan por los mismos filtros (`@terminus/chat/links`).
 */
export const Markdown = memo(function Markdown({ text, streaming = false, size = 15 }: { text: string; streaming?: boolean; size?: number }) {
  const theme = useTheme();
  const scope = useChatScope();
  const tokens = useMemo(() => marked.lexer(text), [text]);
  const ctx: Ctx = { theme, scope, streaming, visuals: { count: 0 }, size };
  return <View style={styles.root}>{blocks(tokens, ctx, "b")}</View>;
});

function blocks(tokens: Token[], ctx: Ctx, key: string): ReactNode[] {
  return tokens.map((token, i) => block(token, ctx, `${key}.${i}`, i === tokens.length - 1));
}

function block(token: Token, ctx: Ctx, key: string, last: boolean): ReactNode {
  const { theme, size } = ctx;
  switch (token.type) {
    case "space":
    case "def":
      return null;
    case "heading": {
      const h = token as Tokens.Heading;
      const scale = [1.35, 1.2, 1.08, 1, 1, 1][h.depth - 1] ?? 1;
      return (
        <Text key={key} selectable style={[styles.heading, { color: theme.text, fontSize: size * scale }]}>
          {inline(h.tokens, ctx, key)}
        </Text>
      );
    }
    case "paragraph": {
      const p = token as Tokens.Paragraph;
      const directive = p.text.startsWith("::terminus-visual") ? parseVisualDirective(p.text.trim()) : null;
      // Mientras llega, la última línea puede estar a medias: se pinta cuando ya terminó.
      if (directive && !(ctx.streaming && last) && ctx.visuals.count < MAX_CHAT_VISUALS && ctx.scope) {
        ctx.visuals.count += 1;
        return <ChatVisual key={key} file={directive.file} title={directive.title} />;
      }
      return paragraph(p.tokens, ctx, key);
    }
    case "code": {
      const c = token as Tokens.Code;
      if ((c.lang ?? "").trim().toLowerCase() === "mermaid" && !(ctx.streaming && last)) return <MermaidDiagram key={key} definition={c.text} />;
      return <CodeBlock key={key} code={c.text} theme={theme} />;
    }
    case "blockquote":
      return (
        <View key={key} style={[styles.quote, { borderColor: theme.border }]}>
          {blocks((token as Tokens.Blockquote).tokens, ctx, key)}
        </View>
      );
    case "list": {
      const list = token as Tokens.List;
      const start = typeof list.start === "number" ? list.start : 1;
      return (
        <View key={key} style={styles.list}>
          {list.items.map((item, i) => (
            <View key={`${key}.${i}`} style={styles.item}>
              <Text style={[styles.bullet, { color: theme.textMuted, fontSize: size, lineHeight: size * 1.45 }]}>
                {item.task ? (item.checked ? "☑" : "☐") : list.ordered ? `${start + i}.` : "•"}
              </Text>
              <View style={styles.itemBody}>{blocks(item.tokens.filter((t) => t.type !== "checkbox"), ctx, `${key}.${i}`)}</View>
            </View>
          ))}
        </View>
      );
    }
    case "table":
      return <Table key={key} table={token as Tokens.Table} ctx={ctx} />;
    case "hr":
      return <View key={key} style={[styles.hr, { backgroundColor: theme.border }]} />;
    case "text": {
      // Dentro de un elemento de lista apretada el texto llega como bloque.
      const tx = token as Tokens.Text;
      return paragraph(tx.tokens ?? [tx], ctx, key);
    }
    case "html":
      return (
        <Text key={key} selectable style={{ color: theme.text, fontSize: size }}>
          {(token as Tokens.HTML).text}
        </Text>
      );
    default:
      return "raw" in token && typeof token.raw === "string" ? (
        <Text key={key} selectable style={{ color: theme.text, fontSize: size }}>
          {token.raw}
        </Text>
      ) : null;
  }
}

/** Un párrafo: el texto corre en un `Text`; una imagen o un archivo cortan el renglón y van como bloque. */
function paragraph(tokens: Token[], ctx: Ctx, key: string): ReactNode {
  const out: ReactNode[] = [];
  let run: Token[] = [];
  const flush = () => {
    if (!run.length) return;
    const k = `${key}.t${out.length}`;
    out.push(
      <Text key={k} selectable style={{ color: ctx.theme.text, fontSize: ctx.size, lineHeight: ctx.size * 1.45 }}>
        {inline(run, ctx, k)}
      </Text>,
    );
    run = [];
  };
  for (const token of tokens) {
    if (token.type === "image") {
      flush();
      out.push(image(token as Tokens.Image, ctx, `${key}.i${out.length}`));
    } else run.push(token);
  }
  flush();
  // Quita el blanco que deja una imagen entre renglones.
  return out.length === 1 ? out[0] : <View key={key} style={styles.paragraph}>{out}</View>;
}

function image(token: Tokens.Image, ctx: Ctx, key: string): ReactNode {
  const inert = imagenInerte(token.href);
  if (inert) return <ChatImage key={key} uri={inert} alt={token.text} />;
  const local = imagenLocal(token.href) ?? localFilePath(token.href);
  if (local && ctx.scope) return <LocalFile key={key} path={local} alt={token.text} />;
  return (
    <Text key={key} style={{ color: ctx.theme.textMuted, fontSize: ctx.size }}>
      {token.text}
    </Text>
  );
}

function inline(tokens: Token[] | undefined, ctx: Ctx, key: string): ReactNode[] {
  const { theme } = ctx;
  return (tokens ?? []).map((token, i) => {
    const k = `${key}.${i}`;
    switch (token.type) {
      case "strong":
        return (
          <Text key={k} style={styles.strong}>
            {inline((token as Tokens.Strong).tokens, ctx, k)}
          </Text>
        );
      case "em":
        return (
          <Text key={k} style={styles.em}>
            {inline((token as Tokens.Em).tokens, ctx, k)}
          </Text>
        );
      case "del":
        return (
          <Text key={k} style={styles.del}>
            {inline((token as Tokens.Del).tokens, ctx, k)}
          </Text>
        );
      case "codespan":
        return (
          <Text key={k} style={[styles.codespan, { backgroundColor: theme.muted, fontSize: ctx.size * 0.88 }]}>
            {(token as Tokens.Codespan).text}
          </Text>
        );
      case "br":
        return "\n";
      case "link": {
        const link = token as Tokens.Link;
        const onPress = linkAction(link.href, ctx);
        return (
          <Text key={k} style={{ color: theme.primary, textDecorationLine: onPress ? "underline" : "none" }} onPress={onPress}>
            {inline(link.tokens, ctx, k)}
          </Text>
        );
      }
      case "image":
        return (token as Tokens.Image).text;
      case "text": {
        const tx = token as Tokens.Text;
        return tx.tokens ? <Text key={k}>{inline(tx.tokens, ctx, k)}</Text> : tx.text;
      }
      case "escape":
        return (token as Tokens.Escape).text;
      default:
        return "raw" in token ? (token.raw as string) : null;
    }
  });
}

/**
 * Como la ventana: una tarea del mismo workspace abre la tarea (la de otro lo
 * dice, como `markdown.link.other_workspace`); http(s) y mailto, el navegador;
 * lo demás no navega.
 */
function linkAction(href: string, ctx: Ctx): (() => void) | undefined {
  const task = internalTaskLink(href);
  const scope = ctx.scope;
  if (task && scope) {
    if (task.workspace !== scope.workspace) return () => Alert.alert(t("chat.link.other_workspace"));
    return () => openTask(scope.hostId, task.workspace, task.folder, task.task);
  }
  const target = destinoAbrible(href);
  if (target) return () => void Linking.openURL(target);
  return undefined;
}

function CodeBlock({ code, theme }: { code: string; theme: Theme }) {
  const [copied, setCopied] = useState(false);
  return (
    <View style={[styles.code, { backgroundColor: theme.muted, borderColor: theme.border }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Text selectable style={[styles.codeText, { color: theme.text }]}>
          {code}
        </Text>
      </ScrollView>
      <Pressable
        hitSlop={10}
        style={styles.copy}
        accessibilityLabel={t("chat.copy")}
        onPress={() =>
          void Clipboard.setStringAsync(code).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
        }
      >
        <Icon name={copied ? "check" : "copy"} size={14} color={theme.textMuted} />
      </Pressable>
    </View>
  );
}

function Table({ table, ctx }: { table: Tokens.Table; ctx: Ctx }) {
  const { theme } = ctx;
  const window = useWindowDimensions();
  const [available, setAvailable] = useState(0);
  const widths = useMemo(
    () =>
      columnWidths(
        table.header.map((h, i) => ({ header: h.text, cells: table.rows.map((row) => row[i]?.text ?? "") })),
        available || window.width - 32,
        ctx.size * 0.93,
        CELL_PAD * 2 + 2,
      ),
    [table, available, window.width, ctx.size],
  );
  const cell = (c: Tokens.TableCell, k: string, header: boolean, i: number) => (
    <View key={k} style={[styles.cell, { width: widths[i], borderColor: theme.border, backgroundColor: header ? theme.muted : "transparent" }]}>
      <Text selectable style={{ color: theme.text, fontSize: ctx.size * 0.93, fontWeight: header ? "700" : "400", textAlign: c.align ?? "left" }}>
        {inline(c.tokens, ctx, k)}
      </Text>
    </View>
  );
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.tableWrap}
      onLayout={(e) => setAvailable(Math.floor(e.nativeEvent.layout.width))}
    >
      <View style={[styles.table, { borderColor: theme.border }]}>
        <View style={styles.row}>{table.header.map((c, i) => cell(c, `h${i}`, true, i))}</View>
        {table.rows.map((row, r) => (
          <View key={`r${r}`} style={styles.row}>
            {row.map((c, i) => cell(c, `r${r}.${i}`, false, i))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const CELL_PAD = 6;

const styles = StyleSheet.create({
  root: { gap: 8 },
  paragraph: { gap: 6 },
  heading: { fontWeight: "800", marginTop: 4 },
  strong: { fontWeight: "700" },
  em: { fontStyle: "italic" },
  del: { textDecorationLine: "line-through" },
  codespan: { fontFamily: MONO },
  quote: { borderLeftWidth: 2, paddingLeft: 10, gap: 6, opacity: 0.85 },
  list: { gap: 4 },
  item: { flexDirection: "row", gap: 8 },
  bullet: { minWidth: 14 },
  itemBody: { flex: 1, gap: 4 },
  hr: { height: StyleSheet.hairlineWidth, marginVertical: 6 },
  code: { borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, padding: 10, paddingRight: 30 },
  codeText: { fontFamily: MONO, fontSize: 12.5, lineHeight: 18 },
  copy: { position: "absolute", top: 8, right: 8 },
  tableWrap: { flexGrow: 0 },
  table: { borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.lg, overflow: "hidden" },
  row: { flexDirection: "row" },
  cell: { padding: CELL_PAD, borderWidth: StyleSheet.hairlineWidth },
});
