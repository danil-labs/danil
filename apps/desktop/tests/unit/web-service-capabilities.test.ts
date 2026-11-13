import assert from "node:assert/strict";
import test from "node:test";
import { capabilityList } from "@terminus/computers";
import { readCapabilities, supports } from "../../src/web/service-capabilities.ts";
import { PlatformSessionError } from "../../src/web/platform-session.ts";

test("capabilities reads its versioned route and ignores unknown response fields", async () => {
  const asked: string[] = [];
  const snapshot = await readCapabilities({ call: async path => {
    asked.push(path);
    return Response.json({ contract: "mvp-v1", items: [
      { name: "machines", version: 1, status: "available", routes: ["GET /v1/machines"], future: { enabled: true } },
      { name: "future.service", version: 3, status: "future-status" },
    ], next_cursor: null, future: ["ignored"] });
  } });
  assert.deepEqual(asked, ["capabilities"]);
  assert.ok(snapshot);
  assert.equal(supports(snapshot, "machines"), true);
  assert.equal(supports(snapshot, "future.service"), false);
});

for (const status of [404, 501]) {
  test(`HTTP ${status} means the capability endpoint has not arrived`, async () => {
    const snapshot = await readCapabilities({ call: async () => new Response(null, { status }) });
    assert.equal(snapshot, null);
    assert.equal(supports(snapshot, "machines"), true, "the caller may probe the old deployment's API");
  });
  test(`a transport rejection with HTTP ${status} has the same compatibility result`, async () => {
    const snapshot = await readCapabilities({ call: async () => { throw new PlatformSessionError(status, null); } });
    assert.equal(snapshot, null);
  });
}

test("a present snapshot disables omitted capabilities instead of guessing support", () => {
  const snapshot = capabilityList({ contract: "mvp-v1", items: [] });
  assert.equal(supports(snapshot, "machines"), false);
  assert.equal(supports(null, "machines"), true);
});

for (const [version, status, expected] of [
  [1, "available", true], [1, "degraded", false], [1, "unavailable", false],
  [1, "future-status", false], [2, "available", false],
] as const) test(`capability v${version} ${status} has support ${expected}`, () => {
  const snapshot = capabilityList({ contract: "mvp-v1", items: [{ name: "machines", version, status }] });
  assert.equal(supports(snapshot, "machines"), expected);
});

for (const status of [401, 403, 429, 503]) test(`HTTP ${status} is a failure, not an absent capability endpoint`, async () => {
  await assert.rejects(readCapabilities({ call: async () => new Response(null, { status, headers: { "Retry-After": "7" } }) }),
    error => error instanceof PlatformSessionError && error.status === status && error.retryAfter === "7");
});

test("transport and malformed-response failures propagate without a legacy fallback", async () => {
  const cause = new Error("network unavailable");
  await assert.rejects(readCapabilities({ call: async () => { throw cause; } }), error => error === cause);
  await assert.rejects(readCapabilities({ call: async () => Response.json({ contract: "mvp-v1" }) }));
});

test("one malformed item is ignored instead of discarding the whole list (unknown names and forms are ignored)", async () => {
  const snapshot = await readCapabilities({ call: async () => Response.json({ contract: "mvp-v1", items: [
    { name: "machines", version: 0, status: "available" }, { name: "workspaces", version: 1, status: "available" }, "noise", null,
  ] }) });
  assert.equal(supports(snapshot, "workspaces"), true);
  assert.equal(supports(snapshot, "machines"), false);
});
