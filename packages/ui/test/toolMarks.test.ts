import assert from "node:assert/strict";
import { test } from "node:test";
import { TOOL_LABELS, commandMarkId, commandName, toolLabel, toolMarkId, toolMonogram } from "../src/toolMarkNames.ts";
import { TOOL_MARKS } from "../src/toolMarksData.ts";

test("cada marca tiene nombre, caja y al menos un trazo con relleno o color del texto", () => {
  for (const [id, mark] of Object.entries(TOOL_MARKS)) {
    assert.ok((TOOL_LABELS[id as keyof typeof TOOL_LABELS] ?? "").length > 0, `${id} no tiene nombre`);
    assert.match(mark.viewBox, /^0 0 [\d.]+ [\d.]+$/, `${id} no tiene caja`);
    assert.ok(mark.paths.length > 0, `${id} no tiene trazos`);
    for (const path of mark.paths) {
      assert.ok(path.d.length > 10, `${id} trae un trazo vacío`);
      assert.ok(path.fill === null || /^#[0-9a-f]{6}$/i.test(path.fill), `${id} trae un color que no es hex`);
    }
  }
});

test("cada nombre conocido tiene su clave de alias", () => {
  for (const id of Object.keys(TOOL_LABELS)) assert.equal(toolMarkId(id), id, `${id} no se resuelve a sí mismo`);
});

test("la marca con variante oscura trae los mismos trazos y tintas propias", () => {
  const danil = TOOL_MARKS.danil;
  assert.ok(danil.dark, "Danil no tiene variante oscura");
  assert.equal(danil.dark!.length, danil.paths.length);
  // La tinta de la marca es suya en los dos temas; no hereda el color del texto.
  for (const trazo of [...danil.paths, ...danil.dark!]) assert.match(trazo.fill ?? "", /^#[0-9a-f]{6}$/i);
  assert.deepEqual(
    danil.paths.map((trazo) => trazo.d),
    danil.dark!.map((trazo) => trazo.d),
  );
});

test("la marca sale del nombre del servidor, con sufijos y alias", () => {
  assert.equal(toolMarkId("github"), "github");
  assert.equal(toolMarkId("GitHub"), "github");
  assert.equal(toolMarkId("figma-escritorio"), "figma");
  assert.equal(toolMarkId("figma_mcp"), "figma");
  assert.equal(toolMarkId("jira"), "atlassian");
  assert.equal(toolMarkId("Confluence"), "atlassian");
  assert.equal(toolMarkId("pg"), "postgresql");
  assert.equal(toolMarkId("computer-use"), "cua");
  assert.equal(toolMarkId("github.com"), "github");
  // El programa `git` es Git, no GitHub.
  assert.equal(toolMarkId("git"), "git");
  // El MCP `workos` y el CLI `workos` llevan la marca de WorkOS.
  assert.equal(toolMarkId("workos"), "workos");
  assert.equal(toolMarkId("workos-mcp"), "workos");
  assert.equal(commandMarkId("workos"), "workos");
});

test("un servidor que no conocemos no lleva marca, y no se inventa una", () => {
  assert.equal(toolMarkId("acme-analytics"), null);
  assert.equal(toolMarkId(""), null);
  assert.equal(toolMarkId(null), null);
  assert.equal(toolMarkId(undefined), null);
  // El sufijo se quita una vez: `github-server` sigue siendo GitHub, y una
  // clave que solo se parece no.
  assert.equal(toolMarkId("github-server"), "github");
  assert.equal(toolMarkId("my-github"), null);
});

test("el nombre que se lee es el del servicio, o la clave si no está en la tabla", () => {
  assert.equal(toolLabel("jira-cloud"), "Atlassian");
  assert.equal(toolLabel("acme-analytics"), "acme-analytics");
});

test("la baldosa de un servidor sin marca lleva su inicial", () => {
  assert.equal(toolMonogram("acme-analytics"), "A");
  assert.equal(toolMonogram("  _zulú"), "Z");
  assert.equal(toolMonogram(""), "");
});

test("un programa de shell lleva marca solo por coincidencia exacta", () => {
  for (const cli of ["$DANIL_CLI", "${DANIL_CLI}", "$TERMINUS_CLI", "${TERMINUS_CLI}", "danil", "dn"]) assert.equal(commandMarkId(cli), "danil", cli);
  assert.equal(commandMarkId("gh"), "github");
  assert.equal(commandMarkId("glab"), "gitlab");
  assert.equal(commandMarkId("wrangler"), "cloudflare");
  assert.equal(commandMarkId("gcloud"), "googlecloud");
  assert.equal(commandMarkId("gsutil"), "googlecloud");
  assert.equal(commandMarkId("psql"), "postgresql");
  // `git` lleva la marca de Git, nunca la de GitHub.
  assert.equal(commandMarkId("git"), "git");
  for (const cli of ["supabase", "vercel", "docker", "stripe", "aws", "playwright"]) assert.equal(commandMarkId(cli), cli);
  // Sin sufijo ni primera palabra: inventarían dueños.
  for (const cli of ["aws-vault", "docker-compose-x", "ls", "npm", "pnpm", "cargo", "$OTHER_CLI", "", null]) assert.equal(commandMarkId(cli), null, String(cli));
});

test("la variable del CLI se lee danil y lo demás queda igual", () => {
  assert.equal(commandName("$DANIL_CLI"), "danil");
  assert.equal(commandName("${TERMINUS_CLI}"), "danil");
  assert.equal(commandName("gh"), "gh");
  assert.equal(commandName("$DANIL_CLIX"), "$DANIL_CLIX");
});

test("un conector de claude.ai lleva la marca de su servicio", () => {
  assert.equal(toolMarkId("claude_ai_Google_Drive"), "drive");
  assert.equal(toolMarkId("claude_ai_Slack"), "slack");
  assert.equal(toolMarkId("claude_ai_Figma"), "figma");
  assert.equal(toolMarkId("claude_ai_Atlassian_Rovo"), "atlassian");
  assert.equal(toolLabel("claude_ai_Google_Drive"), TOOL_LABELS.drive);
  // Sin servicio conocido detrás del prefijo no hay marca: no es de Claude ni de nadie.
  assert.equal(toolMarkId("claude_ai_Claude_Docs"), null);
});

test("quitar el prefijo y los guiones bajos no cambia lo que ya resolvía", () => {
  // Cada alias, tal cual y con sufijo, sigue en su marca.
  for (const [alias, id] of [["github", "github"], ["gh", "github"], ["google-drive", "drive"], ["jira", "atlassian"], ["figma-escritorio", "figma"], ["cua-driver", "cua"], ["postgres", "postgresql"], ["google-cloud", "googlecloud"], ["diagrams.net", "drawio"]] as const)
    assert.equal(toolMarkId(alias), id, alias);
  assert.equal(toolMarkId("google_drive"), "drive");
  assert.equal(toolMarkId("my_server"), null);
  assert.equal(toolMarkId("claude"), null);
  // Los comandos siguen siendo coincidencia exacta: el prefijo es de conectores.
  assert.equal(commandMarkId("claude_ai_Slack"), null);
});
