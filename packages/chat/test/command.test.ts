import assert from "node:assert/strict";
import { test } from "node:test";
import { bareCommand, commandProgram, commandSummary } from "../src/command.ts";

const summary = (command: string) => commandSummary(command);
const program = (command: string) => commandProgram(command);

test("el intérprete que lanzó el comando no es el acto", () => {
  assert.equal(summary("/bin/bash -lc 'pnpm verify'"), "pnpm verify");
  assert.equal(program("/bin/bash -lc 'pnpm verify'"), "pnpm");
  assert.equal(summary('zsh -lc "git status"'), "git status");
  assert.equal(summary("bash -lc $'pnpm test'"), "pnpm test");
  assert.equal(summary('/bin/sh -c "ls -la | wc -l"'), "ls -la");
});

test("los envoltorios se saltan hasta el programa de verdad", () => {
  assert.equal(summary('/usr/bin/env FOO=1 bash -lc "pnpm test"'), "pnpm test");
  assert.equal(summary("env -i PATH=/usr/bin pnpm build"), "pnpm build");
  assert.equal(summary("sudo -u root timeout 30 systemctl restart x"), "systemctl restart x");
  assert.equal(summary("command pnpm lint"), "pnpm lint");
  assert.equal(summary("nohup ./run.sh --fast"), "./run.sh --fast");
  assert.equal(summary("time -p pnpm test"), "pnpm test");
});

test("lo que solo prepara el terreno no se nombra", () => {
  assert.equal(summary("cd /repo && git status"), "git status");
  assert.equal(summary('cd "/a b" && pnpm test'), "pnpm test");
  assert.equal(summary("set -e; pnpm build"), "pnpm build");
  assert.equal(summary("cd /repo"), "cd /repo");
  assert.equal(summary("export A=1"), "export A=1");
});

test("la fila se queda con el primer tramo: lo de después no es el acto", () => {
  assert.equal(summary("pnpm verify 2>&1 | tail -20"), "pnpm verify");
  assert.equal(summary("git commit -m \"fix: x\" && git push"), 'git commit -m "fix: x"');
  assert.equal(summary("rg -n 'tool' src | head"), "rg -n tool src");
});

test("un comando corriente se lee tal cual, sin tocarle nada", () => {
  assert.equal(summary("pnpm --filter desktop build"), "pnpm --filter desktop build");
  assert.equal(program("pnpm --filter desktop build"), "pnpm");
  assert.equal(summary("./scripts/verify.sh --no-cargo"), "./scripts/verify.sh --no-cargo");
  assert.equal(program("./scripts/verify.sh"), "verify.sh");
});

test("lo que no cierra no se adivina: se devuelve como vino", () => {
  const roto = 'bash -lc "echo hola';
  assert.equal(summary(roto), roto);
  assert.equal(bareCommand(roto), roto);
});

test("al desplegar, el comando conserva todo lo que corrió", () => {
  assert.equal(bareCommand("/bin/bash -lc 'pnpm verify'"), "pnpm verify");
  // El intérprete sale; el `cd` de preparación se queda: es lo que corrió.
  assert.equal(bareCommand('zsh -lc "cd /repo && pnpm test"'), "cd /repo && pnpm test");
  assert.equal(bareCommand("pnpm verify 2>&1 | tail -20"), "pnpm verify 2>&1 | tail -20");
  // Las comillas escapadas se entienden; las que no cierran, no se tocan.
  assert.equal(bareCommand('/bin/zsh -lc "cd \\"/a b\\" && git status"'), 'cd "/a b" && git status');
});

test("un comando largo se corta por palabra, no a media palabra", () => {
  const largo = `gh pr create --title "una cosa muy larga que no cabe" --body "otra cosa igual de larga"`;
  const texto = summary(largo);
  assert.ok(texto.length <= 64, texto);
  assert.ok(texto.endsWith("…"), texto);
  assert.ok(!/\s…$/.test(texto), texto);
});
