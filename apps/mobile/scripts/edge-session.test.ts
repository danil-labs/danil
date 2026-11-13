/**
 * La sesión del teléfono en la web (`edgeSession.ts`): solo un 401 es «sin sesión»; un fallo de
 * identity se reintenta solo sin abrir otro login, y salir solo es salir cuando el borde lo confirma.
 *
 *   node --test apps/mobile/scripts/edge-session.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { EdgeError, type EdgePerson } from "@terminus/computers";
import { edgeSession } from "../src/lib/edgeSession.ts";

const ANA: EdgePerson = { id: "user_A", name: "Ana", email: null, workspace: "11", organizations: [] };

/** Un reloj a mano: `tick()` corre lo programado y dice cuánto se esperó. */
function clock() {
  const queue: { run: () => void; ms: number }[] = [];
  return {
    schedule: (run: () => void, ms: number) => {
      const item = { run, ms };
      queue.push(item);
      return () => void queue.splice(queue.indexOf(item), 1);
    },
    pending: () => queue.map((q) => q.ms),
    async tick() {
      const item = queue.shift();
      item?.run();
      await new Promise((r) => setTimeout(r, 0));
      return item?.ms;
    },
  };
}
const settle = () => new Promise((r) => setTimeout(r, 0));

test("solo un 401 es «sin sesión»", async () => {
  const s = edgeSession({ me: async () => { throw new EdgeError(401, null); }, logout: async () => {} }, { schedule: clock().schedule });
  await s.load();
  assert.equal(s.state().kind, "signed_out");
});

test("un 503, un timeout o la red caída no abren otro login: se reintenta solo hasta que identity contesta", async () => {
  const c = clock();
  const answers: (() => EdgePerson)[] = [
    () => { throw new EdgeError(503, null); },
    () => { throw new DOMException("timeout", "TimeoutError"); },
    () => ANA,
  ];
  const s = edgeSession({ me: async () => answers.shift()!(), logout: async () => {} }, { schedule: c.schedule });
  await s.load();
  assert.equal(s.state().kind, "unavailable");
  assert.equal(await c.tick(), 2_000);
  assert.equal(s.state().kind, "unavailable");
  assert.equal(await c.tick(), 4_000, "la espera crece");
  assert.deepEqual(s.state(), { kind: "signed_in", person: ANA });
  assert.deepEqual(c.pending(), [], "con la persona ya no se reintenta");
});

test("salir confirmado deja la sesión cerrada", async () => {
  let outs = 0;
  const s = edgeSession({ me: async () => ANA, logout: async () => void outs++ }, { schedule: clock().schedule });
  await s.load();
  assert.equal(await s.signOut(), true);
  assert.equal(outs, 1);
  assert.equal(s.state().kind, "signed_out");
});

test("un logout que el borde no confirma no se presenta como hecho: la persona sigue dentro y puede reintentar", async () => {
  let fail = true;
  const s = edgeSession({ me: async () => ANA, logout: async () => { if (fail) throw new EdgeError(503, null); } }, { schedule: clock().schedule });
  await s.load();
  assert.equal(await s.signOut(), false);
  assert.deepEqual(s.state(), { kind: "signed_in", person: ANA });
  fail = false;
  assert.equal(await s.signOut(), true);
  assert.equal(s.state().kind, "signed_out");
});

test("un logout que contesta 401 ya no tenía sesión: queda cerrada", async () => {
  const s = edgeSession({ me: async () => ANA, logout: async () => { throw new EdgeError(401, null); } }, { schedule: clock().schedule });
  await s.load();
  assert.equal(await s.signOut(), true);
  assert.equal(s.state().kind, "signed_out");
});

test("revisar tras un rechazo: 401 cierra, una caída conserva la persona", async () => {
  let answer: () => EdgePerson = () => ANA;
  const s = edgeSession({ me: async () => answer(), logout: async () => {} }, { schedule: clock().schedule });
  await s.load();
  answer = () => { throw new TypeError("Failed to fetch"); };
  assert.equal(await s.recheck(), true);
  assert.equal(s.state().kind, "signed_in");
  answer = () => { throw new EdgeError(401, null); };
  assert.equal(await s.recheck(), false);
  assert.equal(s.state().kind, "signed_out");
});

test("avisa cada cambio y deja de reintentar al cerrarse", async () => {
  const c = clock();
  const seen: string[] = [];
  const s = edgeSession({ me: async () => { throw new EdgeError(502, null); }, logout: async () => {} }, { schedule: c.schedule });
  s.subscribe(() => seen.push(s.state().kind));
  await s.load();
  await settle();
  assert.deepEqual(seen, ["unavailable"]);
  s.stop();
  assert.deepEqual(c.pending(), []);
});

test("varias revisiones a la vez son una sola pregunta a identity", async () => {
  let asked = 0;
  let release: () => void = () => {};
  const s = edgeSession({ me: async () => { asked++; await new Promise<void>((r) => (release = r)); throw new EdgeError(401, null); }, logout: async () => {} }, { schedule: clock().schedule });
  const all = Promise.all([s.recheck(), s.recheck(), s.recheck()]);
  release();
  assert.deepEqual(await all, [false, false, false]);
  assert.equal(asked, 1);
});

test("ya sin sesión, otra confirmación no vuelve a avisar", async () => {
  const s = edgeSession({ me: async () => { throw new EdgeError(401, null); }, logout: async () => {} }, { schedule: clock().schedule });
  let changes = 0;
  s.subscribe(() => changes++);
  await s.load();
  await s.recheck();
  await s.recheck();
  assert.equal(changes, 1);
});

test("una lectura de identity en vuelo que llega después del logout confirmado no revive la sesión", async () => {
  const waiting: (() => void)[] = [];
  let calls = 0;
  const s = edgeSession(
    {
      me: async () => {
        calls++;
        if (calls === 1) return ANA;
        await new Promise<void>((r) => waiting.push(r));
        return ANA;
      },
      logout: async () => {},
    },
    { schedule: clock().schedule },
  );
  await s.load();
  const late = s.recheck();
  const relate = s.load();
  assert.equal(await s.signOut(), true);
  for (const r of waiting) r();
  await late;
  await relate;
  assert.equal(s.state().kind, "signed_out");
});
