import { fromMarkdown } from "mdast-util-from-markdown";
import { MAX_CHAT_VISUALS, parseVisualDirective } from "@terminus/chat/visual";

export { MAX_CHAT_VISUALS };

export type ChatVisual = { kind: "visual"; file: string; title: string; id: string };
export type VisualPart = ChatVisual | { kind: "markdown"; markdown: string };

export function splitChatVisuals(text: string, _streaming: boolean): VisualPart[] {
  if (!text.includes("::terminus-visual")) return [{ kind: "markdown", markdown: text }];
  const parts: VisualPart[] = [];
  let cursor = 0;
  let count = 0;
  const paragraphs = fromMarkdown(text).children.filter((node) => node.type === "paragraph");
  for (const line of text.matchAll(/^::terminus-visual[^\r\n]*/gm)) {
    const start = line.index;
    const end = start + line[0].length;
    if (count === MAX_CHAT_VISUALS) continue;
    const directive = parseVisualDirective(line[0]);
    if (!directive) continue;
    const containsLine = (node: { position?: { start: { offset?: number }; end: { offset?: number } } }) =>
      (node.position?.start.offset ?? Infinity) <= start &&
      (node.position?.end.offset ?? -1) >= end;
    const paragraph = paragraphs.find(containsLine);
    if (!paragraph || paragraph.children.some((child) =>
      child.type === "inlineCode" &&
      (child.position?.start.offset ?? Infinity) <= start &&
      (child.position?.end.offset ?? -1) > start,
    )) continue;
    const { file, title } = directive;
    parts.push({ kind: "markdown", markdown: text.slice(cursor, start) });
    parts.push({ kind: "visual", file, title, id: `${start}:${file}` });
    cursor = end;
    count += 1;
  }
  parts.push({ kind: "markdown", markdown: text.slice(cursor) });
  return parts;
}
