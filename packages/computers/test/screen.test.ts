import assert from "node:assert/strict";
import { test } from "node:test";
import { SCREEN_SUBPROTOCOL, createScreenAccess, screenEnd, screenProtocols, screenUrl } from "../src/index.ts";

test("el visor va a /screen del mismo relay, con el token en el subprotocolo", () => {
  assert.equal(screenUrl("computers.test", "c_1"), "wss://computers.test/v1/computers/c_1/screen");
  assert.equal(screenUrl("https://computers-dev.danil.ai/", "a b"), "wss://computers-dev.danil.ai/v1/computers/a%20b/screen");
  assert.deepEqual(screenProtocols("t0k"), [SCREEN_SUBPROTOCOL, "bearer.t0k"]);
});

test("los cierres del relay dicen por qué no hay pantalla", () => {
  assert.equal(screenEnd(4010), "offline");
  assert.equal(screenEnd(4011), "unavailable");
  assert.equal(screenEnd(4013), "busy");
  assert.equal(screenEnd(1000), "ended");
  assert.equal(screenEnd(1006), "ended");
});

function access() {
  const known = new Set(["vm", "own", "self"]);
  const opened: { url: string; protocols: string[]; closes: number }[] = [];
  let finish: ((token: string) => void) | null = null;
  const screens = createScreenAccess({
    endpoint: "https://relay.test",
    knows: (id) => known.has(id),
    getToken: () => new Promise((resolve) => { finish = resolve; }),
    socket: (url, protocols) => {
      const entry = { url, protocols, closes: 0 };
      opened.push(entry);
      return Object.assign(new EventTarget(), { close() { entry.closes++; } }) as unknown as WebSocket;
    },
  });
  return { screens, known, opened, token: () => finish?.("account-token") };
}

test("cada pantalla apunta a su máquina registrada, incluida la propia y la local", async () => {
  const f = access();
  assert.equal(f.screens.opener("local"), null);
  assert.equal(f.screens.opener("stranger"), null);
  for (const id of ["vm", "own", "self"]) {
    const pending = f.screens.opener(id)!();
    f.token();
    await pending;
    assert.equal(f.opened.at(-1)?.url, `wss://relay.test/v1/computers/${id}/screen`);
    assert.deepEqual(f.opened.at(-1)?.protocols, ["danil.screen.v1", "bearer.account-token"]);
  }
  f.screens.close();
  assert.ok(f.opened.every((socket) => socket.closes === 1));
});

test("cambiar de cuenta cierra las pantallas y revoca los callbacks anteriores", async () => {
  const f = access();
  const open = f.screens.opener("vm")!;
  const pending = open();
  f.token();
  await pending;
  f.screens.close();
  assert.equal(f.opened[0].closes, 1);
  assert.equal(f.screens.opener("vm"), null);
  await assert.rejects(open(), /screen_unavailable/);
  assert.equal(f.opened.length, 1);
});

test("si cambia la cuenta durante el token no abre una pantalla con la sesión siguiente", async () => {
  const f = access();
  const pending = f.screens.opener("vm")!();
  f.screens.close();
  f.token();
  await assert.rejects(pending, /screen_unavailable/);
  assert.equal(f.opened.length, 0);
});

test("quitar una máquina revoca también una apertura pendiente", async () => {
  const f = access();
  const pending = f.screens.opener("own")!();
  f.known.delete("own");
  f.token();
  await assert.rejects(pending, /screen_unavailable/);
  assert.equal(f.opened.length, 0);
});
