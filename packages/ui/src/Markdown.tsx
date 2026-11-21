import { type JSX, For } from "solid-js";
import { cn } from "./lib/utils";

export interface MarkdownProps {
  children?: string;
  class?: string;
  texto?: (valor: string, inicio: boolean) => JSX.Element;
}

/**
 * Pinta texto con formato Markdown básico y soporte para transformador de texto de marcas.
 * Paridad visual con apps/desktop/src/ui/Markdown.tsx.
 */
export function Markdown(props: MarkdownProps) {
  const content = () => props.children ?? "";

  const blocks = () => {
    const raw = content();
    if (!raw) return [];
    return raw.split(/\n{2,}/);
  };

  const renderBlock = (block: string, index: number) => {
    const trimmed = block.trim();
    if (trimmed.startsWith("```")) {
      const lines = trimmed.split("\n");
      const code = lines
        .slice(1, lines[lines.length - 1].startsWith("```") ? -1 : undefined)
        .join("\n");
      return (
        <pre class="m-0 overflow-auto rounded-md border border-border bg-surface-muted p-3 font-mono text-[0.82rem] leading-[1.5] text-neutral-950 [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-inherit my-3">
          <code>{code}</code>
        </pre>
      );
    }
    if (trimmed.startsWith("# ")) {
      return (
        <h1 class="mt-4 mb-2 text-[1.3rem] font-bold leading-tight">
          {props.texto ? props.texto(trimmed.slice(2), index === 0) : trimmed.slice(2)}
        </h1>
      );
    }
    if (trimmed.startsWith("## ")) {
      return (
        <h2 class="mt-4 mb-2 text-[1.15rem] font-bold leading-tight">
          {props.texto ? props.texto(trimmed.slice(3), index === 0) : trimmed.slice(3)}
        </h2>
      );
    }
    if (trimmed.startsWith("### ")) {
      return (
        <h3 class="mt-3 mb-2 text-[1.02rem] font-bold leading-tight">
          {props.texto ? props.texto(trimmed.slice(4), index === 0) : trimmed.slice(4)}
        </h3>
      );
    }
    if (trimmed.startsWith("> ")) {
      return (
        <blockquote class="my-3 border-l-2 border-border-strong pl-3 text-neutral-700">
          {props.texto ? props.texto(trimmed.slice(2), index === 0) : trimmed.slice(2)}
        </blockquote>
      );
    }
    return (
      <p class="m-0 mb-3 leading-[1.55] break-words whitespace-pre-wrap">
        {props.texto ? props.texto(block, index === 0) : block}
      </p>
    );
  };

  return (
    <div
      class={cn(
        "min-w-0 max-w-full [overflow-wrap:anywhere] text-[0.9rem] leading-[1.55] text-neutral-900 [&>:first-child>:first-child]:mt-0 [&>:last-child>:last-child]:mb-0",
        props.class,
      )}
    >
      <For each={blocks()}>{(b, i) => renderBlock(b, i())}</For>
    </div>
  );
}
