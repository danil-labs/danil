/**
 * The desktop's default themes, Violeta (light) and Grafito (dark), for clients
 * that cannot read `src/styles/global.css`. `CSS_SOURCE` names the variable each
 * value comes from; `scripts/guards/shared-design.mjs` fails when one drifts.
 * Keys without a source exist only outside the desktop.
 */
export type ThemeTokens = {
  bg: string;
  surface: string;
  muted: string;
  /** Menus and popovers over the list. */
  raised: string;
  border: string;
  /** The edge of a menu or popover. */
  borderStrong: string;
  text: string;
  textMuted: string;
  primary: string;
  onPrimary: string;
  userBubble: string;
  /** The input of a handler or another task: neutral, so it doesn't compete with the person's. */
  incomingBubble: string;
  success: string;
  error: string;
  info: string;
  warningStrong: string;
  approving: string;
  asked: string;
  failedMark: string;
  unseenMark: string;
  delivered: string;
  /** A merged PR, like the desktop's git icon. */
  merged: string;
};

export const CSS_SOURCE: Partial<Record<keyof ThemeTokens, string>> = {
  bg: "--color-bg",
  surface: "--color-surface",
  muted: "--color-surface-muted",
  raised: "--color-surface-raised",
  border: "--color-border",
  borderStrong: "--color-border-strong",
  text: "--color-neutral-950",
  textMuted: "--color-neutral-500",
  primary: "--color-primary",
  incomingBubble: "--color-chat-incoming",
  warningStrong: "--color-warning-strong",
  approving: "--color-warning",
  asked: "--color-brand-yellow",
  failedMark: "--color-error-strong",
  unseenMark: "--color-success",
  delivered: "--color-neutral-500",
  merged: "--color-brand-purple",
};

export const THEMES: { light: ThemeTokens; dark: ThemeTokens } = {
  light: {
    bg: "#f9f9f9",
    surface: "#ffffff",
    muted: "#f3f4f8",
    raised: "#ffffff",
    border: "rgba(10,13,35,0.1)",
    borderStrong: "rgba(10,13,35,0.16)",
    text: "#0a0d23",
    textMuted: "#62647a",
    primary: "#6539f5",
    onPrimary: "#ffffff",
    userBubble: "#efeafe",
    incomingBubble: "#f3f4f8",
    success: "#15803d",
    error: "#dc2626",
    info: "#2563eb",
    warningStrong: "#92400e",
    approving: "#f59e0b",
    asked: "#f4eb7b",
    failedMark: "#dc2626",
    unseenMark: "#5fcc79",
    delivered: "#62647a",
    merged: "#6539f5",
  },
  dark: {
    bg: "#111113",
    surface: "#212124",
    muted: "#19191c",
    raised: "#2c2c30",
    border: "rgba(255,255,255,0.08)",
    borderStrong: "rgba(255,255,255,0.14)",
    text: "#ececef",
    textMuted: "#9a9aa3",
    primary: "#ececef",
    onPrimary: "#111113",
    // `--color-chat-user`: brand yellow at 8% over `surface-raised`.
    userBubble: "#3c3b36",
    incomingBubble: "#2c2c30",
    success: "#4ade80",
    error: "#f87171",
    info: "#60a5fa",
    warningStrong: "#fbbf24",
    approving: "#f59e0b",
    asked: "#f4eb7b",
    failedMark: "#f87171",
    unseenMark: "#5fcc79",
    delivered: "#9a9aa3",
    merged: "#6539f5",
  },
};

/** The selectors whose declarations make each theme, in cascade order. */
export const CSS_THEME_BLOCKS = {
  light: ["@theme static", '[data-theme="light"][data-light-style="violet"]'],
  dark: ["@theme static", '[data-theme="dark"]', '[data-theme="dark"][data-dark-style="graphite"]'],
} as const;
