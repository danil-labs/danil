/**
 * `lib/secretScan.ts`: qué se reconoce como secreto al pegar (una familia por
 * prefijo, JWT, PEM, URL con credenciales y alta entropía) y qué no (SHA,
 * UUID, rutas, URLs limpias, prosa); el `detalle` de MCP sin credenciales y el
 * bloque MCP con valores escritos.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { MASK, findPastedSecret, maskServerSource, mcpBlockValues, secretFamilyOf } from "../../src/lib/secretScan.ts";

// Armados en la prueba: un literal con forma de llave real lo bloquea el escáner del repositorio.
const body = (n: number) => "Q7f9Kp2LmX4vR8tZ1nB6cW3yH5jD0sAe".repeat(4).slice(0, n);
const FAKE = {
  openai: `sk-${"proj-"}${body(40)}`,
  anthropic: `sk-${"ant-"}api03-${body(40)}`,
  ghp: `gh${"p"}_${body(36)}`,
  gho: `gh${"o"}_${body(36)}`,
  pat: `github${"_pat_"}11ABCDEFG0${body(40)}`,
  gitlab: `glp${"at-"}${body(20)}`,
  slackBot: `xox${"b"}-1234567890-0987654321-${body(24)}`,
  slackUser: `xox${"p"}-1234567890-0987654321-${body(24)}`,
  aws: `AKI${"A"}IOSFODNN7EXAMPL3`,
  awsSession: `ASI${"A"}IOSFODNN7EXAMPL3`,
  stripe: `sk${"_live_"}${body(24)}`,
  stripeRestricted: `rk${"_live_"}${body(24)}`,
  google: `AIz${"a"}Sy${body(33)}`,
  jwt: `ey${"J"}hbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ey${"J"}zdWIiOiIxMjM0NTY3ODkwIn0.${body(30)}`,
  pem: `-----BEGIN ${"OPENSSH"} PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQ\n-----END ${"OPENSSH"} PRIVATE KEY-----`,
  awsSecret: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYz3XAMPLEKEY",
  random: body(32),
};

test("each known family is recognized when pasted alone", () => {
  const families: Record<string, string> = {
    openai: "prefix", anthropic: "prefix", ghp: "prefix", gho: "prefix", pat: "prefix", gitlab: "prefix",
    slackBot: "prefix", slackUser: "prefix", aws: "prefix", awsSession: "prefix", stripe: "prefix",
    stripeRestricted: "prefix", google: "prefix", jwt: "jwt", pem: "pem", awsSecret: "entropy", random: "entropy",
  };
  for (const [name, family] of Object.entries(families)) {
    const found = findPastedSecret(`  ${FAKE[name as keyof typeof FAKE]}\n`);
    assert.equal(found?.family, family, name);
    assert.equal(found?.value, FAKE[name as keyof typeof FAKE], `${name}: the value without the surrounding spaces`);
  }
});

test("a URL with a password or a token parameter is a secret; a clean URL is not", () => {
  assert.equal(secretFamilyOf("postgres://app:s3cr3t-pass@db.example.com:5432/app"), "url");
  assert.equal(secretFamilyOf("https://mcp.example.com/sse?api_key=abc123"), "url");
  assert.equal(secretFamilyOf("https://mcp.example.com/sse?region=us"), null);
  assert.equal(secretFamilyOf("https://github.com/danil-labs/danil/pull/734"), null);
});

test("hashes, ids, paths and prose are not secrets", () => {
  const negatives = [
    "334f565cc6e9a1b2c3d4e5f60718293a4b5c6d7e", // SHA-1 de git
    "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08", // SHA-256
    "123e4567-e89b-12d3-a456-426614174000",
    "/Users/ana/code/danil/apps/desktop/src/lib/secretScan.ts",
    "./scripts/verify.mjs",
    "~/Library/Application Support/Danil",
    "feat/secrets-mcp-paste",
    "src/features/settings/Tools.tsx",
    "pnpm verify --remote --detach",
    "hola, ¿me ayudas con el despliegue de mañana?",
    "abcdefghijklmnopqrstuvwxyz",
    "short1A",
  ];
  for (const text of negatives) assert.equal(findPastedSecret(text), null, text);
});

test("inside a sentence only a strong family is taken, with its position", () => {
  const text = `usa esta llave ${FAKE.ghp} para el repo`;
  const found = findPastedSecret(text);
  assert.equal(found?.family, "prefix");
  assert.equal(text.slice(found!.start, found!.end), FAKE.ghp);
  assert.equal(findPastedSecret(`el hash es ${body(32)} y nada más`), null, "entropy alone inside prose is left as text");
});

test("the MCP source keeps where it comes from and hides every credential", () => {
  assert.equal(maskServerSource("https://mcp.example.com/sse"), "https://mcp.example.com/sse");
  assert.equal(maskServerSource("https://user:pw@mcp.example.com/sse?token=abc"), `https://mcp.example.com/sse?${MASK}`);
  assert.equal(maskServerSource(`https://hooks.example.com/v1/${FAKE.random}/events`), `https://hooks.example.com/v1/${MASK}/events`);
  assert.equal(maskServerSource("npx -y @acme/mcp-server"), "npx -y @acme/mcp-server");
  assert.equal(maskServerSource("npx -y @acme/mcp --token abc123 --port 3000"), `npx -y @acme/mcp --token ${MASK} --port 3000`);
  assert.equal(maskServerSource("server --api-key=abc123"), `server --api-key=${MASK}`);
  assert.equal(maskServerSource(`node server.js ${FAKE.stripe}`), `node server.js ${MASK}`);
  assert.equal(maskServerSource("API_TOKEN=xyz run-mcp"), `API_TOKEN=${MASK} run-mcp`);
  assert.equal(maskServerSource(""), "");
  for (const value of Object.values(FAKE)) assert.ok(!maskServerSource(`tool ${value}`).includes(value), "no family survives in a command");
});

test("an MCP block with a value written in env or headers is plain; markers and schemes are clean", () => {
  assert.equal(mcpBlockValues(JSON.stringify({ mcpServers: { a: { command: "npx", env: { API_KEY: "abc" } } } })), "plain");
  assert.equal(mcpBlockValues(JSON.stringify({ a: { url: "https://x", headers: { Authorization: "Bearer abc" } } })), "plain");
  assert.equal(mcpBlockValues(JSON.stringify({ command: "npx", env: { MODE: "prod" } })), "plain", "every literal value counts: the engine vaults them all");
  assert.equal(mcpBlockValues(JSON.stringify({ mcpServers: { a: { command: "npx", env: { API_KEY: "${secret:env/*/API_KEY}" } } } })), "clean");
  assert.equal(mcpBlockValues(JSON.stringify({ a: { url: "https://x", headers: { Authorization: "Bearer ${secret:env/*/TOKEN}" } } })), "clean");
  assert.equal(mcpBlockValues(JSON.stringify({ a: { command: "npx", args: ["-y", "pkg"], env: {} } })), "clean");
  assert.equal(mcpBlockValues(JSON.stringify({ a: { command: "npx", env: { EMPTY: "" } } })), "clean");
  assert.equal(mcpBlockValues("{ not json"), "invalid");
});
