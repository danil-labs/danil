/**
 * El fondo del chat contra un motor simulado por el `invoke` real
 * (`__TAURI_INTERNALS__`): un motor sin `set_chat_background` no pierde la
 * imagen al cambiar el velo ni recibe una ruta sin importar, y un workspace sin
 * fondo propio no hereda el del workspace anterior.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

type Call = { command: string; args: Record<string, unknown> | undefined };

const stored = new Map<string, string>();
const g = globalThis as Record<string, unknown>;
g.localStorage = {
  getItem: (k: string) => stored.get(k) ?? null,
  setItem: (k: string, v: string) => void stored.set(k, v),
  removeItem: (k: string) => void stored.delete(k),
};
g.document = { documentElement: { style: { setProperty() {} } } };

let replies: Record<string, (args: Record<string, unknown> | undefined) => unknown> = {};
const calls: Call[] = [];
g.window = {
  __TAURI_INTERNALS__: {
    invoke: async (command: string, args?: Record<string, unknown>) => {
      calls.push({ command, args });
      const reply = replies[command];
      if (!reply) throw { what: { clave: "shell.service.command" }, detail: "command" };
      return reply(args);
    },
  },
};

const engine = () => import("../../src/lib/chat-background-engine.ts");
const store = () => import("../../src/lib/chat-background-store.ts");

test("un motor anterior no borra la imagen ni recibe una ruta cuando solo cambian el patrón o el velo", async () => {
  replies = { choose_chat_background: () => null };
  calls.length = 0;
  const s = await store();
  s.ponerFondoPropio("/datos/fondo.png");
  const { guardarFondo } = await engine();
  await guardarFondo();
  s.elegirVeloDeFondo(0.5);
  await guardarFondo();
  s.elegirFondoDeChat("neutro");
  await guardarFondo();
  const borrados = calls.filter((c) => c.command === "choose_chat_background" && !c.args?.path);
  assert.deepEqual(borrados, [], "ningún respaldo quita la imagen");
  assert.ok(
    !calls.some((c) => c.command === "choose_chat_background" && c.args?.path),
    "una ruta solo viaja justo después de importarla",
  );
});

test("un workspace sin fondo propio vuelve al patrón de la app, no al del workspace anterior", async () => {
  const s = await store();
  s.ponerFondoPropio(null);
  s.elegirFondoDeChat("neutro");
  s.elegirVeloDeFondo(0.7);
  s.elegirVeloDePaneles(0.25);
  const { cargarFondoDelWorkspace } = await engine();

  replies = { chat_background: () => ({ preset: null, data_url: "data:image/png;base64,AAAA", veil: { chat: 0.3, tabs: null, panels: 0.9 } }) };
  await cargarFondoDelWorkspace("w1");
  assert.equal(s.fondoDeChat(), "propia");
  assert.equal(s.veloDeFondo(), 0.3);
  assert.equal(s.veloDePaneles(), 0.9);

  replies = { chat_background: () => null };
  await cargarFondoDelWorkspace("w1");
  assert.equal(s.imagenDelWorkspace(), null);
  assert.equal(s.fondoDeChat(), "neutro", "vuelve el patrón de la app");

  replies = { chat_background: () => ({ preset: null, data_url: "data:image/png;base64,AAAA", veil: { chat: 0.3, tabs: null, panels: 0.9 } }) };
  await cargarFondoDelWorkspace("w1");
  replies = { chat_background: () => ({ preset: null, data_url: null, veil: null }) };
  await cargarFondoDelWorkspace("w2");
  assert.equal(s.imagenDelWorkspace(), null, "todo nulo es no tener fondo propio");
  assert.equal(s.fondoDeChat(), "neutro");
});

/* Un lienzo mínimo: `shrink-image.ts` decodifica y codifica con las APIs del navegador. */
g.createImageBitmap = async () => ({ width: 4000, height: 3000, close() {} });
g.OffscreenCanvas = class {
  width: number;
  height: number;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
  getContext() {
    return { drawImage() {} };
  }
  async convertToBlob({ type }: { type: string }) {
    return new Blob([new Uint8Array(64)], { type });
  }
};

test("la imagen elegida se reduce y viaja como data: en set_chat_background, nunca como ruta", async () => {
  replies = { set_chat_background: (args) => ({ preset: null, data_url: args?.dataUrl, veil: null }) };
  calls.length = 0;
  const s = await store();
  s.setWorkspaceAbierto("w1");
  const { elegirFondoPropio } = await engine();
  assert.equal(await elegirFondoPropio(new Blob([new Uint8Array(10)], { type: "image/jpeg" })), "propia");
  const set = calls.find((c) => c.command === "set_chat_background");
  assert.match(String(set?.args?.dataUrl), /^data:image\/webp;base64,/);
  assert.equal(set?.args?.path, undefined);
  assert.ok(!calls.some((c) => c.command === "import_chat_background"));
  assert.match(String(s.imagenDelWorkspace()), /^data:image\/webp/);
});

test("en la web la imagen de la cuenta manda, y con la máquina apagada se ve con los velos de la cuenta", async () => {
  const { setCapabilities, capabilities } = await import("../../../../packages/host/src/platform.ts");
  const antes = capabilities();
  const subidas: string[] = [];
  const CUENTA = "data:image/webp;base64,Q1VFTlRB";
  setCapabilities({
    ...antes,
    accountAssets: {
      read: async (w) => (w === "w1" ? CUENTA : undefined),
      setting: async () => ({ preset: null, veil: { chat: 0.25 } }),
      put: async (w, kind) => (subidas.push(`${w}/${kind}`), true),
      remove: async () => true,
      forget() {},
    },
  });
  try {
    const s = await store();
    const { cargarFondoDelWorkspace, elegirFondoPropio } = await engine();
    replies = { chat_background: () => ({ preset: null, data_url: null, image_url: "https://computers.test/v1/workspaces/w1/background?v=x", veil: { chat: 0.6 } }) };
    await cargarFondoDelWorkspace("w1");
    assert.equal(s.imagenDelWorkspace(), CUENTA);
    assert.equal(s.fondoDeChat(), "propia");
    assert.equal(s.veloDeFondo(), 0.6, "los velos del motor encendido");

    replies = {};
    await cargarFondoDelWorkspace("w1");
    assert.equal(s.imagenDelWorkspace(), CUENTA, "la máquina apagada no quita el fondo de la cuenta");
    assert.equal(s.veloDeFondo(), 0.25);

    calls.length = 0;
    replies = { set_chat_background: () => null };
    await elegirFondoPropio(new Blob([new Uint8Array(10)], { type: "image/png" }));
    assert.deepEqual(subidas, ["w1/background"], "la imagen va a la cuenta");
    await new Promise((r) => setTimeout(r, 0));
    assert.ok(calls.every((c) => !c.args?.dataUrl), "al motor solo el patrón y los velos");
  } finally {
    setCapabilities(antes);
  }
});

test("cambiar de workspace reinicia velos nulos de pestañas y paneles y cancela el guardado diferido pendiente", async () => {
  const s = await store();
  const { cargarFondoDelWorkspace, guardarVelos } = await engine();
  const { VELO_DE_PESTANAS, VELO_DE_PANELES } = await import("../../src/lib/chat-background.ts");

  replies = {
    chat_background: () => ({ preset: "neutro", data_url: null, veil: { chat: 0.4, tabs: 0.55, panels: 0.85 } }),
    set_chat_background: () => null,
  };
  await cargarFondoDelWorkspace("w1");
  assert.equal(s.veloDePestanas(), 0.55);
  assert.equal(s.veloDePaneles(), 0.85);

  // Dispara un guardado diferido de velos en w1 y cambia enseguida a w2 (antes de los 400 ms).
  calls.length = 0;
  s.elegirVeloDeFondo(0.2);
  guardarVelos();

  replies = {
    chat_background: () => ({ preset: "neutro", data_url: null, veil: { chat: 0.5, tabs: null, panels: null } }),
    set_chat_background: () => null,
  };
  await cargarFondoDelWorkspace("w2");
  assert.equal(s.veloDeFondo(), 0.5);
  assert.equal(s.veloDePestanas(), VELO_DE_PESTANAS, "un workspace sin velo de pestañas no hereda el del anterior");
  assert.equal(s.veloDePaneles(), VELO_DE_PANELES, "un workspace sin velo de paneles no hereda el del anterior");

  await new Promise((r) => setTimeout(r, 460));
  assert.equal(
    calls.filter((c) => c.command === "set_chat_background").length,
    0,
    "el guardado diferido del workspace anterior no se escribe sobre el workspace nuevo",
  );

  // Sin workspace activo no se consulta `chat_background` y se limpia la imagen en memoria.
  calls.length = 0;
  s.setImagenDelWorkspace("data:image/png;base64,AAAA");
  await cargarFondoDelWorkspace(null);
  assert.equal(s.imagenDelWorkspace(), null);
  assert.equal(calls.filter((c) => c.command === "chat_background").length, 0);
});
