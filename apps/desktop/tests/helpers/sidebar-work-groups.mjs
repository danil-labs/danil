import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import solid from "vite-plugin-solid";

const run = promisify(execFile);
const session = `sidebar-work-groups-${process.pid}`;
const browser = async (...args) => {
  const { stdout } = await run("agent-browser", ["--session", session, "--args", "--no-sandbox", "--json", ...args], { timeout: 45_000 });
  const result = JSON.parse(stdout);
  assert.equal(result.success, true, JSON.stringify(result.error));
  return result.data?.result;
};
const server = await createServer({
  configFile: false,
  root: fileURLToPath(new URL("../../", import.meta.url)),
  plugins: [solid()],
  server: { host: "127.0.0.1", port: 0 },
  optimizeDeps: { noDiscovery: true },
});
const snapshot = () => browser("eval", `({
  calls: workGrouping.calls,
  rows: [...document.querySelectorAll('[data-sesion]')].map(e => e.getAttribute('data-sesion')),
  groups: Object.fromEntries([...document.querySelectorAll('[data-sidebar-group]')].map(g => [
    g.getAttribute('data-sidebar-group'), [...g.querySelectorAll('[data-sesion]')].map(e => e.getAttribute('data-sesion')),
  ])),
})`);
try {
  await server.listen();
  const address = server.httpServer.address();
  await browser("open", `http://127.0.0.1:${address.port}/tests/helpers/sidebar-work-groups.html`);
  await browser("wait", "--load", "networkidle");
  await browser("wait", "--fn", "!!window.workGrouping && document.querySelectorAll('[data-sesion]').length === 5");
  const initial = await snapshot();
  assert.equal(initial.calls.length, 2, "one local and one remote read per folder");
  assert.deepEqual(new Set(initial.rows), new Set(["review", "vm~review", "vm~ready", "vm~draft", "vm~child"]));
  assert.deepEqual(new Set(initial.calls[0].priority), new Set(initial.rows), "interests use the fleet's encoded ids");
  for (const group of ["status", "none", "agent", "machine", "folder", "status"]) {
    await browser("eval", `workGrouping.group(${JSON.stringify(group)})`);
    const current = await snapshot();
    assert.equal(current.calls.length, initial.calls.length, `${group}: remount does not read Git`);
    assert.deepEqual(new Set(current.rows), new Set(initial.rows));
    if (group === "status") {
      assert.deepEqual(current.groups.draft, ["vm~draft"]);
      assert.deepEqual(current.groups.review, ["vm~review"], "remote without workspace uses the real aggregate");
      assert.deepEqual(new Set(current.groups.ready), new Set(["review", "vm~ready", "vm~child"]), "shared parent stays on its own machine");
      assert.equal(current.groups.unknown, undefined);
    }
  }
  await browser("eval", "workGrouping.merge()");
  await browser("wait", "--fn", "document.querySelector('[data-sidebar-group=ready] [data-sesion=\"vm~review\"]') !== null");
  const updated = await snapshot();
  assert.ok(updated.calls.length > initial.calls.length, "a changed task revision still refreshes Git");
  assert.equal(updated.groups.review, undefined);
  await browser("eval", "workGrouping.dispose()");
  process.stdout.write("PASS: mounted Sidebar/Sessions keep remote work groups, encoded ids and stable Git reads across six regroupings; task changes still refresh.\n");
} finally {
  await browser("close").catch(() => {});
  await server.close();
}
