import { ASTRO_SHAPES_1 } from "./astro-shapes-1.ts";
import { ASTRO_SHAPES_2 } from "./astro-shapes-2.ts";

// Orden estable: el hash de los nombres existentes depende de este catálogo.
export const ASTRO_BODIES = ["sun", "planet", "moon", "asteroid", "star", "hole", "ringed", "comet", "nebula", "binary", "dwarf", "pulsar", "catplanet", "monkeyplanet"] as const;
export type AstroBody = (typeof ASTRO_BODIES)[number];
export type AstroNode = { tag: "g" | "circle" | "ellipse" | "path"; attrs: Record<string, string | Record<string, string>>; children?: AstroNode[] };

export function isAstroBody(value: string | null | undefined): value is AstroBody {
  return !!value && (ASTRO_BODIES as readonly string[]).includes(value);
}

export function astroBody(name: string, body?: string | null): AstroBody {
  if (isAstroBody(body)) return body;
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return ASTRO_BODIES[Math.abs(hash) % ASTRO_BODIES.length];
}

// Colores base de global.css; oscuro cambia luna, asteroide y agujero negro.
export const ASTRO_COLORS: Record<AstroBody, readonly [string, string]> = {
  "sun": [
    "#ffe9b8",
    "#ffd98a"
  ],
  "planet": [
    "#dccbff",
    "#c9b2ff"
  ],
  "moon": [
    "#cdd8f0",
    "#a9b6d8"
  ],
  "asteroid": [
    "#e0cbb4",
    "#c9ae90"
  ],
  "star": [
    "#cfe2ff",
    "#a9c8ff"
  ],
  "hole": [
    "#ffc46b",
    "#2e2547"
  ],
  "ringed": [
    "#ffd9c2",
    "#f5b592"
  ],
  "comet": [
    "#c8f2f7",
    "#92dde8"
  ],
  "nebula": [
    "#ffcfe9",
    "#f0a5cf"
  ],
  "binary": [
    "#ffc9c2",
    "#f59b96"
  ],
  "dwarf": [
    "#d4f0cf",
    "#a4d49c"
  ],
  "pulsar": [
    "#d6d9ff",
    "#adb3f5"
  ],
  "catplanet": [
    "#ffd2a6",
    "#ee9a58"
  ],
  "monkeyplanet": [
    "#edd0c2",
    "#c48468"
  ]
};

export function astroColors(body: AstroBody, dark: boolean): readonly [string, string] {
  if (dark && body === "moon") return ["#e4eaf8", "#bfc9e4"];
  if (dark && body === "asteroid") return ["#e8d6c0", "#c9ae90"];
  if (dark && body === "hole") return ["#ffd98a", "#3d315e"];
  return ASTRO_COLORS[body];
}

export const ASTRO_SHAPES: Record<AstroBody, AstroNode> = { ...ASTRO_SHAPES_1, ...ASTRO_SHAPES_2 };
