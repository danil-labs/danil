import test from "node:test";
import assert from "node:assert/strict";
import worker, { redirectTarget } from "./worker.mjs";

test("every /terminus path goes to the same alfa path without the prefix, query included", () => {
  for (const [from, to] of [
    ["/terminus", "/"],
    ["/terminus/", "/"],
    ["/terminus/connect?code=WDJB-MJHT", "/connect?code=WDJB-MJHT"],
    ["/terminus/m/", "/m/"],
    ["/terminus/m/inbox?demo=1", "/m/inbox?demo=1"],
    ["/terminus/install.sh", "/install.sh"],
    ["/terminus/mcp/mcp-light.svg", "/mcp/mcp-light.svg"],
    ["/terminusx", "/terminusx"],
  ]) assert.equal(redirectTarget(`https://app.danil.ai${from}`), `https://alfa-app.danil.ai${to}`, from);
});

test("the target host never changes, whatever the path", () => {
  for (const from of ["/terminus//evil.example/x", "/terminus/%2F%2Fevil.example", "/terminus/\\evil.example", "/terminus?next=https%3A%2F%2Fevil.example"]) {
    assert.equal(new URL(redirectTarget(`https://app.danil.ai${from}`)).host, "alfa-app.danil.ai", from);
  }
  assert.equal(redirectTarget("https://app.danil.ai/terminus//evil.example/x"), "https://alfa-app.danil.ai/evil.example/x");
});

test("answers 308 without store, for any method", async () => {
  for (const method of ["GET", "HEAD", "POST"]) {
    const response = await worker.fetch(new Request("https://app.danil.ai/terminus/connect?code=A", { method }));
    assert.equal(response.status, 308);
    assert.equal(response.headers.get("Location"), "https://alfa-app.danil.ai/connect?code=A");
    assert.equal(response.headers.get("Cache-Control"), "no-store");
  }
});
