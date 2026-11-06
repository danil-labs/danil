import assert from "node:assert/strict";
import test from "node:test";

import {  agruparModelos,
  coincideModelo,
  favoritosDeModelos,
  effortOptions,
  opcionesDeModelos,
  effortValue,
  effortAlCambiarDeModelo,
  nombreDeModelo,
} from "../../src/lib/models.ts";
import type { ModelOption } from "../../src/lib/model.ts";
import type { Superficie } from "../../src/lib/surfaces.ts";

const model = (id: string, label: string): ModelOption => ({  id,
  label,
  note: null,
  efforts: [],
  default_effort: null,
  gratis: false,
});

test("los resultados conservan la sección que desambigua modelos parecidos", () => {  const superficies: Superficie[] = [
    {      id: "claude", provider: "claude", label: "Claude", catalogo: "todo",
      usable: true, marca: null, porque: null,
    },
    {      id: "codex", provider: "codex", label: "Codex", catalogo: "todo",
      usable: true, marca: null, porque: null,
    },
    {      id: "opencode-zen", provider: "opencode-zen", label: "OpenCode", catalogo: "de_pago",
      usable: true, marca: null, porque: null,
    },
    {      id: "opencode-zen-gratuitos", provider: "opencode-zen", label: "Modelos Free",
      catalogo: "gratuitos", usable: true, marca: null, porque: null,
    },
    {      id: "opencode-local", provider: "opencode-local", label: "Locales", catalogo: "todo",
      usable: true, marca: null, porque: null,
    },
  ];
  const opciones = opcionesDeModelos(superficies, {    claude: { provider: "x", fallback: false, models: [model("gpt-5", "GPT 5")] },
    codex: { provider: "x", fallback: false, models: [model("gpt-5", "GPT 5")] },
    "opencode-zen": { provider: "x", fallback: false,      models: [
        model("opencode/gpt-5", "GPT 5"),
        model("opencode-go/gpt-5", "GPT 5"),
        { ...model("opencode/free-gpt", "GPT 5"), gratis: true },
      ],
    },
    "opencode-local": { provider: "x", fallback: false, models: [model("ollama/gpt-5", "GPT 5")] },
  });
  const grupos = agruparModelos(opciones, "gpt5");

  assert.deepEqual(
    grupos.map((grupo) => [
      grupo.label,
      grupo.models.map((item) => [item.agent, item.model.id]),
    ]),
    [
      ["Claude", [["claude", "gpt-5"]]],
      ["Codex", [["codex", "gpt-5"]]],
      ["OpenCode", [["opencode-zen", "opencode/gpt-5"]]],
      ["OpenCode Go", [["opencode-zen", "opencode-go/gpt-5"]]],
      ["Danil Free model router", [["opencode-zen", "opencode/free-gpt"]]],
      ["OpenCode Local", [["opencode-local", "ollama/gpt-5"]]],
    ],
  );
  assert.deepEqual(grupos.map((grupo) => grupo.logo), [
    "claude", "codex", "opencode", "opencode", "opencode", "opencode",
  ]);
});

test("una superficie de pago no aparece cuando no está autenticada", () => {  const opciones = opcionesDeModelos(
    [{      id: "opencode-zen-gratuitos", provider: "opencode-zen", label: "Modelos Free",
      catalogo: "gratuitos", usable: true, marca: null, porque: null,
    }],
    {      "opencode-zen": { provider: "x", fallback: false,        models: [
          model("opencode/claude-sonnet", "Claude Sonnet"),
          { ...model("opencode/free-model", "Free Model"), gratis: true },
          model("opencode-go/kimi", "Kimi"),
        ],
      },
    },
  );

  assert.deepEqual(opciones.map((opcion) => opcion.proveedor.label), ["Danil Free model router"]);
  assert.deepEqual(opciones.map((opcion) => opcion.model.id), ["opencode/free-model"]);
});

test("el selector recibe todos los agentes: el candado decide cuáles se eligen", () => {
  const superficies: Superficie[] = [
    { id: "claude", provider: "claude", label: "Claude", catalogo: "todo", usable: true, marca: null, porque: null },
    { id: "codex", provider: "codex", label: "Codex", catalogo: "todo", usable: true, marca: null, porque: null },
  ];
  const opciones = opcionesDeModelos(superficies, {
    claude: { provider: "x", fallback: false, models: [model("sonnet", "Sonnet")] },
    codex: { provider: "x", fallback: false, models: [model("gpt-5.6-sol", "GPT-5.6 Sol")] },
  });

  assert.deepEqual(opciones.map((opcion) => opcion.agent), ["claude", "codex"]);
  assert.deepEqual(opciones.map((opcion) => opcion.model.id), ["sonnet", "gpt-5.6-sol"]);
});

test("se puede buscar por proveedor, id, acentos y sin separadores", () => {  assert.equal(coincideModelo("opencode", ["GPT 5", "opencode/gpt-5", "OpenCode"]), true);
  assert.equal(coincideModelo("mimov25", ["MiMo V2.5"]), true);
  assert.equal(coincideModelo("razon", ["Razón"]), true);
  assert.equal(coincideModelo("gemini", ["Claude Sonnet"]), false);
});

test("los favoritos conservan proveedor y no duplican el mismo id de otro", () => {
  const opciones = opcionesDeModelos(
    [
      { id: "claude", provider: "claude", label: "Claude", catalogo: "todo", usable: true, marca: null, porque: null },
      { id: "codex", provider: "codex", label: "Codex", catalogo: "todo", usable: true, marca: null, porque: null },
    ],
    {
      claude: { provider: "claude", fallback: false, models: [model("gpt-5", "GPT 5")] },
      codex: { provider: "codex", fallback: false, models: [model("gpt-5", "GPT 5")] },
    },
  );
  assert.deepEqual(favoritosDeModelos(opciones, [opciones[1].key]).map((m) => m.agent), ["codex"]);
});

test("the default effort is listed once and still means letting the agent decide", () => {
  const rows = effortOptions(["low", "medium", "high", "xhigh"], "medium");
  assert.deepEqual(rows.map((r) => r.label), ["low", "medium", "high", "xhigh"]);
  assert.equal(rows.find((r) => r.label === "medium")?.value, "");
  assert.equal(effortValue("medium", "medium"), "");
  assert.equal(effortValue("high", "medium"), "high");
  assert.deepEqual(effortOptions(["low", "max"], null), [
    { value: "", label: null },
    { value: "low", label: "low" },
    { value: "max", label: "max" },
  ]);
});

test("cambiar de modelo conserva el nivel de razonamiento solo si el nuevo lo admite", () => {
  const con = (efforts: string[], default_effort: string | null = null): ModelOption => ({
    ...model("m", "M"),
    efforts,
    default_effort,
  });

  assert.equal(effortAlCambiarDeModelo("high", con(["low", "high", "max"])), "high");
  // Un nivel que el modelo nuevo no conoce llegaría al CLI como argumento inválido.
  assert.equal(effortAlCambiarDeModelo("max", con(["low", "high"])), "");
  assert.equal(effortAlCambiarDeModelo("high", con([])), "");
  // Dejar decidir al agente no se convierte en el nivel por omisión del modelo nuevo.
  assert.equal(effortAlCambiarDeModelo("", con(["low", "high"], "high")), "");
});

test("la fila de acciones nombra el modelo con su versión", () => {
  const catalogo = {
    provider: "claude",
    fallback: false,
    models: [{ id: "opus", label: "Claude Opus 5.5", note: null, efforts: [], default_effort: null, gratis: null }],
  };
  assert.equal(nombreDeModelo("claude-opus-5-5"), "Claude Opus 5.5");
  assert.equal(nombreDeModelo("claude-opus-5-5[1m]"), "Claude Opus 5.5");
  assert.equal(nombreDeModelo("claude-haiku-4-5-20251001"), "Claude Haiku 4.5");
  assert.equal(nombreDeModelo("opus", catalogo), "Claude Opus 5.5");
  assert.equal(nombreDeModelo("grok-4.7"), "grok-4.7");
});
