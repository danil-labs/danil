/**
 * `pnpm verify --remote`: manda un commit a la cola de una máquina y sigue su corrida.
 *
 * El servidor es `verify-queue/server.mjs`. Lo que viaja es un commit, nunca el árbol
 * de trabajo, y la corrida sigue en la máquina aunque este proceso muera.
 * La cola escucha en loopback: `VERIFY_REMOTE_HOST=máquina` llega por túnel SSH y
 * `VERIFY_REMOTE_HOST=host:puerto` usa un puerto ya abierto, como un túnel de SSM.
 * Corre igual en Windows: sin shell, y el commit viaja por HTTP desde un archivo
 * porque un pipe de PowerShell 5.1 corrompe binarios.
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, openAsBlob, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const REPO = "terminus";
const DEFAULT_HOST = "vm-verify";
const SSH_USER = "verify";
const QUEUE_PORT = 8787;
const DEFAULT_REGION = "us-east-1";
const COMMAND_TIMEOUT_MS = 60_000;
const BUNDLE_TIMEOUT_MS = 5 * 60_000;
const HEALTH_TIMEOUT_MS = 5_000;
const POLL_TIMEOUT_MS = 30_000;
const UPLOAD_TIMEOUT_MS = 10 * 60_000;
const TUNNEL_TIMEOUT_MS = 15_000;
const WAKE_TIMEOUT_MS = 4 * 60_000;
const WAKE_RETRY_MS = 15_000;
const LOST_AFTER_MS = 2 * 60_000;
const POLL_MS = 2_000;

const CLI_FALLBACK = new Set(["machine_account", "machine_unreachable", "identity_unavailable"]);
const CLI_REFUSED = {
  access_denied: "tu cuenta ve la máquina, pero no puede encenderla.",
  license_required: "tu cuenta no tiene licencia de Danil.",
  not_found: "tu cuenta no la ve; la máquina es de una organización de la que debes ser miembro.",
};

class RemoteError extends Error {}

const accessHelp = (host) =>
  `No hay acceso a la cola en ${host}.\n` +
  "  La cola es para el equipo de Danil dentro de su tailnet. Sin ese acceso, verifica en local con `pnpm verify`.\n" +
  `  Con acceso, comprueba Tailscale con \`ssh ${SSH_USER}@${host}\`. Si la máquina está apagada, encenderla pide sesión de Danil en \`danil\` o \`terminus\` o, de respaldo, credenciales de AWS en esta sesión.`;

const noSshHelp =
  "No encontré ssh en el PATH.\n" +
  "  En Windows es el cliente de OpenSSH: Configuración > Aplicaciones > Características opcionales.\n" +
  "  Sin él, verifica en local con `pnpm verify`.";

const noTailnetHelp = (host) =>
  `No resuelvo ${host}: Tailscale no está conectado aquí, o esta máquina no tiene acceso a la cola.\n` +
  "  Sin acceso al tailnet del equipo, verifica en local con `pnpm verify`.";

function parse(argv) {
  const options = { noCargo: false, commit: null, attach: null, cancel: null, status: false, detach: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--remote") continue;
    else if (arg === "--no-cargo") options.noCargo = true;
    else if (arg === "--status") options.status = true;
    else if (arg === "--detach") options.detach = true;
    else if (arg === "--commit" || arg === "--attach" || arg === "--cancel") {
      const value = argv[(i += 1)];
      if (!value) throw new RemoteError(`${arg} necesita un valor`);
      options[arg.slice(2)] = value;
    } else throw new RemoteError(`--remote no acepta ${arg}`);
  }
  return options;
}

function git(args) {
  const result = spawnSync("git", args, { encoding: "utf8", timeout: BUNDLE_TIMEOUT_MS, killSignal: "SIGKILL", windowsHide: true });
  if (result.status !== 0) throw new RemoteError(`git ${args[0]}: ${(result.stderr || result.error?.message || "").trim()}`);
  return result.stdout.trim();
}

const hasCommit = (sha) => spawnSync("git", ["cat-file", "-e", `${sha}^{commit}`], { timeout: COMMAND_TIMEOUT_MS, windowsHide: true }).status === 0;

async function request(base, path, init = {}, timeoutMs = POLL_TIMEOUT_MS) {
  const response = await fetch(`${base}${path}`, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  if (response.ok) return response;
  const body = await response.json().catch(() => ({}));
  throw new RemoteError(body.error ?? `la cola respondió ${response.status}`);
}

const json = async (...args) => (await request(...args)).json();

async function health(base) {
  try {
    return await json(base, "/health", {}, HEALTH_TIMEOUT_MS);
  } catch {
    return null;
  }
}

const freePort = () =>
  new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });

/** Un puerto ya abierto, o un túnel SSH que se reabre si cae: la corrida no depende de él. */
async function openLink(host) {
  if (host.includes(":")) return { base: `http://${host}`, up: async () => {}, problem: () => null };
  const port = await freePort();
  const local = `127.0.0.1:${port}:127.0.0.1:${QUEUE_PORT}`;
  let tunnel = null;
  let errors = "";
  let missing = false;
  process.once("exit", () => tunnel?.kill());
  return {
    base: `http://127.0.0.1:${port}`,
    problem() {
      if (missing) return noSshHelp;
      if (/could not resolve hostname/i.test(errors)) return noTailnetHelp(host);
      return /permission denied|not allowed|tailnet policy/i.test(errors) ? accessHelp(host) : null;
    },
    async up() {
      if (tunnel) return;
      errors = "";
      const child = spawn(process.env.VERIFY_REMOTE_SSH ?? "ssh", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "-o", "ExitOnForwardFailure=yes", "-o", "ServerAliveInterval=5", "-o", "ServerAliveCountMax=2", "-o", "StrictHostKeyChecking=accept-new", "-N", "-L", local, `${SSH_USER}@${host}`], { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
      tunnel = child;
      child.stderr.on("data", (chunk) => { errors += chunk; });
      child.once("error", (error) => {
        missing = error.code === "ENOENT";
        tunnel = null;
      });
      child.once("close", () => { tunnel = null; });
      const deadline = Date.now() + TUNNEL_TIMEOUT_MS;
      while (tunnel === child && Date.now() < deadline) {
        if (await health(`http://127.0.0.1:${port}`)) return;
        await sleep(200);
      }
    },
  };
}

/** El orden de intento; un `.cmd` o `.bat` no arranca sin shell y cuenta como ausente, el `.exe` lo resuelve spawnSync. */
function machineClis(machine, env) {
  const start = ["machine", "start", machine, "--json"];
  if (env.VERIFY_REMOTE_TERMINUS) return [[env.VERIFY_REMOTE_TERMINUS, start]];
  // El grupo público es `machines`. `terminus machine start` se queda: el motor
  // instalado puede no conocer `machines` todavía, y ese caso sigue de largo.
  return [[env.DANIL_CLI || "danil", ["machines", ...start]], [env.TERMINUS_CLI || "terminus", start]];
}

/** `absent` sigue con el siguiente CLI; `fallback` va directo a aws. */
function cliStart(cli, args, machine) {
  const result = spawnSync(cli, args, { encoding: "utf8", timeout: COMMAND_TIMEOUT_MS, killSignal: "SIGKILL", windowsHide: true });
  let envelope = null;
  try {
    envelope = JSON.parse(result.stdout);
  } catch {
    return { state: "absent" };
  }
  const error = envelope?.error;
  if (!error) return { state: envelope?.result ? "started" : "absent" };
  if (error.code === "invalid_request" || error.detail?.reason === "legacy_environment") return { state: "absent" };
  if (error.code === "computer_stopping") return { state: "retry" };
  if (CLI_FALLBACK.has(error.code)) return { state: "fallback", reason: error.code };
  const words = CLI_REFUSED[error.code] ?? `el CLI respondió ${error.code}.`;
  return { state: "failed", message: `No puedo encender ${machine}: ${words}\n  Verifica en local con \`pnpm verify\`.` };
}

/** Con las credenciales de quien lanza: la máquina no guarda ninguna. */
function awsStart(host, env) {
  const aws = env.VERIFY_REMOTE_AWS ?? "aws";
  // El ID de la instancia no vive en este repo público: lo da quien tiene las credenciales.
  const instance = env.VERIFY_REMOTE_INSTANCE;
  if (!instance) return { state: "failed", message: `${accessHelp(host)}\n  El respaldo por aws necesita el ID de la instancia en VERIFY_REMOTE_INSTANCE.` };
  const region = env.VERIFY_REMOTE_REGION ?? DEFAULT_REGION;
  const result = spawnSync(aws, ["ec2", "start-instances", "--region", region, "--instance-ids", instance], { encoding: "utf8", timeout: COMMAND_TIMEOUT_MS, killSignal: "SIGKILL", windowsHide: true });
  if (result.status === 0) return { state: "started" };
  return /IncorrectInstanceState/.test(result.stderr) ? { state: "retry" } : { state: "failed", message: accessHelp(host) };
}

/** Cada llamada es un intento y sigue con el CLI que ya respondió: uno que falla puede tardar un minuto. */
export function createWake(host, env = process.env) {
  const machine = host.includes(":") ? DEFAULT_HOST : host;
  const clis = machineClis(machine, env);
  let reason = null;
  return () => {
    while (clis.length) {
      const [cli, args] = clis[0];
      const outcome = cliStart(cli, args, machine);
      if (outcome.state === "absent") {
        clis.shift();
        reason = "no hay CLI con `machine`";
      } else if (outcome.state === "fallback") {
        clis.length = 0;
        reason = outcome.reason;
      } else return outcome;
    }
    if (reason) console.log(`  Sin encendido por sesión de Danil (${reason}); uso aws.`);
    reason = null;
    return awsStart(host, env);
  };
}

async function connect(link, host) {
  await link.up();
  const first = await health(link.base);
  if (first) return first;
  if (link.problem()) throw new RemoteError(link.problem());
  console.log(`  La cola no responde en ${host}; intento encender la máquina.`);
  const wake = createWake(host);
  const deadline = Date.now() + WAKE_TIMEOUT_MS;
  let nextWake = 0;
  let accepted = false;
  while (Date.now() < deadline) {
    if (Date.now() >= nextWake) {
      nextWake = Date.now() + WAKE_RETRY_MS;
      const { state, message } = wake();
      accepted ||= state === "started";
      if (state === "failed" && !accepted) throw new RemoteError(message);
    }
    await sleep(POLL_MS * 2);
    await link.up();
    const answer = await health(link.base);
    if (answer) return answer;
  }
  throw new RemoteError(accessHelp(host));
}

const removeBundle = (dir) => rmSync(dir, { recursive: true, force: true, maxRetries: 3 });

async function bundleFor(commit, known) {
  const dir = mkdtempSync(join(tmpdir(), "verify-remote-"));
  const file = join(dir, "commit.bundle");
  const ref = `refs/verify-remote/${commit}-${process.pid}`;
  try {
    git(["update-ref", ref, commit]);
    git(["bundle", "create", "-q", file, ref, ...known.filter(hasCommit).map((sha) => `^${sha}`)]);
    return { body: await openAsBlob(file), done: () => removeBundle(dir) };
  } catch (error) {
    removeBundle(dir);
    throw error;
  } finally {
    spawnSync("git", ["update-ref", "-d", ref], { timeout: COMMAND_TIMEOUT_MS, windowsHide: true });
  }
}

async function submit(base, commit, command) {
  const { commits } = await json(base, `/repos/${REPO}/commits`);
  const bundle = commits.includes(commit) ? null : await bundleFor(commit, commits);
  try {
    const query = new URLSearchParams({ repo: REPO, commit, command });
    const init = { method: "POST", ...(bundle ? { body: bundle.body } : {}) };
    return await json(base, `/runs?${query}`, init, UPLOAD_TIMEOUT_MS);
  } finally {
    bundle?.done();
  }
}

/** La máquina pudo apagarse justo al llegar el commit: se enciende y se manda una vez más. */
async function submitOnce(link, host, commit, command) {
  try {
    return await submit(link.base, commit, command);
  } catch (error) {
    if (error instanceof RemoteError) throw error;
    await connect(link, host);
    return submit(link.base, commit, command);
  }
}

function resumeHint(id) {
  console.error(`\n  La corrida ${id} sigue en la máquina. Retómala con \`pnpm verify --remote --attach ${id}\`.`);
}

async function follow(link, id) {
  const { base } = link;
  let offset = 0;
  let lastPosition = null;
  let lastContact = Date.now();
  for (;;) {
    try {
      const run = await json(base, `/runs/${id}`);
      const chunk = Buffer.from(await (await request(base, `/runs/${id}/log?offset=${offset}`)).arrayBuffer());
      lastContact = Date.now();
      offset += chunk.length;
      if (chunk.length) process.stdout.write(chunk);
      if (run.state === "queued" && run.position !== lastPosition) {
        console.log(`  En cola: ${run.position === 0 ? "sigue" : `${run.position} antes`}.`);
        lastPosition = run.position;
      }
      if (!["queued", "running"].includes(run.state)) return run;
    } catch (error) {
      if (error instanceof RemoteError) throw error;
      if (Date.now() - lastContact > LOST_AFTER_MS) {
        resumeHint(id);
        throw new RemoteError("Se perdió la conexión con la cola.");
      }
      await link.up();
    }
    await sleep(POLL_MS);
  }
}

function report(run, platform, host) {
  const name = { linux: "Linux", darwin: "macOS", win32: "Windows" }[platform] ?? platform;
  const others = ["Linux", "macOS", "Windows"].filter((other) => other !== name).join(" y ");
  const words = { passed: "pasó", failed: `falló (exit ${run.exitCode})`, cancelled: "se canceló", interrupted: "se interrumpió: la cola se reinició" };
  console.log(`\n  Corrida remota ${run.id} ${words[run.state]}: ${run.commit.slice(0, 10)}, «${run.command}», ${name} en ${host}.`);
  console.log(`  ${others} NO se comprobó: una corrida --remote nunca cuenta por ellos.\n`);
  if (run.state === "passed") return 0;
  return run.state === "failed" ? run.exitCode : 1;
}

export async function runRemote(argv) {
  const host = process.env.VERIFY_REMOTE_HOST ?? DEFAULT_HOST;
  try {
    const options = parse(argv);
    const link = await openLink(host);
    const { base } = link;
    if (options.cancel) {
      await link.up();
      const run = await json(base, `/runs/${options.cancel}/cancel`, { method: "POST" });
      console.log(`  Corrida ${run.id}: ${run.state}.`);
      return 0;
    }
    const { platform, runs } = await connect(link, host);
    if (options.status) {
      if (!runs.length) console.log("  La cola está vacía.");
      for (const run of runs) console.log(`  ${run.id} ${run.state} ${run.repo} ${run.commit.slice(0, 10)} «${run.command}»`);
      return 0;
    }
    if (options.attach) return report(await follow(link, options.attach), platform, host);

    if (!options.commit && git(["status", "--porcelain"])) throw new RemoteError("Hay cambios sin commit y la corrida solo lleva commits. Haz commit, o nombra uno con --commit <sha>.");
    const commit = git(["rev-parse", "--verify", `${options.commit ?? "HEAD"}^{commit}`]);
    const command = options.noCargo ? "pnpm verify --no-cargo" : "pnpm verify";
    const { id } = await submitOnce(link, host, commit, command);
    console.log(`  Corrida ${id}: ${commit.slice(0, 10)}, «${command}», en ${host}.`);
    if (options.detach) {
      resumeHint(id);
      return 0;
    }
    for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
      process.on(signal, () => {
        resumeHint(id);
        process.exit(130);
      });
    }
    return report(await follow(link, id), platform, host);
  } catch (error) {
    const known = error instanceof RemoteError;
    console.error(`\n  ${known ? error.message : accessHelp(host)}${known ? "" : `\n  (${error.message})`}\n`);
    return 2;
  }
}
