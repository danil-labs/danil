/** One match in a task thread, ready to paint as a card. Times stay absent when the message has none. */
export type SearchHitSource = {
  block: number;
  text: string;
  role: "user" | "agent";
  speaker: string | null;
  at?: number;
};

export type SearchHit = {
  block: number;
  occurrence: number;
  role: "user" | "agent";
  speaker: string | null;
  at?: number;
  /** Local calendar day `YYYY-MM-DD`, only when `at` is present. */
  day: string | null;
  before: string;
  mark: string;
  after: string;
};

export type SearchGroup = {
  day: string | null;
  at?: number;
  items: { hit: SearchHit; index: number }[];
};

const SNIPPET = 80;

export function dayKey(at: number): string {
  const date = new Date(at);
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

const escaped = (query: string) => query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const line = (value: string) => value.replace(/\s+/g, " ");

function excerpt(text: string, start: number, end: number, mark: string) {
  const from = Math.max(0, start - SNIPPET);
  const to = Math.min(text.length, end + SNIPPET);
  return {
    before: `${from > 0 ? "…" : ""}${line(text.slice(from, start))}`,
    mark: line(mark),
    after: `${line(text.slice(end, to))}${to < text.length ? "…" : ""}`,
  };
}

/** One card per match, in thread order. An empty query matches nothing. */
export function searchMatchCards(messages: readonly SearchHitSource[], query: string): SearchHit[] {
  if (!query) return [];
  const pattern = new RegExp(escaped(query), "gi");
  const hits: SearchHit[] = [];
  for (const message of messages) {
    let occurrence = 0;
    for (const match of message.text.matchAll(pattern)) {
      const start = match.index ?? 0;
      const found = match[0];
      hits.push({
        block: message.block,
        occurrence,
        role: message.role,
        speaker: message.speaker,
        at: message.at,
        day: message.at == null ? null : dayKey(message.at),
        ...excerpt(message.text, start, start + found.length, found),
      });
      occurrence += 1;
    }
  }
  return hits;
}

/** Consecutive hits that share a day stay together. A missing day does not invent one. */
export function groupSearchHits(hits: readonly SearchHit[]): SearchGroup[] {
  const groups: SearchGroup[] = [];
  hits.forEach((hit, index) => {
    const last = groups.at(-1);
    if (last && last.day === hit.day) last.items.push({ hit, index });
    else groups.push({ day: hit.day, at: hit.at, items: [{ hit, index }] });
  });
  return groups;
}
