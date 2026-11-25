import type { AstroBody, AstroNode } from "./astro.ts";

/** Formas, parte 1: se juntan en `astro.ts`. */
export const ASTRO_SHAPES_1: Record<Extract<AstroBody, "sun" | "planet" | "moon" | "asteroid" | "star" | "hole">, AstroNode> = {
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
  }
};
