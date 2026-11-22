import type { AstroBody, AstroNode } from "./astro.ts";

/** Formas, parte 2: se juntan en `astro.ts`. */
export const ASTRO_SHAPES_2: Record<Extract<AstroBody, "ringed" | "comet" | "nebula" | "binary" | "dwarf" | "pulsar" | "catplanet" | "monkeyplanet">, AstroNode> = {
  "ringed": {
    "tag": "g",
    "attrs": {},
    "children": [
      {
        "tag": "g",
        "attrs": {"class": "astro-gira"},
        "children": [
          {"tag": "circle", "attrs": {"cx": "32", "cy": "32", "r": "18", "fill": "var(--astro-2)"}},
          {"tag": "path", "attrs": {"d": "M14 28a18 18 0 0 1 36 0z", "fill": "var(--astro-1)", "opacity": "0.5"}}
        ]
      },
      {
        "tag": "g",
        "attrs": {"class": "astro-columpio"},
        "children": [
          {
            "tag": "ellipse",
            "attrs": {"cx": "32", "cy": "34", "rx": "31", "ry": "7.5", "fill": "none", "stroke": "var(--astro-2)", "stroke-width": "3.4"}
          },
          {
            "tag": "ellipse",
            "attrs": {"cx": "32", "cy": "34", "rx": "25", "ry": "5.5", "fill": "none", "stroke": "var(--astro-1)", "stroke-width": "1.8"}
          }
        ]
      }
    ]
  },
  "comet": {
    "tag": "g",
    "attrs": {},
    "children": [
      {
        "tag": "g",
        "attrs": {"class": "astro-estela", "stroke": "var(--astro-1)", "stroke-linecap": "round", "fill": "none"},
        "children": [
          {"tag": "path", "attrs": {"d": "M8 52q14 -10 24 -22", "stroke-width": "5", "opacity": "0.5"}},
          {"tag": "path", "attrs": {"d": "M16 58q12 -8 19 -19", "stroke-width": "3", "opacity": "0.32"}}
        ]
      },
      {
        "tag": "g",
        "attrs": {"class": "astro-gira"},
        "children": [
          {"tag": "circle", "attrs": {"cx": "40", "cy": "25", "r": "16", "fill": "var(--astro-2)"}},
          {"tag": "path", "attrs": {"d": "M24 25a16 16 0 0 1 32 0z", "fill": "var(--astro-1)", "opacity": "0.5"}}
        ]
      }
    ]
  },
  "nebula": {
    "tag": "g",
    "attrs": {},
    "children": [
      {
        "tag": "g",
        "attrs": {"class": "astro-columpio", "opacity": "0.5", "fill": "none", "stroke": "var(--astro-1)"},
        "children": [
          {"tag": "ellipse", "attrs": {"cx": "32", "cy": "32", "rx": "30", "ry": "17", "stroke-width": "4"}},
          {"tag": "ellipse", "attrs": {"cx": "32", "cy": "32", "rx": "17", "ry": "30", "stroke-width": "2.4"}}
        ]
      },
      {
        "tag": "g",
        "attrs": {"class": "astro-gira"},
        "children": [
          {"tag": "circle", "attrs": {"cx": "32", "cy": "32", "r": "17", "fill": "var(--astro-2)"}},
          {"tag": "path", "attrs": {"d": "M15 32a17 17 0 0 1 34 0z", "fill": "var(--astro-1)", "opacity": "0.55"}}
        ]
      }
    ]
  },
  "binary": {
    "tag": "g",
    "attrs": {},
    "children": [
      {
        "tag": "g",
        "attrs": {"class": "astro-gira"},
        "children": [
          {"tag": "circle", "attrs": {"cx": "23", "cy": "36", "r": "16", "fill": "var(--astro-2)"}},
          {"tag": "path", "attrs": {"d": "M7 36a16 16 0 0 1 32 0z", "fill": "var(--astro-1)", "opacity": "0.5"}},
          {"tag": "circle", "attrs": {"cx": "47", "cy": "20", "r": "9", "fill": "var(--astro-1)"}}
        ]
      }
    ]
  },
  "dwarf": {
    "tag": "g",
    "attrs": {"class": "astro-gira"},
    "children": [
      {"tag": "circle", "attrs": {"cx": "32", "cy": "32", "r": "16", "fill": "var(--astro-2)"}},
      {"tag": "path", "attrs": {"d": "M16 32a16 16 0 0 1 32 0z", "fill": "var(--astro-1)", "opacity": "0.55"}},
      {
        "tag": "g",
        "attrs": {"fill": "var(--astro-1)", "opacity": "0.4"},
        "children": [{"tag": "circle", "attrs": {"cx": "24", "cy": "41", "r": "3.4"}}, {"tag": "circle", "attrs": {"cx": "41", "cy": "27", "r": "2.2"}}]
      }
    ]
  },
  "pulsar": {
    "tag": "g",
    "attrs": {},
    "children": [
      {
        "tag": "g",
        "attrs": {"class": "astro-columpio", "fill": "var(--astro-1)", "opacity": "0.6"},
        "children": [{"tag": "path", "attrs": {"d": "M32 0l4.5 22h-9z"}}, {"tag": "path", "attrs": {"d": "M32 64l-4.5 -22h9z"}}]
      },
      {
        "tag": "g",
        "attrs": {"class": "astro-gira"},
        "children": [
          {"tag": "circle", "attrs": {"cx": "32", "cy": "32", "r": "16", "fill": "var(--astro-2)"}},
          {"tag": "path", "attrs": {"d": "M16 32a16 16 0 0 1 32 0z", "fill": "var(--astro-1)", "opacity": "0.5"}}
        ]
      },
      {
        "tag": "circle",
        "attrs": {"class": "astro-fotones", "cx": "32", "cy": "32", "r": "16", "fill": "none", "stroke": "var(--astro-1)", "stroke-width": "2.2"}
      }
    ]
  },
  "catplanet": {
    "tag": "g",
    "attrs": {},
    "children": [
      {
        "tag": "path",
        "attrs": {"d": "M47 40c11 4 13 16 5 21", "fill": "none", "stroke": "var(--astro-2)", "stroke-width": "4.2", "stroke-linecap": "round"}
      },
      {
        "tag": "g",
        "attrs": {"class": "astro-gira"},
        "children": [
          {"tag": "circle", "attrs": {"cx": "32", "cy": "32", "r": "17.5", "fill": "var(--astro-2)"}},
          {"tag": "path", "attrs": {"d": "M14.5 32a17.5 17.5 0 0 1 35 0z", "fill": "var(--astro-1)", "opacity": "0.55"}}
        ]
      },
      {
        "tag": "g",
        "attrs": {"fill": "var(--astro-2)"},
        "children": [
          {"tag": "path", "attrs": {"d": "M12 25 18 5l10 18z"}},
          {"tag": "path", "attrs": {"d": "m16 22 3-11 6 10z", "fill": "var(--astro-1)", "opacity": "0.8"}}
        ]
      },
      {
        "tag": "g",
        "attrs": {"fill": "var(--astro-2)"},
        "children": [
          {"tag": "path", "attrs": {"d": "M52 25 46 5 36 23z"}},
          {"tag": "path", "attrs": {"d": "m48 22-3-11-6 10z", "fill": "var(--astro-1)", "opacity": "0.8"}}
        ]
      },
      {
        "tag": "g",
        "attrs": {
          "class": "astro-bigotes",
          "fill": "none",
          "stroke": "var(--astro-ojo)",
          "stroke-width": "1.5",
          "stroke-linecap": "round",
          "opacity": "0.55",
          "style": {"transform-origin": "32px 38px"}
        },
        "children": [{"tag": "path", "attrs": {"d": "M10 35h9M10 40h8"}}, {"tag": "path", "attrs": {"d": "M45 35h9M46 40h8"}}]
      }
    ]
  },
  "monkeyplanet": {
    "tag": "g",
    "attrs": {},
    "children": [
      {
        "tag": "g",
        "attrs": {
          "class": "astro-cola",
          "fill": "none",
          "stroke": "var(--astro-2)",
          "stroke-width": "3.6",
          "stroke-linecap": "round",
          "style": {"transform-origin": "46px 42px"}
        },
        "children": [{"tag": "path", "attrs": {"d": "M47 40c13 6 13 20-1 20-10 0-8-8 0-8 8 0 8 6 2 8"}}]
      },
      {
        "tag": "g",
        "attrs": {"class": "astro-gira"},
        "children": [
          {"tag": "circle", "attrs": {"cx": "32", "cy": "32", "r": "17.5", "fill": "var(--astro-2)"}},
          {"tag": "path", "attrs": {"d": "M14.5 32a17.5 17.5 0 0 1 35 0z", "fill": "var(--astro-1)", "opacity": "0.55"}}
        ]
      },
      {
        "tag": "g",
        "attrs": {"class": "astro-orejas", "fill": "var(--astro-2)", "style": {"transform-origin": "12px 26px"}},
        "children": [
          {"tag": "circle", "attrs": {"cx": "11", "cy": "26", "r": "7.2"}},
          {"tag": "circle", "attrs": {"cx": "11", "cy": "26", "r": "4", "fill": "var(--astro-1)", "opacity": "0.7"}}
        ]
      },
      {
        "tag": "g",
        "attrs": {"class": "astro-orejas astro-orejas-inv", "fill": "var(--astro-2)", "style": {"transform-origin": "52px 26px"}},
        "children": [
          {"tag": "circle", "attrs": {"cx": "53", "cy": "26", "r": "7.2"}},
          {"tag": "circle", "attrs": {"cx": "53", "cy": "26", "r": "4", "fill": "var(--astro-1)", "opacity": "0.7"}}
        ]
      },
      {"tag": "ellipse", "attrs": {"cx": "32", "cy": "36", "rx": "9", "ry": "8", "fill": "var(--astro-1)", "opacity": "0.4"}}
    ]
  }
};
