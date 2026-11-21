/**
 * Utilidades de menciones y comandos para paridad con apps/desktop.
 */

export type TaskTarget = { kind: "task"; projectId: string; sessionId: string };
export type FolderTarget = { kind: "folder"; projectId: string };
export type PortfolioTarget = { kind: "portfolio"; portfolioId: string };
export type MentionTarget = TaskTarget | FolderTarget | PortfolioTarget;
export type TaskMention = {
  target?: MentionTarget;
  start: number;
  end: number;
  text: string;
};

export type MentionChunk = { text: string; reference: string | null };
const CLOSING_PUNCTUATION = /[,;:!?)\]]+$/;

export function splitMentions(text: string): MentionChunk[] {
  const chunks: MentionChunk[] = [];
  let plain = "";
  let i = 0;

  while (i < text.length) {
    const isMention = text[i] === "@" && (i === 0 || /\s/.test(text[i - 1]));
    if (!isMention) {
      plain += text[i++];
      continue;
    }
    const rest = text.slice(i + 1);
    let reference: string;
    let size: number;
    if (rest.startsWith('"')) {
      const end = rest.indexOf('"', 1);
      if (end < 0) {
        plain += text[i++];
        continue;
      }
      reference = rest.slice(1, end);
      size = end + 1;
    } else {
      const cut = rest.search(/[\s@"]/);
      const raw = (cut < 0 ? rest : rest.slice(0, cut)).replace(CLOSING_PUNCTUATION, "");
      reference = raw;
      size = raw.length;
    }
    if (!reference) {
      plain += text[i++];
      continue;
    }
    if (plain) chunks.push({ text: plain, reference: null });
    plain = "";
    chunks.push({ text: text.slice(i, i + 1 + size), reference });
    i += 1 + size;
  }

  if (plain) chunks.push({ text: plain, reference: null });
  return chunks;
}

export type Span = { text: string; kind: "mention" | "recipient" | "command" | null };

export function highlightSpans(
  text: string,
  commands: ReadonlySet<string> = new Set(),
  _skills: ReadonlySet<string> = new Set(),
): Span[] {
  const spans: Span[] = [];
  let from = 0;
  const command = /^\/([\w:-]+)(?=\s|$)/.exec(text);
  if (command && (commands.size === 0 || commands.has(command[1]))) {
    spans.push({ text: command[0], kind: "command" });
    from = command[0].length;
  }
  spans.push({ text: text.slice(from), kind: null });
  return spans;
}

export function tramosDelMensaje(
  text: string,
  commands: ReadonlySet<string>,
  skills: ReadonlySet<string> = new Set(),
): Span[] {
  return highlightSpans(text, commands, skills);
}

export function claseDelTramo(
  kind: NonNullable<Span["kind"]>,
  lugar: "caja" | "enviado" = "caja",
): string {
  const color = kind === "recipient" ? "bg-primary/10 text-primary" : "bg-info/10 text-info-strong";
  return lugar === "enviado" ? `rounded-sm ${color} font-mono` : `rounded-sm ${color}`;
}
