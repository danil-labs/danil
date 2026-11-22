import assert from "node:assert/strict";
import { test } from "node:test";
import { commandSource, mcpCallFromName, readableToolName, toolSource } from "../src/lib/chat/tools.ts";

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

test("un comando de un CLI conocido trae la marca de su servicio", () => {
  const mark = (cmd: string) => commandSource(cmd)?.mark ?? null;
  assert.deepEqual(commandSource('"$DANIL_CLI" task show qx1q8d3m --json'), { program: "$DANIL_CLI", mark: "danil", label: "Danil" });
  assert.equal(mark("gh pr list"), "github");
  assert.equal(mark("glab mr list"), "gitlab");
  assert.equal(mark("wrangler deploy"), "cloudflare");
  assert.equal(mark("gcloud run deploy"), "googlecloud");
  assert.equal(mark("gsutil ls"), "googlecloud");
  assert.equal(mark("cd /repo && git status"), "git");
  assert.equal(mark("psql -c 'select 1'"), "postgresql");
  assert.equal(mark("npx playwright test"), "playwright");
  assert.equal(mark("pnpm exec wrangler deploy"), "cloudflare");
  assert.equal(mark("cd /x && gh pr view 12"), "github");
  assert.equal(mark("bash -lc 'gh pr view 12'"), "github");
  assert.equal(mark("/usr/local/bin/gh api x"), "github");
  assert.equal(mark("env FOO=1 supabase db push"), "supabase");
});

test("un programa sin marca sigue con el icono de terminal", () => {
  for (const cmd of ["aws-vault exec x", "ls -la", "npm test", "cargo build", "pnpm install", "", null]) assert.equal(commandSource(cmd), null, String(cmd));
});
