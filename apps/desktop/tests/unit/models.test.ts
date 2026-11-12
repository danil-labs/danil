import assert from "node:assert/strict";
import test from "node:test";
import "../helpers/catalog.ts";
import { aplicarLenguaDeWorkspace } from "../../src/lib/i18n.ts";

import {  agruparModelos,
  coincideModelo,
  favoritosDeModelos,
  seccionDeModelo,
  effortOptions,
  opcionesDeModelos,
  effortValue,
  effortAlCambiarDeModelo,
  nombreDeModelo,
  modelBrand,
  proveedorDe,
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
    {      id: "opencode", provider: "opencode", label: "OpenCode", catalogo: "todo",
      usable: true, marca: null, porque: null,
    },
    {      id: "free-router-opencode", provider: "free-router-opencode", label: "Free Router · OpenCode",
      catalogo: "gratuitos", usable: true, marca: null, porque: null,
    },
  ];
  const opciones = opcionesDeModelos(superficies, {    claude: { provider: "x", fallback: false, models: [model("gpt-5", "GPT 5")] },
    codex: { provider: "x", fallback: false, models: [model("gpt-5", "GPT 5")] },
    opencode: { provider: "x", fallback: false,      models: [
        model("opencode/gpt-5", "GPT 5"),
        model("opencode-go/gpt-5", "GPT 5"),
      ],
    },
    "free-router-opencode": { provider: "x", fallback: false, models: [{ ...model("danil-free/reflection/beam-free", "GPT 5"), gratis: true }] },
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
      ["OpenCode", [["opencode", "opencode-go/gpt-5"]]],
      ["Router IA gratis", [["free-router-opencode", "danil-free/reflection/beam-free"]]],
    ],
  );
  assert.deepEqual(grupos.map((grupo) => grupo.logo), [
    "claude", "codex", "opencode", "danil",
  ]);
});

test("una superficie de pago no aparece cuando no está autenticada", () => {  const opciones = opcionesDeModelos(
    [{      id: "free-router-opencode", provider: "free-router-opencode", label: "Free Router · OpenCode",
      catalogo: "gratuitos", usable: true, marca: null, porque: null,
    }],
    {      "free-router-opencode": { provider: "x", fallback: false,        models: [
          model("opencode/claude-sonnet", "Claude Sonnet"),
          { ...model("danil-free/reflection/beam-free", "Free Model"), gratis: true },
          model("opencode-go/kimi", "Kimi"),
        ],
      },
    },
  );

  assert.deepEqual(opciones.map((opcion) => opcion.proveedor.label), ["Router IA gratis"]);
  assert.deepEqual(opciones.map((opcion) => opcion.model.id), ["danil-free/reflection/beam-free"]);
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

test("OpenCode es un solo proveedor: el login por Go deja fuera el saldo de Zen", () => {
  const surface: Superficie = { id: "opencode", provider: "opencode", label: "OpenCode", catalogo: "de_pago", usable: true, marca: null, porque: null };
  const options = opcionesDeModelos([surface], {
    "opencode": {
      provider: "opencode",
      fallback: false,
      models: [model("opencode-go/kimi", "Kimi"), model("opencode/deepseek-v4.1-flash", "DeepSeek")],
    },
  });
  // Zen (saldo) ya no se ofrece; Go conserva su id y su login.
  assert.deepEqual(options.map((option) => option.model.id), ["opencode-go/kimi"]);
  const groups = agruparModelos(options, "");
  assert.deepEqual(groups.map((grupo) => grupo.id), ["opencode"]);
  assert.equal(groups[0].label, "OpenCode");
  assert.equal(options[0].proveedor.id, "opencode-go");
  assert.equal(options[0].key, "opencode\u0000opencode-go/kimi");
  assert.deepEqual(agruparModelos(options, "OpenCode")[0].models, [options[0]]);
  assert.deepEqual(favoritosDeModelos(options, [options[0].key]), [options[0]]);
  // Abrir el selector con un modelo Go elegido lleva a una sección que existe
  // aunque el proveedor del catálogo se llame distinto.
  assert.equal(seccionDeModelo(groups, options[0].key), "opencode");
  assert.equal(seccionDeModelo(groups, "opencode\u0000no-existe"), null);
});

test("Free conserva la marca Danil en turnos observados y OpenCode pagado conserva su logo", () => {
  assert.equal(modelBrand("opencode", "danil-free/reflection/beam-free"), "danil");
  assert.equal(modelBrand("opencode", "opencode-go/kimi"), "opencode");
  assert.equal(modelBrand("opencode", "opencode/claude"), "opencode");
  assert.equal(modelBrand("opencode"), "opencode");
  // Una tarea de un motor anterior guarda `opencode-zen`: su marca es la de la fila nueva.
  assert.equal(modelBrand("opencode-zen", "opencode-go/kimi"), "opencode");
  assert.equal(modelBrand("free-router-opencode"), "danil");
  assert.equal(modelBrand("opencode", "legacy-free", { provider: "opencode", fallback: false, models: [{ ...model("legacy-free", "Free"), gratis: true }] }), "danil");
});

test("el proveedor gratuito sigue la lengua activa con la marca Danil", () => {
  const surface: Superficie = { id: "free-router-opencode", provider: "free-router-opencode", label: "Free", catalogo: "gratuitos", usable: true, marca: null, porque: null };
  for (const [language, label] of [["es", "Router IA gratis"], ["en", "Free AI Router"]]) {
    aplicarLenguaDeWorkspace(language);
    assert.deepEqual(proveedorDe(surface, model("danil-free/reflection/beam-free", "Beam")), { id: "opencode-free", label, logo: "danil" });
  }
  aplicarLenguaDeWorkspace("es");
});

import { availableDanilCredits, DANIL_CREDITS } from "../../src/features/chat/danil-credits.ts";

const response = (available: number) => ({
  account_id: 476,
  wallet: { balance_credits: 120, available_credits: available, status: "active" },
  execution_available: false,
});

test("Danil Credits conserva el ejecutor y el modelo que anuncia el engine", () => {
  const surface: Superficie = { id: "danil-credits", provider: "opencode", label: "Danil Credits", catalogo: "todo", usable: true, marca: null, porque: null };
  const options = opcionesDeModelos([surface], {
    "opencode": { provider: "opencode", fallback: false, models: [model(DANIL_CREDITS.modelId, "DeepSeek V4.1 Flash")] },
  });
  assert.equal(options.length, 1);
  assert.equal(options[0].agent, "opencode");
  assert.equal(options[0].model.id, DANIL_CREDITS.modelId);
  assert.equal(options[0].proveedor.id, "danil-credits");
  assert.equal(options[0].proveedor.logo, "danil");
  assert.equal(modelBrand("opencode", DANIL_CREDITS.modelId), "danil");
  assert.equal(agruparModelos(options, "Danil Credits")[0].id, "danil-credits");
  assert.equal(opcionesDeModelos([surface], {}).length, 0);
});

test("the account wallet uses available credit and preserves a verified zero", () => {
  assert.equal(availableDanilCredits(response(80)), 80);
  assert.equal(availableDanilCredits(response(0)), 0);
  assert.equal(availableDanilCredits({ ...response(80), account_id: "476" }), null);
  assert.equal(availableDanilCredits({ ...response(0), wallet: null }), null);
});

test("missing, failed or incompatible balance data never becomes zero", () => {
  for (const value of [undefined, null, {}, { balance: 99 },
    { ...response(1), account_id: "" }, response(NaN), response(Infinity),
    { ...response(1), execution_available: true },
    { ...response(1), wallet: { available_credits: "20", status: "active" } }]) {
    assert.equal(availableDanilCredits(value), null);
  }
  assert.equal(DANIL_CREDITS.modelId, "danil-credits/deepseek/deepseek-v4.1-flash");
  assert.equal(DANIL_CREDITS.upstreamModelId, "deepseek/deepseek-v4.1-flash");
});


import { webDanilCredits } from "../../src/web/danil-credits.ts";

test("the BFF reader uses the session-bound path and keeps loading, null, zero and errors distinct", async () => {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  let release!: (value: Response) => void;
  const pending = new Promise<Response>((resolve) => { release = resolve; });
  const source = webDanilCredits(
    { getToken: async () => "session-token", unauthorized: async () => false },
    "/alpha-api",
    async (input, init) => { calls.push({ url: String(input), init }); return pending; },
  );
  let settled = false;
  const reading = source.readBalance().finally(() => { settled = true; });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(settled, false, "a pending read stays pending instead of becoming zero");
  assert.equal(calls[0].url, "/alpha-api/api/credits/balance");
  assert.equal(calls[0].init?.method, "GET");
  assert.equal(calls[0].init?.cache, "no-store");
  assert.equal(new Headers(calls[0].init?.headers).get("Authorization"), "Bearer session-token");
  release(Response.json(response(0)));
  assert.equal(availableDanilCredits(await reading), 0);

  const read = (reply: Response) => webDanilCredits(
    { getToken: async () => "session-token", unauthorized: async () => false },
    "/alpha-api", async () => reply,
  ).readBalance();
  assert.equal(availableDanilCredits(await read(Response.json({ ...response(0), wallet: null }))), null);
  await assert.rejects(read(Response.json({ error: "forbidden" }, { status: 403 })));
  await assert.rejects(read(new Response("not-json")));
});


test("Credits no habilita BYOK ni Free y sus permisos no heredan otra superficie", () => {
  const credits: Superficie = { id: "danil-credits", provider: "opencode", label: "Danil Credits", catalogo: "todo", usable: true, marca: null, porque: null };
  const byok: Superficie = { ...credits, id: "opencode", label: "OpenCode", catalogo: "de_pago", usable: false };
  const free: Superficie = { ...credits, id: "opencode-free", label: "Free", catalogo: "gratuitos", usable: false };
  const catalog = { "opencode": { provider: "opencode", fallback: false, models: [
    model(DANIL_CREDITS.modelId, "DeepSeek"), model("byok/model", "Own key"),
    { ...model("danil-free/reflection/beam-free", "Beam"), gratis: true },
    model("danil-credits/other", "Unapproved"),
  ] } };
  const options = opcionesDeModelos([credits, byok, free], catalog);
  assert.deepEqual(options.filter((option) => option.usable).map((option) => [option.superficie, option.model.id]), [["danil-credits", DANIL_CREDITS.modelId]]);
  const inverse = opcionesDeModelos([{ ...credits, usable: false }, { ...byok, usable: true }, { ...free, usable: true }], catalog);
  assert.equal(inverse.find((option) => option.model.id === DANIL_CREDITS.modelId)?.usable, false);
  assert.ok(inverse.filter((option) => option.usable).every((option) => !option.model.id.startsWith("danil-credits/")));
});
