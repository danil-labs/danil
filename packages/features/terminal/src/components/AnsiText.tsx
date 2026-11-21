import { For, createMemo } from "solid-js";
import {} from "@danil/ui";

interface AnsiSpan {
  text: string;
  classes: string;
}

const ANSI_COLOR_MAP: Record<number, string> = {
  // Colores estándar (30-37)
  30: "text-neutral-900 dark:text-neutral-950",
  31: "text-red-500",
  32: "text-green-500",
  33: "text-yellow-500",
  34: "text-blue-500",
  35: "text-purple-500",
  36: "text-cyan-500",
  37: "text-neutral-200",
  39: "text-terminal-text",
  // Colores brillantes (90-97)
  90: "text-neutral-400",
  91: "text-red-400",
  92: "text-green-400",
  93: "text-yellow-400",
  94: "text-blue-400",
  95: "text-purple-400",
  96: "text-cyan-400",
  97: "text-white",
  // Fondos estándar (40-47)
  40: "bg-neutral-900",
  41: "bg-red-900/60",
  42: "bg-green-900/60",
  43: "bg-yellow-900/60",
  44: "bg-blue-900/60",
  45: "bg-purple-900/60",
  46: "bg-cyan-900/60",
  47: "bg-neutral-200",
  49: "bg-transparent",
};

export function parseAnsi(rawText: string): AnsiSpan[] {
  if (!rawText) return [];

  // Eliminar secuencias de control no visuales (títulos OSC y movimientos de cursor no-color)
  const cleaned = rawText
    .replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-9;]*[A-HJKSTfhiln]/g, "");

  const regex = /\x1b\[([0-9;]*)m/g;
  const spans: AnsiSpan[] = [];

  let lastIndex = 0;
  let fgClass = "";
  let bgClass = "";
  let isBold = false;
  let isDim = false;
  let isUnderline = false;

  const buildClassString = () => {
    const parts: string[] = [];
    if (fgClass) parts.push(fgClass);
    if (bgClass) parts.push(bgClass);
    if (isBold) parts.push("font-bold");
    if (isDim) parts.push("opacity-70");
    if (isUnderline) parts.push("underline");
    return parts.join(" ");
  };

  let match: RegExpExecArray | null;
  while ((match = regex.exec(cleaned)) !== null) {
    if (match.index > lastIndex) {
      spans.push({
        text: cleaned.slice(lastIndex, match.index),
        classes: buildClassString(),
      });
    }
    lastIndex = regex.lastIndex;

    const codeStr = match[1] || "0";
    const codes = codeStr.split(";").map((c) => parseInt(c, 10) || 0);

    for (const code of codes) {
      if (code === 0) {
        fgClass = "";
        bgClass = "";
        isBold = false;
        isDim = false;
        isUnderline = false;
      } else if (code === 1) {
        isBold = true;
      } else if (code === 2) {
        isDim = true;
      } else if (code === 4) {
        isUnderline = true;
      } else if (code === 22) {
        isBold = false;
        isDim = false;
      } else if (code === 24) {
        isUnderline = false;
      } else if (ANSI_COLOR_MAP[code]) {
        if ((code >= 30 && code <= 39) || (code >= 90 && code <= 97)) {
          fgClass = ANSI_COLOR_MAP[code];
        } else if (code >= 40 && code <= 49) {
          bgClass = ANSI_COLOR_MAP[code];
        }
      }
    }
  }

  if (lastIndex < cleaned.length) {
    spans.push({
      text: cleaned.slice(lastIndex),
      classes: buildClassString(),
    });
  }

  return spans;
}

export function AnsiText(props: { text: string; class?: string }) {
  const spans = createMemo(() => parseAnsi(props.text));

  return (
    <span class={props.class}>
      <For each={spans()}>
        {(span) => (
          <span class={span.classes || undefined}>{span.text}</span>
        )}
      </For>
    </span>
  );
}
