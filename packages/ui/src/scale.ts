/**
 * The type scale and radii every client shares, in pixels at 100 % zoom. The
 * desktop declares them as `--text-*` and `--radius-*` in `global.css`;
 * `scripts/guards/shared-design.mjs` fails when one drifts.
 */
export const TEXT = { "2xs": 10, caption: 11, label: 12, ui: 13, body: 14, lead: 15 } as const;
export type TextStep = keyof typeof TEXT;

export const RADIUS = { sm: 4, md: 6, lg: 8 } as const;
export type RadiusStep = keyof typeof RADIUS;

/** The steps as Tailwind class suffixes, for the tools that must recognize `text-caption` as a size. */
export const TEXT_STEPS = Object.keys(TEXT) as TextStep[];

/** The brand color of each inbox channel: the desktop's `--color-inbox-channel-*`. */
export const CHANNEL_COLORS = { whatsapp: "#25d366", instagram: "#e1306c", messenger: "#1877f2" } as const;
