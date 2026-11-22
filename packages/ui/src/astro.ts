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

export const ASTRO_SHAPES: Record<AstroBody, AstroNode> = {
  "sun": {
    "tag": "g",
    "attrs": {},
    "children": [
      {
        "tag": "g",
        "attrs": {"class": "astro-gira"},
        "children": [
          {"tag": "circle", "attrs": {"cx": "32", "cy": "32", "r": "20", "fill": "var(--astro-2)"}},
          {"tag": "circle", "attrs": {"cx": "32", "cy": "32", "r": "20", "fill": "var(--astro-1)", "opacity": "0.5"}},
          {
            "tag": "g",
            "attrs": {"fill": "var(--astro-2)", "opacity": "0.45"},
            "children": [
              {"tag": "ellipse", "attrs": {"cx": "20", "cy": "24", "rx": "6", "ry": "3"}},
              {"tag": "ellipse", "attrs": {"cx": "44", "cy": "41", "rx": "5", "ry": "2.6"}}
            ]
          }
        ]
      },
      {
        "tag": "g",
        "attrs": {"class": "astro-corona", "stroke": "var(--astro-2)", "stroke-width": "3.4", "stroke-linecap": "round"},
        "children": [{"tag": "path", "attrs": {"d": "M32 1v7M32 56v7M1 32h7M56 32h7M9.5 9.5l5 5M49.5 49.5l5 5M54.5 9.5l-5 5M14.5 49.5l-5 5"}}]
      }
    ]
  },
  "planet": {
    "tag": "g",
    "attrs": {},
    "children": [
      {
        "tag": "g",
        "attrs": {"class": "astro-gira"},
        "children": [
          {"tag": "circle", "attrs": {"cx": "32", "cy": "32", "r": "19.5", "fill": "var(--astro-2)"}},
          {"tag": "path", "attrs": {"d": "M12.5 27a19.5 19.5 0 0 1 39 0z", "fill": "var(--astro-1)", "opacity": "0.55"}},
          {
            "tag": "g",
            "attrs": {"fill": "var(--astro-1)", "opacity": "0.34"},
            "children": [
              {"tag": "ellipse", "attrs": {"cx": "22", "cy": "40", "rx": "7", "ry": "3"}},
              {"tag": "ellipse", "attrs": {"cx": "43", "cy": "43", "rx": "5", "ry": "2.3"}}
            ]
          }
        ]
      },
      {
        "tag": "ellipse",
        "attrs": {
          "class": "astro-columpio",
          "cx": "32",
          "cy": "34",
          "rx": "30",
          "ry": "8.5",
          "fill": "none",
          "stroke": "var(--astro-2)",
          "stroke-width": "3.2"
        }
      }
    ]
  },
  "moon": {
    "tag": "g",
    "attrs": {"class": "astro-gira"},
    "children": [
      {"tag": "circle", "attrs": {"cx": "32", "cy": "32", "r": "21", "fill": "var(--astro-2)"}},
      {"tag": "circle", "attrs": {"cx": "32", "cy": "32", "r": "21", "fill": "var(--astro-1)", "opacity": "0.55"}},
      {
        "tag": "g",
        "attrs": {"fill": "var(--astro-2)", "opacity": "0.8"},
        "children": [
          {"tag": "circle", "attrs": {"cx": "47", "cy": "22", "r": "3.6"}},
          {"tag": "circle", "attrs": {"cx": "17", "cy": "44", "r": "2.8"}},
          {"tag": "circle", "attrs": {"cx": "45", "cy": "45", "r": "2.2"}},
          {"tag": "circle", "attrs": {"cx": "21", "cy": "20", "r": "1.8"}}
        ]
      }
    ]
  },
  "asteroid": {
    "tag": "g",
    "attrs": {"class": "astro-gira"},
    "children": [
      {"tag": "path", "attrs": {"d": "M32 6 52 14l7 18-9 18-19 8-17-11-4-20 10-16z", "fill": "var(--astro-2)"}},
      {"tag": "path", "attrs": {"d": "M32 6 52 14l3 9-23 2-14-6z", "fill": "var(--astro-1)", "opacity": "0.6"}},
      {
        "tag": "g",
        "attrs": {"fill": "var(--astro-1)", "opacity": "0.3"},
        "children": [{"tag": "circle", "attrs": {"cx": "24", "cy": "44", "r": "4"}}, {"tag": "circle", "attrs": {"cx": "44", "cy": "38", "r": "2.6"}}]
      }
    ]
  },
  "star": {
    "tag": "g",
    "attrs": {"class": "astro-gira"},
    "children": [
      {
        "tag": "path",
        "attrs": {"d": "M32 1l7.8 21.8L63 27.2 45.5 42.6l5.4 20.6L32 51.4 13.1 63.2l5.4-20.6L1 27.2l23.2-4.4z", "fill": "var(--astro-2)"}
      },
      {"tag": "path", "attrs": {"d": "M32 1l7.8 21.8L63 27.2 32 27.2z", "fill": "var(--astro-1)", "opacity": "0.6"}}
    ]
  },
  "hole": {
    "tag": "g",
    "attrs": {},
    "children": [
      {
        "tag": "ellipse",
        "attrs": {"cx": "32", "cy": "32", "rx": "30", "ry": "9", "fill": "none", "stroke": "var(--astro-1)", "stroke-width": "7", "opacity": "0.32"}
      },
      {
        "tag": "g",
        "attrs": {"class": "astro-caida", "style": {"--astro-ang": "0deg"}},
        "children": [
          {
            "tag": "circle",
            "attrs": {"class": "astro-particula", "cx": "7", "cy": "32", "r": "1.7", "fill": "var(--astro-1)", "style": {"animation-delay": "0.0s"}}
          }
        ]
      },
      {
        "tag": "g",
        "attrs": {"class": "astro-caida", "style": {"--astro-ang": "58deg"}},
        "children": [
          {
            "tag": "circle",
            "attrs": {
              "class": "astro-particula",
              "cx": "7",
              "cy": "32",
              "r": "1.7",
              "fill": "var(--astro-1)",
              "style": {"animation-delay": "0.3333333333333333s"}
            }
          }
        ]
      },
      {
        "tag": "g",
        "attrs": {"class": "astro-caida", "style": {"--astro-ang": "124deg"}},
        "children": [
          {
            "tag": "circle",
            "attrs": {
              "class": "astro-particula",
              "cx": "7",
              "cy": "32",
              "r": "1.7",
              "fill": "var(--astro-1)",
              "style": {"animation-delay": "0.6666666666666666s"}
            }
          }
        ]
      },
      {
        "tag": "g",
        "attrs": {"class": "astro-caida", "style": {"--astro-ang": "190deg"}},
        "children": [
          {
            "tag": "circle",
            "attrs": {
              "class": "astro-particula",
              "cx": "7",
              "cy": "32",
              "r": "1.7",
              "fill": "var(--astro-1)",
              "style": {"animation-delay": "0.16666666666666666s"}
            }
          }
        ]
      },
      {
        "tag": "g",
        "attrs": {"class": "astro-caida", "style": {"--astro-ang": "246deg"}},
        "children": [
          {
            "tag": "circle",
            "attrs": {"class": "astro-particula", "cx": "7", "cy": "32", "r": "1.7", "fill": "var(--astro-1)", "style": {"animation-delay": "0.5s"}}
          }
        ]
      },
      {
        "tag": "g",
        "attrs": {"class": "astro-caida", "style": {"--astro-ang": "308deg"}},
        "children": [
          {
            "tag": "circle",
            "attrs": {
              "class": "astro-particula",
              "cx": "7",
              "cy": "32",
              "r": "1.7",
              "fill": "var(--astro-1)",
              "style": {"animation-delay": "0.8333333333333334s"}
            }
          }
        ]
      },
      {"tag": "circle", "attrs": {"cx": "32", "cy": "32", "r": "16", "fill": "var(--astro-2)"}},
      {
        "tag": "circle",
        "attrs": {"class": "astro-fotones", "cx": "32", "cy": "32", "r": "16", "fill": "none", "stroke": "var(--astro-1)", "stroke-width": "2.6"}
      },
      {
        "tag": "path",
        "attrs": {"d": "M2 32a30 9 0 0 0 60 0", "fill": "none", "stroke": "var(--astro-1)", "stroke-width": "6", "stroke-linecap": "round", "opacity": "0.8"}
      }
    ]
  },
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
