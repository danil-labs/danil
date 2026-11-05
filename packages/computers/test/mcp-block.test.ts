import assert from "node:assert/strict";
import { test } from "node:test";
import { checkMcpBlock, relayArgs } from "../src/index.ts";

const kind = (block: unknown) => checkMcpBlock(typeof block === "string" ? block : JSON.stringify(block)).kind;

test("un valor escrito en env o headers cuenta, también números, booleanos y env que no es objeto", () => {
  assert.equal(kind({ mcpServers: { a: { command: "npx", env: { API_KEY: "abc" } } } }), "plain");
  assert.equal(kind({ a: { url: "https://x", headers: { Authorization: "Bearer abc" } } }), "plain");
  assert.equal(kind({ command: "npx", env: { MODE: "prod" } }), "plain");
  assert.equal(kind({ a: { command: "npx", env: { PIN: 123456 } } }), "plain");
  assert.equal(kind({ a: { command: "npx", env: { DEBUG: true } } }), "plain");
  assert.equal(kind({ a: { command: "npx", env: ["T=valor"] } }), "plain");
  assert.equal(kind({ a: { command: "npx", env: "T=valor" } }), "plain");
});

test("una URL con contraseña o parámetro sensible y un argumento con valor cuentan", () => {
  assert.equal(kind({ a: { url: "https://mcp.x.com/sse?api_key=abc" } }), "plain");
  assert.equal(kind({ a: { httpUrl: "https://user:pass@mcp.x.com/sse" } }), "plain");
  assert.equal(kind({ a: { command: "npx", args: ["-y", "pkg", "--token", "abc123"] } }), "plain");
  assert.equal(kind({ a: { command: "npx", args: ["--api-key=abc123"] } }), "plain");
  assert.equal(kind({ a: { command: "npx", args: ["postgres://app:pw@db/app"] } }), "plain");
});

test("marcadores, esquemas, vacíos y URLs limpias pasan", () => {
  assert.equal(kind({ mcpServers: { a: { command: "npx", env: { API_KEY: "${secret:env/*/API_KEY}" } } } }), "clean");
  assert.equal(kind({ a: { url: "https://x", headers: { Authorization: "Bearer ${secret:env/*/TOKEN}" } } }), "clean");
  assert.equal(kind({ a: { command: "npx", args: ["-y", "pkg", "--token", "${secret:env/*/T}"], env: {} } }), "clean");
  assert.equal(kind({ a: { command: "npx", env: { EMPTY: "", NONE: null } } }), "clean");
  assert.equal(kind({ a: { url: "https://mcp.x.com/sse?region=us" } }), "clean");
  assert.equal(kind("{ not json"), "invalid");
});

test("con claves repetidas viaja lo revisado", () => {
  const repeated = '{"a":{"command":"npx","env":{"T":"valor"},"env":{}}}';
  const out = relayArgs("add_mcp_servers", { bloque: repeated });
  assert.ok("args" in out);
  assert.equal((out.args as { bloque: string }).bloque, '{"a":{"command":"npx","env":{}}}', "the parsed block, not the text with the value");
  assert.deepEqual(relayArgs("list_projects", { a: 1 }), { args: { a: 1 } }, "other commands untouched");
});
