#!/usr/bin/env node
/**
 * Cola de trabajos pesados de una máquina: recibe repo, commit y comando, y corre uno a la vez.
 *
 * Nada de aquí conoce un repo concreto; lo que se puede correr sale de `repos.json`.
 * Escucha solo en loopback: el acceso lo da el túnel que llega al puerto (Tailscale
 * SSH o SSM). La máquina no guarda secretos: el commit llega como `git bundle`.
 *
 * El estado es de `verify`; el código de la rama corre con el usuario del perfil
 * (`user` en `repos.json`) en un carril suyo. Los bundles entran a un espejo de
 * `verify`, y el carril se trae del espejo como el usuario de la corrida. `verify`
 * nunca escribe, borra ni corre git dentro de un carril: solo lee sus artefactos.
 *
 *   VERIFY_QUEUE_HOME=/var/lib/verify-queue node server.mjs
 */
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { appendFileSync, chmodSync, closeSync, createReadStream, createWriteStream, existsSync, constants as fsConstants, fstatSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, realpathSync, renameSync, rmSync, statfsSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { arch, availableParallelism, constants, platform } from "node:os";
import { dirname, join, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

export const DISK_LIMIT_PERCENT = 80;
const GIT_TIMEOUT_MS = 10 * 60_000;
const DEFAULT_RUN_TIMEOUT_MS = 60 * 60_000;
const MAX_BUNDLE_BYTES = 2 * 1024 ** 3;
const MAX_ARTIFACT_BYTES = 16 * 1024 ** 2;
const MAX_DIGEST_BYTES = 4 * 1024 ** 3;
const MAX_ARTIFACTS = 64;
const MAX_TOKENS = 16;
const MAX_CHECKS = 1000;
const KEPT_RUNS = 50;
const KEPT_COMMITS = 20;
const MAX_LANES = 8;
const REPO_NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const USER_NAME = /^[a-z_][a-z0-9_-]{0,31}$/;
const ENV_NAME = /^[A-Z_][A-Z0-9_]{0,63}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const RUN_ID = /^[0-9]{13}-[0-9a-f]{8}$/;
const FINISHED = new Set(["passed", "failed", "cancelled", "interrupted"]);
const CHECK_STATES = new Set(["PASS", "FAIL", "TIMEOUT", "SKIP", "KNOWN"]);
/** Lo único que pasa del entorno de la cola al de la corrida; el carril pone HOME y sus cachés. */
const INHERITED = ["PATH", "LANG", "RUSTUP_HOME"];
const LANE_ENV = ["HOME", "TMPDIR", "CARGO_HOME", "XDG_CACHE_HOME", "XDG_DATA_HOME", "CARGO_TARGET_DIR", "GIT_CONFIG_GLOBAL"];
/** El entorno con el que arranca `sudo`: `env -i` deja después solo lo de la corrida. */
const SUDO_ENV = { PATH: "/usr/sbin:/usr/bin:/sbin:/bin" };

class Refusal extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const own = (object, key) => object != null && Object.hasOwn(object, key);
const anchored = (pattern) => new RegExp(`^(?:${pattern})$`);
const insideRelative = (path) => typeof path === "string" && path !== "" && !path.startsWith("/") && !path.split("/").includes("..");

/** `{commit}`, `{base}` y `{jobs}`: valores que la cola ya validó, nunca texto de la petición. */
function substitute(text, values) {
  return text.replace(/\{(commit|base|jobs)\}/g, (_, key) => {
    if (values[key] == null) throw new Refusal(400, `falta ${key}`);
    return String(values[key]);
  });
}

/** Falla al arrancar si `repos.json` trae algo que la cola no sabría correr con seguridad. */
export function checkConfig(config) {
  if (config.lanes !== undefined && !(Number.isInteger(config.lanes) && config.lanes >= 1 && config.lanes <= MAX_LANES)) throw new Error(`repos.json: lanes es un entero de 1 a ${MAX_LANES}`);
  for (const [repo, profile] of Object.entries(config.repos ?? {})) {
    const where = `repos.json: ${repo}`;
    if (!REPO_NAME.test(repo)) throw new Error(`${where}: nombre inválido`);
    if (profile.user !== undefined && !USER_NAME.test(profile.user)) throw new Error(`${where}: user inválido`);
    if (profile.target !== undefined && !["checkout", "outside"].includes(profile.target)) throw new Error(`${where}: target es "checkout" u "outside"`);
    if (!profile.jobs === !profile.commands) throw new Error(`${where}: lleva commands o jobs, no los dos`);
    const envs = [profile.env, ...Object.values(profile.jobs ?? {}).map((job) => job.env)];
    for (const env of envs) for (const name of Object.keys(env ?? {})) if (!ENV_NAME.test(name) || INHERITED.includes(name) || LANE_ENV.includes(name)) throw new Error(`${where}: env ${name} no se puede fijar`);
    for (const [name, job] of Object.entries(profile.jobs ?? {})) {
      if (!/^[a-z][a-z0-9-]{0,31}$/.test(name)) throw new Error(`${where}: trabajo ${name} inválido`);
      if (!Array.isArray(job.argv) || !job.argv.length || job.argv.some((part) => typeof part !== "string")) throw new Error(`${where}: ${name}.argv debe ser una lista de textos`);
      if (job.argv.some((part) => part.includes("{base}"))) throw new Error(`${where}: ${name} pone {base} en base.argv, no en argv`);
      for (const [flag, pattern] of Object.entries(job.options ?? {})) {
        if (!/^--?[a-z0-9][a-z0-9-]*$/.test(flag)) throw new Error(`${where}: ${name} opción ${flag} inválida`);
        if (pattern !== null) anchored(pattern);
      }
      if (job.positional) anchored(job.positional.pattern);
      if (job.base && (!Array.isArray(job.base.argv) || (job.base.unless ?? []).some((flag) => !own(job.options, flag)))) throw new Error(`${where}: ${name}.base inválido`);
    }
    const paths = [...(profile.artifacts ?? []), ...(profile.fresh ?? []), ...(profile.receipt?.summary ? [profile.receipt.summary] : []), ...Object.values(profile.receipt?.digests ?? {})];
    for (const path of paths) if (!insideRelative(path)) throw new Error(`${where}: ${path} debe quedar dentro del checkout`);
  }
  return config;
}

/**
 * Traduce un comando de la petición a lo que corre. Un perfil con `commands` acepta
 * solo esos textos exactos y los corre con bash (lo escribió quien instaló la cola).
 * Un perfil con `jobs` nunca usa shell: `<trabajo> <tokens>` separados por un espacio,
 * y cada token se valida contra la definición del trabajo.
 */
export function resolveCommand(profile, command, values) {
  if (profile.commands) {
    if (!profile.commands.includes(command)) return null;
    return { argv: ["bash", "-lc", [profile.prepare, command].filter(Boolean).join(" && ")], env: {} };
  }
  const [name, ...tokens] = (command ?? "").split(" ");
  if (!own(profile.jobs, name)) return null;
  if (tokens.length > MAX_TOKENS) throw new Refusal(400, `el comando lleva más de ${MAX_TOKENS} argumentos`);
  const job = profile.jobs[name];
  const options = [];
  const seen = new Set();
  let positional = null;
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!token) throw new Refusal(400, "el comando lleva espacios de sobra");
    if (token.startsWith("-")) {
      if (!own(job.options, token)) throw new Refusal(403, `«${name}» no admite ${token}`);
      if (seen.has(token)) throw new Refusal(400, `${token} va una sola vez`);
      seen.add(token);
      const pattern = job.options[token];
      if (pattern === null) options.push(token);
      else {
        const value = tokens[(i += 1)];
        if (value === undefined || value.startsWith("-") || !anchored(pattern).test(value)) throw new Refusal(400, `${token} no admite ese valor`);
        options.push(token, value);
      }
    } else {
      if (!job.positional || positional !== null || !anchored(job.positional.pattern).test(token)) throw new Refusal(400, `«${name}» no admite «${token}»`);
      positional = token;
    }
  }
  if (job.positional?.required && positional === null) throw new Refusal(400, `«${name}» necesita ${job.positional.name ?? "un argumento"}`);
  const base = [];
  if (job.base) {
    if (values.base != null) base.push(...job.base.argv.map((part) => substitute(part, values)));
    else if (!(job.base.unless ?? []).some((flag) => seen.has(flag))) throw new Refusal(400, `«${name}» necesita base: el punto de corte con dev (git merge-base HEAD origin/dev)`);
  }
  const argv = [];
  let placed = false;
  for (const part of job.argv) {
    if (part === "{options}") {
      argv.push(...base, ...options);
      placed = true;
    } else if (part === "{arg}") {
      if (positional !== null) argv.push(positional);
    } else argv.push(substitute(part, values));
  }
  if (!placed) argv.push(...base, ...options);
  return { argv, env: Object.fromEntries(Object.entries(job.env ?? {}).map(([key, value]) => [key, substitute(value, values)])) };
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

function passwdUid(user) {
  const result = spawnSync("getent", ["passwd", user], { encoding: "utf8" });
  const uid = Number(result.stdout?.trim().split(":")[2]);
  if (result.status !== 0 || !Number.isInteger(uid)) throw new Error(`no existe el usuario ${user}`);
  return uid;
}

const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * Quien corre el código de la rama. Con `user`, todo pasa por `sudo -n -u <user> -- env -i`.
 * Sin él es el proceso de la cola, y solo si la cola se creó con `sameUser` (pruebas).
 */
function runnerFor(user, sudo) {
  const uid = user ? passwdUid(user) : process.getuid();
  const inherited = Object.fromEntries(INHERITED.filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
  inherited.LANG ??= "C.UTF-8";
  const wrap = (argv, env) => (user ? [sudo, ["-n", "-u", user, "--", "env", "-i", ...Object.entries(env).map(([key, value]) => `${key}=${value}`), ...argv]] : [argv[0], argv.slice(1)]);
  return {
    user,
    uid,
    inherited,
    sync(argv, cwd, env = inherited) {
      const [command, args] = wrap(argv, env);
      const result = spawnSync(command, args, { cwd, env: user ? SUDO_ENV : env, encoding: "utf8", timeout: GIT_TIMEOUT_MS, killSignal: "SIGKILL", stdio: ["ignore", "pipe", "pipe"] });
      if (result.status !== 0) throw new Error(`${argv.slice(0, 4).join(" ")}: ${(result.stderr || result.error?.message || "").trim()}`);
      return result.stdout;
    },
    spawn(argv, env, cwd, log) {
      const [command, args] = wrap(argv, env);
      return spawn(command, args, { cwd, env: user ? SUDO_ENV : env, detached: true, stdio: ["ignore", log, log] });
    },
    /** Mata todo lo del usuario, también lo de `setsid`, hasta que no quede nada; `kill -1` sale con 137. */
    sweep(child) {
      if (!user) {
        try {
          if (child) process.kill(-child.pid, "SIGKILL");
        } catch {
          // El grupo pudo salir antes de la señal.
        }
        return true;
      }
      for (let round = 0; round < 10; round += 1) {
        const [command, args] = wrap(["kill", "-9", "-1"], inherited);
        spawnSync(command, args, { env: SUDO_ENV, stdio: "ignore", timeout: 30_000 });
        if (spawnSync("pgrep", ["-u", String(uid)], { stdio: "ignore" }).status === 1) return true;
        pause(200);
      }
      return false;
    },
  };
}

/** Globs de `*` por segmento, relativos a `root`; no baja por enlaces. */
function matchFiles(root, glob) {
  const segments = glob.split("/").filter(Boolean);
  let found = [""];
  for (const [index, segment] of segments.entries()) {
    const last = index === segments.length - 1;
    const pattern = anchored(segment.split("*").map((piece) => piece.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*"));
    const next = [];
    for (const dir of found) {
      let entries;
      try {
        entries = readdirSync(join(root, dir), { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (!pattern.test(entry.name)) continue;
        if (last ? entry.isFile() : entry.isDirectory()) next.push(dir ? `${dir}/${entry.name}` : entry.name);
      }
    }
    found = next;
  }
  return found.sort();
}

/**
 * Abre un archivo del carril para leerlo como `verify` sin ser su ayudante: el padre
 * real queda dentro del checkout, sin seguir enlaces, sin bloquear en un FIFO, y el
 * archivo es regular, del usuario de la corrida y sin otro nombre (enlace duro).
 */
function openLaneFile(root, path, uid) {
  let parent;
  try {
    parent = realpathSync(dirname(join(root, path)));
  } catch {
    return null;
  }
  if (parent !== root && !parent.startsWith(root + sep)) return null;
  let fd;
  try {
    fd = openSync(join(parent, path.split("/").at(-1)), fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW | fsConstants.O_NONBLOCK);
  } catch {
    return null;
  }
  const info = fstatSync(fd);
  if (!info.isFile() || info.uid !== uid || info.nlink !== 1) {
    closeSync(fd);
    return null;
  }
  return { fd, info };
}

/** Lee hasta `limit` bytes; `null` si hay más: un tope que se pasa no se recorta en silencio. */
function readBounded(fd, limit, onChunk) {
  const chunk = Buffer.alloc(1024 * 1024);
  let total = 0;
  for (;;) {
    const read = readSync(fd, chunk, 0, chunk.length, null);
    if (!read) return total;
    total += read;
    if (total > limit) return null;
    onChunk(chunk.subarray(0, read));
  }
}

export function createQueue({ home, config, diskPercent = defaultDiskPercent, runTimeoutMs = DEFAULT_RUN_TIMEOUT_MS, sudo = "/usr/bin/sudo", queueName = `${platform()}-${arch()}`, cpus = availableParallelism(), sameUser = false }) {
  checkConfig(config);
  const runsDir = join(home, "runs");
  const reposDir = join(home, "repos");
  const incomingDir = join(home, "incoming");
  const lanes = config.lanes ?? 1;
  const busyMarker = join(home, "busy");
  mkdirSync(home, { recursive: true });
  // El usuario de la corrida atraviesa `home` hacia su carril y el espejo, pero no lista ni lee el resto.
  chmodSync(home, 0o711);
  for (const dir of [runsDir, incomingDir]) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    chmodSync(dir, 0o700);
  }
  mkdirSync(reposDir, { recursive: true });

  const runDir = (id) => join(runsDir, id);
  const metaPath = (id) => join(runDir(id), "meta.json");
  const logPath = (id) => join(runDir(id), "log");
  const receiptPath = (id) => join(runDir(id), "receipt.json");
  const readRun = (id) => JSON.parse(readFileSync(metaPath(id), "utf8"));
  function saveRun(run) {
    writeFileSync(`${metaPath(run.id)}.new`, JSON.stringify(run, null, 2));
    renameSync(`${metaPath(run.id)}.new`, metaPath(run.id));
  }
  const allRuns = () => readdirSync(runsDir).filter((id) => RUN_ID.test(id) && existsSync(metaPath(id))).sort().map(readRun);
  const pending = () => allRuns().filter((run) => run.state === "queued");
  const runners = new Map();
  /** Cada carril tiene su usuario: `kill -1`, el candado de HOME y la target no se cruzan entre carriles. */
  const laneUser = (repo, lane) => {
    const user = config.repos[repo].user;
    return user && lane > 0 ? `${user}-${lane}` : user;
  };
  const runner = (repo, lane) => {
    const key = `${repo}:${lane}`;
    if (!runners.has(key)) runners.set(key, runnerFor(laneUser(repo, lane), sudo));
    return runners.get(key);
  };

  /** Carril → la corrida que lleva: id, cómo matarla y por qué terminó. */
  const active = new Map();
  const running = new Set();

  /** El espejo es de `verify` y solo recibe objetos: la rama nunca lo escribe. */
  const mirrorPath = (repo) => join(reposDir, repo, "mirror");

  function ensureMirror(repo) {
    const mirror = mirrorPath(repo);
    if (!existsSync(join(mirror, "HEAD"))) {
      mkdirSync(mirror, { recursive: true });
      git(mirror, ["init", "-q", "--bare"]);
      git(mirror, ["config", "gc.auto", "0"]);
    }
    return mirror;
  }

  function lanePaths(repo, lane = 0) {
    const base = join(home, "lanes", String(lane), repo);
    const checkout = join(base, "checkout");
    const target = config.repos[repo].target === "checkout" ? join(checkout, "target") : join(base, "target");
    return { base, checkout, target, home: join(base, "home"), tmp: join(base, "tmp"), cargo: join(base, "cargo"), cache: join(base, "cache"), data: join(base, "data") };
  }

  /** Lo que el carril pone en cada corrida: un HOME nuevo; registro, cachés y target persisten. */
  function laneEnv(repo, lane) {
    const paths = lanePaths(repo, lane);
    const insideTarget = config.repos[repo].target === "checkout";
    return { ...runner(repo, lane).inherited, HOME: paths.home, TMPDIR: paths.tmp, CARGO_HOME: paths.cargo, XDG_CACHE_HOME: paths.cache, XDG_DATA_HOME: paths.data, ...(insideTarget ? {} : { CARGO_TARGET_DIR: paths.target }) };
  }

  /** git en el checkout del carril, siempre con el usuario de la corrida, sin hooks ni config global. */
  function laneGit(repo, lane, args) {
    const { checkout } = lanePaths(repo, lane);
    const guard = ["-c", `safe.directory=${mirrorPath(repo)}`, "-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=false"];
    return runner(repo, lane).sync(["git", ...guard, ...args], checkout, { ...laneEnv(repo, lane), GIT_CONFIG_GLOBAL: "/dev/null" });
  }

  function ensureLane(repo, lane) {
    const paths = lanePaths(repo, lane);
    const run = runner(repo, lane);
    // HOME y TMPDIR nuevos en cada corrida; TMPDIR propio porque los candados de las cadenas viven ahí y /tmp lo comparten los carriles.
    run.sync(["rm", "-rf", paths.home, paths.tmp], "/");
    run.sync(["mkdir", "-p", paths.checkout, paths.home, paths.tmp, paths.cargo, paths.cache, paths.data], "/");
    // Lo que una rama deja en .git (filtros, include.path, insteadOf, alternates, hooks) correría en el
    // checkout de la siguiente: se borra y se reinicia en cada corrida. Un .git que no es carpeta se tira entero.
    const dotGit = join(paths.checkout, ".git");
    let real = false;
    try {
      real = lstatSync(dotGit).isDirectory();
    } catch {
      // Primera corrida del carril.
    }
    if (!real) run.sync(["rm", "-rf", dotGit], "/");
    else run.sync(["rm", "-rf", join(dotGit, "config"), join(dotGit, "info"), join(dotGit, "objects/info/alternates"), join(dotGit, "hooks")], "/");
    laneGit(repo, lane, ["init", "-q"]);
    laneGit(repo, lane, ["config", "gc.auto", "0"]);
    return paths;
  }

  function knownCommits(repo) {
    if (!existsSync(join(mirrorPath(repo), "HEAD"))) return [];
    return git(mirrorPath(repo), ["for-each-ref", "--sort=-creatordate", "--format=%(objectname)", "refs/verify/"]).split("\n").filter(Boolean);
  }

  /** Los núcleos se reparten entre carriles: dos cadenas de 8 trabajos en 8 núcleos se frenan entre sí. */
  const jobsFor = () => Math.max(1, Math.floor(cpus / lanes));

  function checkRequest({ repo, commit, command, base }) {
    if (!REPO_NAME.test(repo ?? "")) throw new Refusal(400, "repo inválido");
    if (!COMMIT.test(commit ?? "")) throw new Refusal(400, "commit inválido: debe ser el hash completo");
    if (base != null && !COMMIT.test(base)) throw new Refusal(400, "base inválida: debe ser el hash completo");
    const profile = own(config.repos, repo) ? config.repos[repo] : null;
    if (!profile) throw new Refusal(403, `esta cola no corre el repo ${repo}`);
    if (!profile.user && !sameUser) throw new Refusal(503, `el perfil ${repo} no tiene usuario de corrida: la cola no corre ramas con su propio usuario`);
    const resolved = resolveCommand(profile, command, { commit, base, jobs: jobsFor() });
    if (!resolved) throw new Refusal(403, `esta cola no corre «${command}» en ${repo}`);
    return resolved;
  }

  /** Solo entra el objeto del bundle: fetch no ejecuta nada del commit. */
  function receive(repo, commit, bundle) {
    const mirror = ensureMirror(repo);
    if (bundle) {
      try {
        git(mirror, ["fetch", "-q", "--no-tags", "--no-write-fetch-head", bundle, `+refs/*:refs/verify-incoming/${commit}/*`]);
      } catch (error) {
        throw new Refusal(400, `el bundle no se pudo leer: ${error.message}`);
      } finally {
        for (const line of git(mirror, ["for-each-ref", "--format=%(refname)", `refs/verify-incoming/${commit}/`]).split("\n").filter(Boolean)) git(mirror, ["update-ref", "-d", line]);
      }
    }
    const type = spawnSync("git", ["cat-file", "-t", commit], { cwd: mirror, encoding: "utf8", timeout: GIT_TIMEOUT_MS });
    if (type.stdout?.trim() !== "commit") throw new Refusal(422, `el commit ${commit} no llegó en el bundle`);
    git(mirror, ["update-ref", `refs/verify/${commit}`, commit]);
    const stale = knownCommits(repo).slice(KEPT_COMMITS);
    for (const old of stale) git(mirror, ["update-ref", "-d", `refs/verify/${old}`]);
    return mirror;
  }

  /** Lo que el recibo dice del árbol: el commit, su árbol y, si el cliente declaró una foto `wip`, el HEAD de debajo. */
  function describe(mirror, commit, base, wip) {
    const [tree, ...parents] = git(mirror, ["show", "-s", "--format=%T %P", commit]).trim().split(" ").filter(Boolean);
    if (wip && parents.length !== 1) throw new Refusal(400, "una foto wip tiene exactamente un padre: el HEAD de quien la manda");
    if (base && spawnSync("git", ["merge-base", "--is-ancestor", base, commit], { cwd: mirror }).status !== 0) throw new Refusal(400, `la base ${base} no es ancestro del commit: manda el punto de corte (git merge-base HEAD origin/dev), no la punta de dev`);
    return { tree, parents, head: wip ? parents[0] : commit };
  }

  async function submit({ repo, commit, command, bundle, base = null, wip = false }) {
    checkRequest({ repo, commit, command, base });
    const mirror = receive(repo, commit, bundle);
    const { tree, parents, head } = describe(mirror, commit, base, wip);
    const id = `${Date.now()}-${randomBytes(4).toString("hex")}`;
    mkdirSync(runDir(id));
    writeFileSync(logPath(id), "");
    const run = { id, repo, commit, tree, parents, head, wip: Boolean(wip), base, command, lane: null, state: "queued", exitCode: null, createdAt: new Date().toISOString(), startedAt: null, finishedAt: null, targetRebuilt: false, receiptSha256: null };
    saveRun(run);
    pruneRuns();
    drain();
    return run;
  }

  function pruneRuns() {
    const finished = allRuns().filter((run) => FINISHED.has(run.state));
    for (const run of finished.slice(0, Math.max(0, finished.length - KEPT_RUNS))) rmSync(runDir(run.id), { recursive: true, force: true });
  }

  /** Prefiere el carril libre donde el repo ya está caliente; si no, el primero libre. */
  function pickLane(repo, free) {
    return free.find((lane) => existsSync(join(lanePaths(repo, lane).checkout, ".git"))) ?? free[0];
  }

  /** Por orden de llegada, una corrida por carril. `execute` marca `running` antes de su primer await. */
  function drain() {
    for (;;) {
      const free = [...Array(lanes).keys()].filter((lane) => !active.has(lane));
      const next = free.length ? pending()[0] : null;
      if (!next) return;
      const lane = pickLane(next.repo, free);
      const current = { id: next.id, kill: () => {}, cancelled: false, timedOut: false };
      active.set(lane, current);
      writeFileSync(busyMarker, "");
      const done = execute(next, lane, current).finally(() => {
        active.delete(lane);
        running.delete(done);
        if (!active.size) rmSync(busyMarker, { force: true });
        drain();
      });
      running.add(done);
    }
  }

  async function settled() {
    while (running.size) await Promise.allSettled([...running]);
  }

  function attempt(repo, lane, current, log, argv, env, cwd) {
    return new Promise((resolve) => {
      if (current.cancelled) return resolve(1);
      const run = runner(repo, lane);
      const child = run.spawn(argv, env, cwd, log);
      const kill = () => run.sweep(child);
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

  /** Copia lo que la corrida dejó, antes de limpiar y con sus procesos ya muertos. */
  function collect(run, checkout, since) {
    const profile = config.repos[run.repo];
    const { uid } = runner(run.repo, run.lane);
    const globs = [...new Set([...(profile.artifacts ?? []), ...(profile.receipt?.summary ? [profile.receipt.summary] : [])])];
    const copied = [];
    const root = realpathSync(checkout);
    for (const glob of globs) {
      for (const path of matchFiles(root, glob)) {
        if (copied.length >= MAX_ARTIFACTS || copied.includes(path)) continue;
        const opened = openLaneFile(root, path, uid);
        if (!opened) continue;
        try {
          // El mtime lo pone la rama: filtra lo viejo, no garantiza nada.
          if (opened.info.mtimeMs < since - 1000) continue;
          const parts = [];
          if (readBounded(opened.fd, MAX_ARTIFACT_BYTES, (chunk) => parts.push(Buffer.from(chunk))) === null) continue;
          const destination = join(runDir(run.id), "artifacts", path);
          mkdirSync(dirname(destination), { recursive: true });
          writeFileSync(destination, Buffer.concat(parts));
          copied.push(path);
        } finally {
          closeSync(opened.fd);
        }
      }
    }
    return copied;
  }

  function digests(run, checkout) {
    const out = {};
    const { uid } = runner(run.repo, run.lane);
    const root = realpathSync(checkout);
    for (const [name, path] of Object.entries(config.repos[run.repo].receipt?.digests ?? {})) {
      const opened = openLaneFile(root, path, uid);
      if (!opened) continue;
      try {
        const hash = createHash("sha256");
        if (readBounded(opened.fd, MAX_DIGEST_BYTES, (chunk) => hash.update(chunk)) !== null) out[name] = `sha256:${hash.digest("hex")}`;
      } finally {
        closeSync(opened.fd);
      }
    }
    return out;
  }

  /** `checks` sale de exactamente un `summary.json` de esta corrida; si no, `null` y el log dice por qué. */
  function checksOf(run, copied, say) {
    const glob = config.repos[run.repo].receipt?.summary;
    if (!glob) return null;
    const pattern = anchored(glob.split("*").map((piece) => piece.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*"));
    const found = copied.filter((path) => pattern.test(path));
    if (found.length !== 1) {
      say(`recibo sin checks: ${found.length} archivos ${glob} de esta corrida`);
      return null;
    }
    try {
      const { results } = JSON.parse(readFileSync(join(runDir(run.id), "artifacts", found[0]), "utf8"));
      if (!Array.isArray(results) || results.length > MAX_CHECKS) throw new Error("results no es una lista acotada");
      return results.map(({ name, status, seconds }) => {
        if (typeof name !== "string" || !name || name.length > 128 || !CHECK_STATES.has(status)) throw new Error(`entrada inválida: ${JSON.stringify(name)?.slice(0, 64)}`);
        return { name, status, seconds: Number.isFinite(seconds) ? seconds : null };
      });
    } catch (error) {
      say(`recibo sin checks: ${found[0]} no es válido (${error.message})`);
      return null;
    }
  }

  function toolchainOf(repo, lane, env, checkout) {
    try {
      return runner(repo, lane).sync(["rustc", "-V"], checkout, env).trim() || null;
    } catch {
      return null;
    }
  }

  /** El SHA-256 va sobre los bytes que se sirven, fuera del recibo: no hay que canonizar nada. */
  function writeReceipt(run, extra) {
    const receipt = {
      repo: run.repo,
      commit: run.commit,
      tree: run.tree,
      parents: run.parents,
      head: run.head,
      wip: run.wip,
      base: run.base,
      command: run.command,
      queue: queueName,
      lane: run.lane === null ? null : String(run.lane),
      lane_previous_commit: extra.previous ?? null,
      toolchain: extra.toolchain ?? null,
      started_at: run.startedAt,
      finished_at: run.finishedAt,
      state: run.state,
      exit_code: run.exitCode,
      checks_source: "run",
      checks: extra.checks ?? null,
      known_failures: (extra.checks ?? []).filter((check) => check.status === "KNOWN").map((check) => check.name),
      artifacts: extra.artifacts ?? {},
    };
    const bytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`);
    writeFileSync(receiptPath(run.id), bytes);
    return createHash("sha256").update(bytes).digest("hex");
  }

  async function execute(queued, laneIndex, current) {
    let run = { ...queued, state: "running", lane: laneIndex, startedAt: new Date().toISOString() };
    const since = Date.now();
    saveRun(run);
    const out = createWriteStream(logPath(run.id), { flags: "a" });
    await new Promise((resolve) => out.once("open", resolve));
    const say = (line) => writeFileSync(out.fd, `[cola] ${line}\n`);
    const finish = (state, exitCode) => {
      run = { ...run, state, exitCode, finishedAt: new Date().toISOString() };
      saveRun(run);
    };
    const extra = {};
    try {
      const profile = config.repos[run.repo];
      const lane = runner(run.repo, laneIndex);
      const { checkout, target } = ensureLane(run.repo, laneIndex);
      const insideTarget = profile.target === "checkout";
      const dropTarget = () => lane.sync(["rm", "-rf", target], "/");
      try {
        extra.previous = laneGit(run.repo, laneIndex, ["rev-parse", "--verify", "-q", "HEAD"]).trim() || null;
      } catch {
        extra.previous = null;
      }
      // Solo reescribe lo que difiere del commit anterior: un archivo tocado es un cambio para cargo.
      const clean = () => {
        lane.sync(["rm", "-f", join(checkout, ".git/index.lock")], "/");
        laneGit(run.repo, laneIndex, ["fetch", "-q", "--no-tags", "--no-write-fetch-head", mirrorPath(run.repo), `+refs/verify/${run.commit}:refs/verify/run`]);
        laneGit(run.repo, laneIndex, ["checkout", "-q", "-f", "--detach", run.commit]);
        laneGit(run.repo, laneIndex, ["clean", "-q", "-ffdx", ...(insideTarget ? ["-e", "/target"] : [])]);
      };
      if (diskPercent(home) > DISK_LIMIT_PERCENT) {
        say(`disco al ${diskPercent(home)} %: borro la target de ${run.repo}`);
        dropTarget();
        run = { ...run, targetRebuilt: true };
      }
      clean();
      for (const path of profile.fresh ?? []) lane.sync(["rm", "-rf", join(checkout, path)], "/");
      say(`${run.repo} ${run.commit} en ${checkout}${lane.user ? ` como ${lane.user}` : ""}: ${run.command}`);
      const values = { commit: run.commit, base: run.base, jobs: jobsFor() };
      const { argv, env: jobEnv } = checkRequest(run);
      const profileEnv = Object.fromEntries(Object.entries(profile.env ?? {}).map(([key, value]) => [key, substitute(value, values)]));
      const env = { ...profileEnv, ...jobEnv, ...laneEnv(run.repo, laneIndex) };
      let code = await attempt(run.repo, laneIndex, current, out.fd, argv, env, checkout);
      if (code !== 0 && !current.cancelled && !current.timedOut && diskPercent(home) > DISK_LIMIT_PERCENT && !run.targetRebuilt) {
        say(`falló con el disco al ${diskPercent(home)} %: borro la target y recompilo una vez`);
        dropTarget();
        clean();
        run = { ...run, targetRebuilt: true };
        code = await attempt(run.repo, laneIndex, current, out.fd, argv, env, checkout);
      }
      if (lane.sweep(null)) {
        const copied = collect(run, checkout, since);
        if (copied.length) say(`artefactos: ${copied.join(", ")}`);
        extra.checks = checksOf(run, copied, say);
        extra.artifacts = digests(run, checkout);
      } else say(`quedan procesos de ${lane.user}: no copio artefactos`);
      if (profile.env?.RUSTUP_TOOLCHAIN || profile.jobs) extra.toolchain = toolchainOf(run.repo, laneIndex, env, checkout);
      if (current.cancelled) finish("cancelled", null);
      else {
        if (current.timedOut) say(`pasó de su plazo de ${Math.round(runTimeoutMs / 60_000)} min`);
        finish(code === 0 ? "passed" : "failed", code);
      }
      clean();
      laneGit(run.repo, laneIndex, ["gc", "-q", "--prune=1.day.ago"]);
      say(`terminó: ${run.state}${run.exitCode === null ? "" : ` (exit ${run.exitCode})`}`);
    } catch (error) {
      say(error.message);
      if (!FINISHED.has(run.state)) finish("failed", 1);
    } finally {
      try {
        run = { ...run, receiptSha256: writeReceipt(run, extra) };
        saveRun(run);
      } catch (error) {
        say(`sin recibo: ${error.message}`);
      }
      await new Promise((resolve) => out.end(resolve));
    }
  }

  function cancel(id) {
    const run = readRun(id);
    if (run.state === "queued") saveRun({ ...run, state: "cancelled", finishedAt: new Date().toISOString() });
    else if (run.state === "running") {
      const current = [...active.values()].find((entry) => entry.id === id);
      if (current) {
        current.cancelled = true;
        current.kill();
      }
    }
    return readRun(id);
  }

  /** Lo que corría cuando la cola cayó ya no tiene dueño: se mata, se dice, y no se reintenta. */
  function recover() {
    for (const repo of Object.keys(config.repos ?? {})) if (config.repos[repo].user) for (let lane = 0; lane < lanes; lane += 1) runner(repo, lane).sweep(null);
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
  const receiptBytes = (id) => (existsSync(receiptPath(id)) ? readFileSync(receiptPath(id)) : null);

  return { submit, cancel, recover, readRun, receiptBytes, allRuns, hasRun, knownCommits, position, logPath, lanePaths, settled, lanes, home, incomingDir };
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
    const [repo, commit, command, base] = ["repo", "commit", "command", "base"].map((key) => url.searchParams.get(key) ?? undefined);
    const wip = url.searchParams.get("wip") === "1";
    const incoming = join(queue.incomingDir, `${randomBytes(4).toString("hex")}.bundle`);
    try {
      let size = 0;
      request.on("data", (chunk) => {
        size += chunk.length;
        if (size > MAX_BUNDLE_BYTES) request.destroy(new Error("bundle demasiado grande"));
      });
      await pipeline(request, createWriteStream(incoming, { mode: 0o600 }));
      const run = await queue.submit({ repo, commit, command, base: base ?? null, wip, bundle: size ? incoming : null });
      return send(response, 201, { id: run.id, position: queue.position(run.id) });
    } finally {
      rmSync(incoming, { force: true });
    }
  }
  if (parts[0] === "runs" && parts[1]) {
    if (!queue.hasRun(parts[1])) throw new Refusal(404, `no existe la corrida ${parts[1]}`);
    if (request.method === "GET" && parts.length === 2) return send(response, 200, { ...queue.readRun(parts[1]), position: queue.position(parts[1]) });
    if (request.method === "POST" && parts[2] === "cancel") return send(response, 200, queue.cancel(parts[1]));
    if (request.method === "GET" && parts[2] === "receipt" && parts.length === 3) {
      const bytes = queue.receiptBytes(parts[1]);
      if (!bytes) throw new Refusal(409, `la corrida ${parts[1]} aún no tiene recibo`);
      response.writeHead(200, { "content-type": "application/json", "x-receipt-sha256": createHash("sha256").update(bytes).digest("hex") });
      return response.end(bytes);
    }
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
  const queue = createQueue({ home, config, ...(process.env.VERIFY_QUEUE_NAME ? { queueName: process.env.VERIFY_QUEUE_NAME } : {}) });
  queue.recover();
  createHttpServer(queue).listen(port, "127.0.0.1", () => console.log(`verify-queue en 127.0.0.1:${port}`));
}
