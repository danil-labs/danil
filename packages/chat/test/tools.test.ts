import assert from "node:assert/strict";
import { test } from "node:test";
import { mcpCallFromName, readableToolName, toolSource } from "../src/tools.ts";

test("el nombre de un MCP se parte en servidor y herramienta, con las dos formas", () => {
  assert.deepEqual(mcpCallFromName("mcp__github__create_issue"), { server: "github", tool: "create_issue" });
  assert.deepEqual(mcpCallFromName("figma·get_file"), { server: "figma", tool: "get_file" });
});

test("lo que no es de un MCP no tiene servidor", () => {
  assert.equal(mcpCallFromName("Read"), undefined);
  assert.equal(mcpCallFromName("mcp__solo"), undefined);
  assert.equal(mcpCallFromName(""), undefined);
});

test("el nombre de la tool se lee sin guiones bajos y conserva camelCase separado", () => {
  assert.equal(readableToolName("create_issue"), "create issue");
  assert.equal(readableToolName("getFile"), "get file");
  assert.equal(readableToolName("search-jira"), "search jira");
  assert.equal(readableToolName("read"), "read");
});

test("la fila sabe de qué servicio salió la herramienta", () => {
  assert.deepEqual(toolSource("mcp__jira__search"), { server: "jira", tool: "search", mark: "atlassian", label: "Atlassian" });
  assert.deepEqual(toolSource("mcp__supabase__query"), { server: "supabase", tool: "query", mark: "supabase", label: "Supabase" });
});

test("un servidor desconocido conserva su clave y no pide marca", () => {
  assert.deepEqual(toolSource("mcp__acme-analytics__query"), { server: "acme-analytics", tool: "query", mark: null, label: "acme-analytics" });
});

test("el evento puede traer el servidor ya separado y no se vuelve a partir", () => {
  assert.equal(toolSource("tool_use", { server: "figma", tool: "get_file" })?.mark, "figma");
});

test("una herramienta local no tiene origen", () => {
  assert.equal(toolSource("Bash"), null);
});
