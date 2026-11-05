/** El relay simulado contesta como el real: un rechazo del motor llega como `error`, no deja la llamada colgada. */
import assert from "node:assert/strict";
import test from "node:test";
import { relay } from "../helpers/fake-relay.mjs";

function answer(fake, command) {
  return new Promise((resolve) => {
    const socket = new fake.Socket("wss://relay.test/v1/session");
    socket.onmessage = ({ data }) => {
      const m = JSON.parse(data);
      if (m.type === "result") resolve(m);
    };
    socket.onopen = () => socket.send(JSON.stringify({ type: "call", id: 1, command, args: {} }));
  });
}

test("a rejected answer of the engine arrives as an error, and a resolved one as its value", async () => {
  const fake = relay({ table: { cut: () => Promise.reject({ code: "io", detail: "io" }), ok: () => Promise.resolve(7) } });
  const cut = await Promise.race([answer(fake, "cut"), new Promise((r) => setTimeout(() => r("hung"), 1000))]);
  assert.deepEqual(cut, { type: "result", id: 1, error: { code: "io", detail: "io" } });
  const ok = await answer(fake, "ok");
  assert.equal(ok.value, 7);
});
