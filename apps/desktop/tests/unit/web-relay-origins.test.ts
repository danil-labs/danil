import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_RELAY_ORIGINS } from "@terminus/computers";
import { webConnectSources, webRelayOrigins } from "../../src/web/session-config.ts";

test("sin RELAY_ORIGIN la web usa la misma lista exacta que Desk", () => {
  assert.deepEqual(webRelayOrigins(undefined), [...DEFAULT_RELAY_ORIGINS]);
  assert.ok(webRelayOrigins(undefined).every(origin => !origin.includes("*")));
});

test("RELAY_ORIGIN acepta uno o varios orígenes exactos y rechaza comodines, rutas y credenciales", () => {
  assert.deepEqual(webRelayOrigins("connect.danil.ai"), ["wss://connect.danil.ai"]);
  assert.deepEqual(webRelayOrigins("wss://machines-session.danil.ai, https://connect.danil.ai"), ["wss://machines-session.danil.ai", "wss://connect.danil.ai"]);
  for (const bad of ["wss://*.danil.ai", "*.danil.ai", "wss://connect.danil.ai/x", "wss://u:p@connect.danil.ai", "ws://connect.danil.ai", ""]) {
    assert.throws(() => webRelayOrigins(bad), /RELAY_ORIGIN/, bad);
  }
});

test("la CSP solo abre el borde y los relays exactos", () => {
  const sources = webConnectSources("https://edge.danil.ai", webRelayOrigins(undefined));
  assert.equal(sources, "https://edge.danil.ai wss://machines-session.danil.ai wss://connect.danil.ai");
  assert.ok(!sources.includes("*"));
});
