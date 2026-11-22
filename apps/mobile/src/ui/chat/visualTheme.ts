import type { VisualTheme } from "@terminus/chat";
import type { Theme } from "../theme";

/** Los tokens que reciben las visualizaciones, desde el tema del teléfono (el mismo del escritorio). */
export function visualThemeOf(theme: Theme, dark: boolean): VisualTheme {
  return {
    mode: dark ? "dark" : "light",
    tokens: {
      "--color-surface": theme.bg,
      "--color-surface-muted": theme.muted,
      "--color-surface-raised": theme.surface,
      "--color-neutral-950": theme.text,
      "--color-neutral-900": theme.text,
      "--color-neutral-700": theme.textMuted,
      "--color-neutral-500": theme.textMuted,
      "--color-primary": theme.primary,
      "--color-border": theme.border,
      "--color-success-strong": theme.success,
      "--color-error-strong": theme.error,
      "--color-warning-strong": theme.approving,
      "--color-info-strong": theme.info,
      "--color-link": theme.primary,
    },
    fontFamily: "-apple-system, system-ui, Roboto, sans-serif",
    fontSize: "15px",
    lineHeight: "1.45",
  };
}
