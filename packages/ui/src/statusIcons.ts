import type { StatusLabel } from "./labels.ts";

/** The Lucide icon of each mark; "working" is a dot, not an icon. */
export const STATUS_ICONS: Record<Exclude<StatusLabel, "working">, LucideName> = {
  approving: "shield-question-mark",
  asked: "circle-question-mark",
  failed: "circle-alert",
  interrupted: "circle-pause",
  unseen: "check",
  delivered: "check",
};

export type LucideName = keyof typeof LUCIDE;
export type IconShape =
  | { kind: "path"; d: string }
  | { kind: "circle"; cx: number; cy: number; r: number }
  | { kind: "line"; x1: number; y1: number; x2: number; y2: number };

/**
 * Shapes of the Lucide icons the marks use, in a 24×24 box, for clients that
 * cannot load lucide (the desktop imports `lucide-solid`).
 * Lucide is ISC License, Copyright (c) Lucide Icons and Contributors.
 */
export const LUCIDE = {
  check: [{ kind: "path", d: "M20 6 9 17l-5-5" }],
  "circle-alert": [
    { kind: "circle", cx: 12, cy: 12, r: 10 },
    { kind: "line", x1: 12, y1: 8, x2: 12, y2: 12 },
    { kind: "line", x1: 12, y1: 16, x2: 12.01, y2: 16 },
  ],
  "circle-pause": [
    { kind: "circle", cx: 12, cy: 12, r: 10 },
    { kind: "line", x1: 10, y1: 15, x2: 10, y2: 9 },
    { kind: "line", x1: 14, y1: 15, x2: 14, y2: 9 },
  ],
  "circle-question-mark": [
    { kind: "circle", cx: 12, cy: 12, r: 10 },
    { kind: "path", d: "M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" },
    { kind: "path", d: "M12 17h.01" },
  ],
  "shield-question-mark": [
    {
      kind: "path",
      d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
    },
    { kind: "path", d: "M9.1 9a3 3 0 0 1 5.82 1c0 2-3 3-3 3" },
    { kind: "path", d: "M12 17h.01" },
  ],
} satisfies Record<string, IconShape[]>;
