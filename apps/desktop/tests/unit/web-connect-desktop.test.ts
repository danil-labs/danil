/** The device page hands the desktop window its session only with valid fields and only to 127.0.0.1. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { desktopHandoff, finishDesktop } from "../../src/web/connect/desktop.ts";

const challenge = "c".repeat(43);
const state = "s".repeat(16);

test("the window's fields are read only when all three have their shape", () => {
  assert.deepEqual(desktopHandoff(`?code=ABCD-EFGH&challenge=${challenge}&state=${state}&port=49152`), { challenge, state, port: "49152" });
  assert.equal(desktopHandoff(`?challenge=${challenge}&state=${state}&port=80`), null);
  assert.equal(desktopHandoff(`?challenge=short&state=${state}&port=49152`), null);
  assert.equal(desktopHandoff(`?code=ABCD-EFGH`), null);
});

test("the entry's answer is followed only to the window's own loopback port", async () => {
  const handoff = { challenge, state, port: "49152" };
  const sent: { url: string; body: string }[] = [];
  const answer = (location: string) => (async (url: RequestInfo | URL, init?: RequestInit) => {
    sent.push({ url: String(url), body: String(init?.body) });
    return Response.json({ location });
  }) as typeof fetch;
  assert.equal(await finishDesktop(handoff, "https://alfa-app.danil.ai", answer("http://127.0.0.1:49152/callback?code=x&state=s")), "http://127.0.0.1:49152/callback?code=x&state=s");
  assert.equal(sent[0].url, "https://alfa-app.danil.ai/auth/desktop/approve");
  assert.deepEqual(JSON.parse(sent[0].body), handoff);
  assert.equal(await finishDesktop(handoff, "https://alfa-app.danil.ai", answer("https://evil.example/callback")), null);
  assert.equal(await finishDesktop(handoff, "https://alfa-app.danil.ai", answer("http://127.0.0.1:49153/callback")), null);
  const refused = (async () => Response.json({ error: "no_session" }, { status: 401 })) as typeof fetch;
  assert.equal(await finishDesktop(handoff, "https://alfa-app.danil.ai", refused), null);
});
