/**
 * Personalized streaming narration for live turn activity, reasoning rows, and
 * common developer commands. Reads explicit summaries when provided by the
 * engine/backend, and otherwise derives crisp human-readable phrases directly
 * from the streaming reasoning headings and tool targets.
 */
import { commandSummary } from "../../../../ui/src/lib/chat/command.ts";
import { t } from "../../../../ui/src/lib/i18n.ts";
import { nombreDe, type Paso } from "../../../../ui/src/lib/steps-model.ts";
import type { Razonamiento } from "./messageTypes.ts";

const MAX_HEADLINE = 72;

function cleanLine(raw: string): string {
  return raw
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/^\s*[-*•]\s+/, "")
    .replace(/\s+/g, " ")
    .replace(/[:.;,\s]+$/, "")
    .trim();
}

function truncateHeadline(text: string, max = MAX_HEADLINE): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

function usableHeading(raw: string): string | null {
  const cleaned = cleanLine(raw);
  if (cleaned.length < 4) return null;
  if (!/[A-Za-zÀ-ÿ0-9]/.test(cleaned)) return null;
  return truncateHeadline(cleaned);
}

function extractExplicitHeading(text: string, latest: boolean): string | null {
  const boldMatches = [...text.matchAll(/\*\*([^*\n]{4,120})\*\*/g)]
    .map((m) => usableHeading(m[1] ?? ""))
    .filter((v): v is string => v !== null);
  if (boldMatches.length > 0) return latest ? boldMatches.at(-1)! : boldMatches[0]!;

  const atxMatches = [...text.matchAll(/^#{1,4}\s+([^\n]{4,120})$/gm)]
    .map((m) => usableHeading(m[1] ?? ""))
    .filter((v): v is string => v !== null);
  if (atxMatches.length > 0) return latest ? atxMatches.at(-1)! : atxMatches[0]!;

  return null;
}

function extractStreamingSentence(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed || trimmed.startsWith("```")) return null;
  // Require a completed boundary so half-streamed tokens do not flicker.
  const match = trimmed.match(/^([^\n]{18,140}?)(?:[.?!…](?:\s|$)|\n)/);
  if (!match) return null;
  const candidate = cleanLine(match[1] ?? "");
  if (candidate.length < 18 || candidate.split(/\s+/).length < 3) return null;
  return truncateHeadline(candidate);
}

/**
 * Extracts a short, readable title from reasoning blocks.
 * - With `allowSentence: false` (collapsed rows), only explicit summaries or
 *   markdown headings are used so plain reasoning bodies stay hidden until opened.
 * - With `allowSentence: true` (live streaming header), falls back to the first
 *   complete sentence when the model streams prose without headings.
 */
export function reasoningHeadline(
  bloques: readonly Razonamiento[] | null | undefined,
  options: { latest?: boolean; allowSentence?: boolean } = {},
): string | null {
  if (!bloques?.length) return null;
  const latest = options.latest ?? false;
  const ordered = latest ? [...bloques].reverse() : bloques;

  for (const block of ordered) {
    if (block.summary?.trim()) return truncateHeadline(cleanLine(block.summary));
    const heading = extractExplicitHeading(block.text, latest);
    if (heading) return heading;
  }

  if (options.allowSentence) {
    for (const block of ordered) {
      const sentence = extractStreamingSentence(block.text);
      if (sentence) return sentence;
    }
  }

  return null;
}

export function withEllipsis(text: string): string {
  return text.endsWith("…") || text.endsWith("...") ? text : `${text}…`;
}

function pickTestSubject(cmd: string): string | null {
  const match = cmd.match(/\b[\w./-]+\.(?:test|spec)\.[cm]?[jt]sx?\b/i);
  return match ? nombreDe(match[0]) : null;
}

function pickSearchQuery(cmd: string): string | null {
  const quoted = cmd.match(/(?:^|\s)(?:rg|grep|ag|ack)\b[^"'|\n]*["']([^"'\n]{2,36})["']/);
  if (quoted?.[1]) return quoted[1].trim();
  const bare = cmd.match(/(?:^|\s)(?:rg|grep)\s+(?:-[^\s]+\s+)*([^\s"'|&;-][^\s"'|&;]{1,32})/);
  return bare?.[1]?.trim() ?? null;
}

function webTarget(raw: string): { isUrl: boolean; label: string } {
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      return { isUrl: true, label: url.hostname.replace(/^www\./, "") };
    } catch {
      return { isUrl: true, label: truncateHeadline(trimmed, 42) };
    }
  }
  return { isUrl: false, label: truncateHeadline(trimmed, 48) };
}

function key(id: string, live: boolean) {
  return `chat.narration.${live ? "live" : "done"}.${id}`;
}

/**
 * Turns common shell commands into warm, natural status phrases while keeping
 * the underlying command accessible in the row subject / tooltip / expanded log.
 */
export function narrateCommand(command: string, live: boolean): string | null {
  const summary = commandSummary(command, 200);
  if (!summary) return null;
  const lower = summary.toLowerCase();

  // Git inspection & workflow
  if (/^git\s+(status|diff)\b/.test(lower)) return t(key("git_changes", live));
  if (/^git\s+(log|show|blame)\b/.test(lower)) return t(key("git_history", live));
  if (/^git\s+commit\b/.test(lower)) return t(key("git_commit", live));
  if (/^git\s+push\b/.test(lower)) return t(key("git_push", live));
  if (/^git\s+(pull|fetch|merge|rebase)\b/.test(lower)) return t(key("git_sync", live));
  if (/^git\s+(switch|checkout|branch)\b/.test(lower)) return t(key("git_branch", live));

  // Tests
  if (/\b(vitest|jest|pytest|playwright)\b|\b(pnpm|npm|yarn|bun|cargo|go|node)\b[^\n]*\b(--test|test)\b/.test(lower)) {
    const file = pickTestSubject(summary);
    return file ? t(key("tests_file", live), { file }) : t(key("tests", live));
  }

  // Typecheck & build
  if (/\b(tsc|typecheck|cargo\s+check|mypy|pyright)\b/.test(lower)) return t(key("typecheck", live));
  if (/\b(vite\s+build|next\s+build|cargo\s+build|webpack|esbuild|rollup)\b|\b(pnpm|npm|yarn|bun)\b[^\n]*\bbuild\b/.test(lower)) {
    return t(key("build", live));
  }

  // Dependencies
  if (/\b(pnpm|npm|yarn|bun)\s+(install|ci|add|i)\b|\b(pip|uv)\s+(install|sync)\b|\bcargo\s+fetch\b/.test(lower)) {
    return t(key("install", live));
  }

  // Search & file exploration
  if (/^(rg|grep|ag|ack)\b/.test(lower)) {
    const query = pickSearchQuery(summary);
    return query ? t(key("search_query", live), { query }) : t(key("search_code", live));
  }
  if (/^(ls|find|fd|tree|wc)\b/.test(lower)) return t(key("explore_files", live));
  if (/^(cat|head|tail|sed|awk)\b/.test(lower)) return t(key("inspect_files", live));

  // Deploy & infra / PRs / HTTP
  if (/\b(wrangler|terraform|pulumi|cdk|helm|kubectl)\b[^\n]*\b(deploy|apply|push)\b/.test(lower)) {
    return t(key("deploy", live));
  }
  if (/^gh\s+(pr|issue)\b/.test(lower)) return t(key("github_pr", live));
  if (/^(curl|wget|http)\b/.test(lower)) return t(key("http", live));

  return null;
}

/**
 * Returns a personalized phrase for a step when a richer narration exists, or
 * `null` to let the standard verb + target label render as-is.
 */
export function narrateStep(paso: Paso, options: { live: boolean }): string | null {
  if (paso.summary?.trim()) {
    const cleaned = truncateHeadline(cleanLine(paso.summary));
    return options.live ? withEllipsis(cleaned) : cleaned;
  }
  if (paso.clase === "ejecutar" && paso.objetivo) {
    return narrateCommand(paso.objetivo, options.live);
  }
  if (paso.clase === "web" && paso.objetivo) {
    const target = webTarget(paso.objetivo);
    return target.isUrl
      ? t(key("web_site", options.live), { target: target.label })
      : t(key("web_query", options.live), { target: target.label });
  }
  return null;
}
