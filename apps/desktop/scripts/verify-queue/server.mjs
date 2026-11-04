#!/usr/bin/env node
/**
 * Cola de verificación de una máquina: recibe repo, commit y comando, y corre uno a la vez.
 *
 * Nada de aquí conoce un repo concreto; lo que se puede correr sale de `repos.json`.
 * Escucha solo en loopback: el acceso lo da el túnel que llega al puerto (Tailscale
 * SSH o SSM). La máquina no guarda secretos: el commit llega como `git bundle`.
 *
 *   VERIFY_QUEUE_HOME=/var/lib/verify-queue node server.mjs
 */
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFileSync, createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, statfsSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { arch, constants, platform } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

export const DISK_LIMIT_PERCENT = 80;
const GIT_TIMEOUT_MS = 10 * 60_000;
const DEFAULT_RUN_TIMEOUT_MS = 60 * 60_000;
const MAX_BUNDLE_BYTES = 2 * 1024 ** 3;
const KEPT_RUNS = 50;
const KEPT_COMMITS = 20;
const REPO_NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const RUN_ID = /^[0-9]{13}-[0-9a-f]{8}$/;
const FINISHED = new Set(["passed", "failed", "cancelled", "interrupted"]);

class Refusal extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", timeout: GIT_TIMEOUT_MS, killSignal: "SIGKILL", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${(result.stderr || result.error?.message || "").trim()}`);
  return result.stdout;
}

const defaultDiskPercent = (path) => {
  const { blocks, bfree, bavail } = statfsSync(path);
  return Math.ceil(((blocks - bfree) / (blocks - bfree + bavail)) * 100);
};

export function createQueue({ home, config, diskPercent = defaultDiskPercent, runTimeoutMs = DEFAULT_RUN_TIMEOUT_MS }) {
  const runsDir = join(home, "runs");
  const reposDir = join(home, "repos");
  const busyMarker = join(home, "busy");
  mkdirSync(runsDir, { recursive: true });
  mkdirSync(reposDir, { recursive: true });

  const runDir = (id) => join(runsDir, id);
  const metaPath = (id) => join(runDir(id), "meta.json");
  const logPath = (id) => join(runDir(id), "log");
  const readRun = (id) => JSON.parse(readFileSync(metaPath(id), "utf8"));
  function saveRun(run) {
    writeFileSync(`${metaPath(run.id)}.new`, JSON.stringify(run, null, 2));
    renameSync(`${metaPath(run.id)}.new`, metaPath(run.id));
  }
  const allRuns = () => readdirSync(runsDir).filter((id) => RUN_ID.test(id) && existsSync(metaPath(id))).sort().map(readRun);
  const pending = () => allRuns().filter((run) => run.state === "queued");

  let current = null;
  let draining = false;
  let idle = Promise.resolve();

  function repoPaths(repo) {
    const base = join(reposDir, repo);
    return { base, checkout: join(base, "checkout"), target: join(base, "target") };
  }

  /** Un checkout fijo por repo: dos checkouts sobre una target dan errores falsos de código viejo. */
  function ensureRepo(repo) {
    const paths = repoPaths(repo);
    if (!existsSync(join(paths.checkout, ".git"))) {
      mkdirSync(paths.checkout, { recursive: true });
      git(paths.checkout, ["init", "-q"]);
      git(paths.checkout, ["config", "gc.auto", "0"]);
    }
    return paths;
  }

  function knownCommits(repo) {
    if (!existsSync(join(repoPaths(repo).checkout, ".git"))) return [];
    return git(repoPaths(repo).checkout, ["for-each-ref", "--sort=-creatordate", "--format=%(objectname)", "refs/verify/"]).split("\n").filter(Boolean);
  }

  function checkRequest(repo, commit, command) {
    if (!REPO_NAME.test(repo ?? "")) throw new Refusal(400, "repo inválido");
    if (!COMMIT.test(commit ?? "")) throw new Refusal(400, "commit inválido: debe ser el hash completo");
    const allowed = config.repos?.[repo];
    if (!allowed) throw new Refusal(403, `esta cola no corre el repo ${repo}`);
    if (!allowed.commands?.includes(command)) throw new Refusal(403, `esta cola no corre «${command}» en ${repo}`);
  }

  /** Solo entra el objeto del bundle: fetch no ejecuta nada del commit. */
  function receive(repo, commit, bundle) {
    const { checkout } = ensureRepo(repo);
    if (bundle) {
      try {
        git(checkout, ["fetch", "-q", "--no-tags", "--no-write-fetch-head", bundle, `+refs/*:refs/verify-incoming/${commit}/*`]);
      } catch (error) {
        throw new Refusal(400, `el bundle no se pudo leer: ${error.message}`);
      } finally {
        for (const line of git(checkout, ["for-each-ref", "--format=%(refname)", `refs/verify-incoming/${commit}/`]).split("\n").filter(Boolean)) git(checkout, ["update-ref", "-d", line]);
      }
    }
    const type = spawnSync("git", ["cat-file", "-t", commit], { cwd: checkout, encoding: "utf8", timeout: GIT_TIMEOUT_MS });
    if (type.stdout?.trim() !== "commit") throw new Refusal(422, `el commit ${commit} no llegó en el bundle`);
    git(checkout, ["update-ref", `refs/verify/${commit}`, commit]);
    const stale = knownCommits(repo).slice(KEPT_COMMITS);
    for (const old of stale) git(checkout, ["update-ref", "-d", `refs/verify/${old}`]);
  }

  async function submit({ repo, commit, command, bundle }) {
    checkRequest(repo, commit, command);
    receive(repo, commit, bundle);
    const id = `${Date.now()}-${randomBytes(4).toString("hex")}`;
    mkdirSync(runDir(id));
    writeFileSync(logPath(id), "");
    const run = { id, repo, commit, command, state: "queued", exitCode: null, createdAt: new Date().toISOString(), startedAt: null, finishedAt: null, targetRebuilt: false };
    saveRun(run);
    pruneRuns();
    drain();
    return run;
  }

  function pruneRuns() {
    const finished = allRuns().filter((run) => FINISHED.has(run.state));
    for (const run of finished.slice(0, Math.max(0, finished.length - KEPT_RUNS))) rmSync(runDir(run.id), { recursive: true, force: true });
  }

  function drain() {
    if (draining) return;
    draining = true;
    idle = (async () => {
      try {
        writeFileSync(busyMarker, "");
        for (let next = pending()[0]; next; next = pending()[0]) await execute(next);
      } finally {
        rmSync(busyMarker, { force: true });
        draining = false;
      }
    })();
  }

  function attempt(log, script, env, cwd) {
    return new Promise((resolve) => {
      if (current.cancelled) return resolve(1);
      const child = spawn("bash", ["-lc", script], { cwd, env, detached: true, stdio: ["ignore", log, log] });
      const kill = () => {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          // El grupo pudo salir antes de la señal.
        }
      };
      current.kill = kill;
      const timer = setTimeout(() => {
        current.timedOut = true;
        kill();
      }, runTimeoutMs);
      child.on("error", () => { clearTimeout(timer); resolve(127); });
      child.on("close", (code, signal) => {
        clearTimeout(timer);
        kill();
        resolve(code ?? 128 + (constants.signals[signal] ?? 0));
      });
    });
  }

  async function execute(queued) {
    let run = { ...queued, state: "running", startedAt: new Date().toISOString() };
    saveRun(run);
    current = { id: run.id, kill: () => {}, cancelled: false, timedOut: false };
    const out = createWriteStream(logPath(run.id), { flags: "a" });
    await new Promise((resolve) => out.once("open", resolve));
    const say = (line) => writeFileSync(out.fd, `[cola] ${line}\n`);
    const finish = (state, exitCode) => {
      run = { ...run, state, exitCode, finishedAt: new Date().toISOString() };
      saveRun(run);
    };
    try {
      const { checkout, target } = ensureRepo(run.repo);
      const allowed = config.repos[run.repo];
      const dropTarget = () => {
        rmSync(target, { recursive: true, force: true });
      };
      const clean = () => {
        rmSync(join(checkout, ".git/index.lock"), { force: true });
        git(checkout, ["checkout", "-q", "-f", "--detach", run.commit]);
        git(checkout, ["clean", "-q", "-ffdx"]);
      };
      if (diskPercent(home) > DISK_LIMIT_PERCENT) {
        say(`disco al ${diskPercent(home)} %: borro la target de ${run.repo}`);
        dropTarget();
        run = { ...run, targetRebuilt: true };
      }
      clean();
      say(`${run.repo} ${run.commit} en ${checkout}: ${run.command}`);
      const script = [allowed.prepare, run.command].filter(Boolean).join(" && ");
      const env = { HOME: process.env.HOME, PATH: process.env.PATH, LANG: process.env.LANG ?? "C.UTF-8", CARGO_TARGET_DIR: target };
      let code = await attempt(out.fd, script, env, checkout);
      if (code !== 0 && !current.cancelled && !current.timedOut && diskPercent(home) > DISK_LIMIT_PERCENT && !run.targetRebuilt) {
        say(`falló con el disco al ${diskPercent(home)} %: borro la target y recompilo una vez`);
        dropTarget();
        clean();
        run = { ...run, targetRebuilt: true };
        code = await attempt(out.fd, script, env, checkout);
      }
      if (current.cancelled) finish("cancelled", null);
      else {
        if (current.timedOut) say(`pasó de su plazo de ${Math.round(runTimeoutMs / 60_000)} min`);
        finish(code === 0 ? "passed" : "failed", code);
      }
      clean();
      git(checkout, ["gc", "-q", "--prune=1.day.ago"]);
      say(`terminó: ${run.state}${run.exitCode === null ? "" : ` (exit ${run.exitCode})`}`);
    } catch (error) {
      say(error.message);
      if (!FINISHED.has(run.state)) finish("failed", 1);
    } finally {
      current = null;
      await new Promise((resolve) => out.end(resolve));
    }
  }

  function cancel(id) {
    const run = readRun(id);
    if (run.state === "queued") saveRun({ ...run, state: "cancelled", finishedAt: new Date().toISOString() });
    else if (run.state === "running" && current?.id === id) {
      current.cancelled = true;
      current.kill();
    }
    return readRun(id);
  }

  /** Lo que corría cuando la cola cayó ya no tiene dueño: se dice, no se reintenta. */
  function recover() {
    for (const run of allRuns()) {
      if (run.state !== "running") continue;
      appendFileSync(logPath(run.id), "[cola] la cola se reinició con esta corrida en marcha\n");
      saveRun({ ...run, state: "interrupted", finishedAt: new Date().toISOString() });
    }
    rmSync(busyMarker, { force: true });
    drain();
  }

  const position = (id) => pending().findIndex((run) => run.id === id);
  const hasRun = (id) => RUN_ID.test(id) && existsSync(metaPath(id));

  return { submit, cancel, recover, readRun, allRuns, hasRun, knownCommits, position, logPath, settled: () => idle, home };
}

function send(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function handle(queue, request, response) {
  const url = new URL(request.url, "http://queue");
  const parts = url.pathname.split("/").filter(Boolean);
  if (request.method === "GET" && url.pathname === "/health") {
    return send(response, 200, { platform: platform(), arch: arch(), runs: queue.allRuns().filter((run) => !FINISHED.has(run.state)).map(({ id, repo, commit, command, state }) => ({ id, repo, commit, command, state })) });
  }
  if (request.method === "GET" && parts[0] === "repos" && parts[2] === "commits" && parts.length === 3) {
    if (!REPO_NAME.test(parts[1])) throw new Refusal(400, "repo inválido");
    return send(response, 200, { commits: queue.knownCommits(parts[1]) });
  }
  if (request.method === "POST" && url.pathname === "/runs") {
    const [repo, commit, command] = ["repo", "commit", "command"].map((key) => url.searchParams.get(key) ?? undefined);
    const incoming = join(queue.home, `incoming-${randomBytes(4).toString("hex")}.bundle`);
    try {
      let size = 0;
      request.on("data", (chunk) => {
        size += chunk.length;
        if (size > MAX_BUNDLE_BYTES) request.destroy(new Error("bundle demasiado grande"));
      });
      await pipeline(request, createWriteStream(incoming));
      const run = await queue.submit({ repo, commit, command, bundle: size ? incoming : null });
      return send(response, 201, { id: run.id, position: queue.position(run.id) });
    } finally {
      rmSync(incoming, { force: true });
    }
  }
  if (parts[0] === "runs" && parts[1]) {
    if (!queue.hasRun(parts[1])) throw new Refusal(404, `no existe la corrida ${parts[1]}`);
    if (request.method === "GET" && parts.length === 2) return send(response, 200, { ...queue.readRun(parts[1]), position: queue.position(parts[1]) });
    if (request.method === "POST" && parts[2] === "cancel") return send(response, 200, queue.cancel(parts[1]));
    if (request.method === "GET" && parts[2] === "log") {
      const path = queue.logPath(parts[1]);
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const size = statSync(path).size;
      if (!Number.isSafeInteger(offset) || offset < 0) throw new Refusal(400, "offset inválido");
      response.writeHead(200, { "content-type": "application/octet-stream", "content-length": Math.max(0, size - offset) });
      if (offset >= size) return response.end();
      return pipeline(createReadStream(path, { start: offset, end: size - 1 }), response);
    }
  }
  throw new Refusal(404, "ruta desconocida");
}

export function createHttpServer(queue) {
  return createServer((request, response) => {
    handle(queue, request, response).catch((error) => {
      if (!response.headersSent) send(response, error.status ?? 500, { error: error.message });
      else response.destroy();
    });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const home = process.env.VERIFY_QUEUE_HOME ?? "/var/lib/verify-queue";
  const port = Number(process.env.VERIFY_QUEUE_PORT ?? 8787);
  const config = JSON.parse(readFileSync(process.env.VERIFY_QUEUE_CONFIG ?? "/etc/verify-queue/repos.json", "utf8"));
  const queue = createQueue({ home, config });
  queue.recover();
  createHttpServer(queue).listen(port, "127.0.0.1", () => console.log(`verify-queue en 127.0.0.1:${port}`));
}
