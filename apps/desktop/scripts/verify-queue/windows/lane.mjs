#!/usr/bin/env node
/**
 * Lo que en Linux hace `sudo -u <usuario> -- env -i …`, del lado del usuario del carril en
 * Windows. Llega por el sshd de la cola con una petición en base64url:
 *
 *   { argv, env, cwd }  corre argv con solo ese entorno (más lo que Windows necesita) y sale con su exit
 *   { sweep: true }     mata los procesos de este usuario salvo la cadena que lo llamó; 0 si no queda nada
 *
 * `rm` y `mkdir` son de aquí: la cola los pide como en Linux.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { delimiter, dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

// El perfil y el checkout son de la rama: nada se busca ni se carga desde ellos.
process.chdir(dirname(fileURLToPath(import.meta.url)));

/** Lo mínimo para que arranquen cmd, git, node y el enlazador de MSVC; nada del perfil del usuario. */
const SYSTEM_ENV = ["SystemRoot", "windir", "SystemDrive", "ComSpec", "PATHEXT", "OS", "NUMBER_OF_PROCESSORS", "PROCESSOR_ARCHITECTURE", "PROCESSOR_IDENTIFIER", "PROCESSOR_LEVEL", "PROCESSOR_REVISION", "ProgramData", "ProgramFiles", "ProgramFiles(x86)", "ProgramW6432", "CommonProgramFiles", "CommonProgramFiles(x86)", "CommonProgramW6432", "ALLUSERSPROFILE", "PUBLIC", "USERNAME", "USERDOMAIN", "COMPUTERNAME"];

/** El entorno de Windows no distingue mayúsculas: `Path` y `PATH` son la misma variable. */
function environment(requested) {
  const out = new Map();
  const put = (key, value) => out.set(key.toUpperCase(), [key, value]);
  const own = new Map(Object.entries(process.env).map(([key, value]) => [key.toUpperCase(), value]));
  for (const key of SYSTEM_ENV) if (own.has(key.toUpperCase())) put(key, own.get(key.toUpperCase()));
  for (const [key, value] of Object.entries(requested ?? {})) put(key, value);
  // HOME, TMPDIR y XDG_DATA_HOME del carril, con sus nombres de Windows: nada cae en el perfil de C:.
  if (requested?.HOME) {
    put("USERPROFILE", requested.HOME);
    put("APPDATA", join(requested.HOME, "AppData", "Roaming"));
  }
  if (requested?.TMPDIR) {
    put("TEMP", requested.TMPDIR);
    put("TMP", requested.TMPDIR);
  }
  if (requested?.XDG_DATA_HOME) put("LOCALAPPDATA", requested.XDG_DATA_HOME);
  return Object.fromEntries(out.values());
}

function builtin(argv) {
  const [name, flag, ...paths] = argv;
  if (name === "rm" && (flag === "-rf" || flag === "-f")) {
    for (const path of paths) rmSync(path, { recursive: flag === "-rf", force: true, maxRetries: 5 });
    return true;
  }
  if (name === "mkdir" && flag === "-p") {
    for (const path of paths) mkdirSync(path, { recursive: true });
    return true;
  }
  return false;
}

/** El barrido lo hace `sweep.exe`, compilado por install.ps1 junto a este archivo: WMI está denegado en una sesión ssh. */
function sweep() {
  const result = spawnSync(join(process.cwd(), "sweep.exe"), [String(process.pid)], { encoding: "utf8", windowsHide: true, timeout: 120_000 });
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) console.error(`sin barrido: ${result.error.message}`);
  return result.status === 0 ? 0 : 1;
}

const request = JSON.parse(Buffer.from(process.argv[2] ?? "", "base64url").toString("utf8") || "{}");
if (request.sweep) process.exit(sweep());
if (!Array.isArray(request.argv) || !request.argv.length) {
  console.error("lane.mjs: petición sin argv");
  process.exit(2);
}
if (builtin(request.argv)) process.exit(0);
/** El ejecutable por el PATH de la corrida, nunca por el cwd: libuv mira antes el checkout, donde la rama pudo dejar un git.exe. */
function resolve(command, env) {
  if (isAbsolute(command)) return command;
  const path = Object.entries(env).find(([key]) => key.toUpperCase() === "PATH")?.[1] ?? "";
  const extensions = /\.[a-z0-9]+$/i.test(command) ? [""] : [".exe", ".com"];
  for (const dir of path.split(delimiter).filter(isAbsolute)) {
    for (const extension of extensions) if (existsSync(join(dir, command + extension))) return join(dir, command + extension);
  }
  console.error(`lane.mjs: ${command}: no está en el PATH de la corrida`);
  process.exit(127);
}

const cwd = request.cwd && request.cwd !== "/" ? request.cwd : undefined;
const env = environment(request.env);
const command = resolve(request.argv[0], env);
const args = request.argv.slice(1);
// cmd.exe no sigue las comillas de MSVCRT: la línea va tal cual tras /c.
const cmd = /(^|\\)cmd(\.exe)?$/i.test(command) && args.at(-2)?.toLowerCase() === "/c";
const child = spawn(command, cmd ? [...args.slice(0, -1), `"${args.at(-1)}"`] : args, { cwd, env, stdio: "inherit", windowsHide: true, windowsVerbatimArguments: cmd });
child.on("error", (error) => {
  console.error(`lane.mjs: ${command}: ${error.message}`);
  process.exit(127);
});
child.on("close", (code) => process.exit(code ?? 1));
