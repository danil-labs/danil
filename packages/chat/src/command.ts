/**
 * Cómo se lee un comando: qué programa corrió, sin el envoltorio con el que se
 * lanzó.
 *
 * Un agente no manda `git status`; manda `/bin/bash -lc 'cd /repo && git status'`,
 * o `env FOO=1 sudo -u root timeout 30 pnpm test`. En la fila eso se leía como
 * «Corrió bin/bash», que no dice nada y además es falso: el acto es `git status`.
 *
 * La regla es la de t3code: **la fila nombra el programa y su primer tramo**; el
 * comando completo vive al desplegarla. Aquí se parte por `|`, `&&`, `;` y
 * salto de línea sin romper comillas, se saltan los envoltorios conocidos
 * —`env`, `sudo`, `timeout`, `nohup`, `command`, `exec`, `time`, `arch`— y los
 * intérpretes con `-c`/`-lc` (POSIX y PowerShell), y se descartan los tramos que
 * no son un acto (`cd`, `export`, `set`, `test`…).
 *
 * Si las comillas no cierran, no se adivina: se devuelve el texto tal cual. Pasa
 * cuando el agente censura credenciales y se lleva la barra de una comilla.
 */

/** Los intérpretes cuyo `-c`/`-lc` lleva el guion de verdad. */
const SHELLS = new Set(["sh", "bash", "zsh", "dash", "ash", "ksh", "fish", "pwsh", "powershell", "cmd"]);

/** Envoltorios que se saltan enteros para llegar al programa. */
const WRAPPERS = new Set(["env", "sudo", "timeout", "gtimeout", "nice", "nohup", "command", "builtin", "exec", "arch", "script", "bundle", "stdbuf", "time"]);

/** Los programas que no son un acto: solo acomodan lo que sigue. */
const SETUP = new Set(["cd", "pushd", "popd", "export", "set", "unset", "local", "declare", "typeset", "readonly", "alias", "unalias", "source", ".", ":", "true", "false", "test", "[", "[[", "then", "do", "else", "eval"]);

/** Opciones de cada envoltorio que se comen el argumento siguiente. */
const VALUE_FLAGS: Record<string, ReadonlySet<string>> = {
  env: new Set(["-u", "-C", "-S", "--unset", "--chdir", "--split-string"]),
  sudo: new Set(["-u", "-g", "-C", "-D", "-p", "--user", "--group", "--chdir", "--close-from"]),
  nice: new Set(["-n", "--adjustment"]),
  timeout: new Set(["-s", "-k", "--signal", "--kill-after"]),
  gtimeout: new Set(["-s", "-k", "--signal", "--kill-after"]),
};

/** Las de un intérprete que se comen el argumento siguiente. */
const SHELL_VALUE_FLAGS = new Set(["-o", "-O", "--rcfile", "--init-file"]);

/** El programa sin su ruta: `/bin/bash` es `bash`. */
const program = (token: string) => token.split(/[\\/]/).filter(Boolean).pop() ?? token;

/** Parte en el primer separador de shell que no esté entre comillas ni dentro de `$( )`. */
function splitFirst(command: string): { first: string; rest: string } {
  let quote: '"' | "'" | null = null;
  let escaping = false;
  let depth = 0;

  for (let i = 0; i < command.length; i++) {
    const char = command[i]!;
    if (escaping) {
      escaping = false;
      continue;
    }
    if (char === "\\" && quote !== "'") {
      escaping = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "(") depth++;
    else if (char === ")" && depth > 0) depth--;
    else if (depth === 0 && (char === "\n" || char === ";" || char === "|" || char === "&")) {
      const twice = command[i + 1] === char || (char === "|" && command[i + 1] === "&");
      return { first: command.slice(0, i), rest: command.slice(i + (twice ? 2 : 1)) };
    }
  }

  return { first: command, rest: "" };
}

/** Las palabras de un tramo, con las comillas ya quitadas. `null` si no cierran. */
function tokenize(segment: string): string[] | null {
  const tokens: string[] = [];
  let current = "";
  let started = false;
  let quote: '"' | "'" | null = null;
  let escaping = false;

  for (const char of segment) {
    if (escaping) {
      current += char;
      escaping = false;
      started = true;
      continue;
    }
    if (char === "\\" && quote !== "'") {
      escaping = true;
      started = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
      started = true;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      started = true;
      continue;
    }
    if (/\s/.test(char)) {
      if (started) {
        tokens.push(current);
        current = "";
        started = false;
      }
      continue;
    }
    current += char;
    started = true;
  }

  if (quote || escaping) return null;
  if (started) tokens.push(current);
  return tokens;
}

/** En qué índice está el guion de un intérprete (`-c`, `-lc`, `--command`), o `null`. */
function scriptIndex(tokens: readonly string[], from: number): number | null {
  for (let i = from; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token === "--") return null;
    if (!token.startsWith("-")) return null;
    if (token === "--command" || /^-[a-z]*c[a-z]*$/i.test(token)) return i + 1;
    if (SHELL_VALUE_FLAGS.has(token)) i++;
  }
  return null;
}

/** Dónde empieza el programa detrás de un envoltorio, saltándose sus opciones. */
function afterWrapper(name: string, tokens: readonly string[], from: number): number {
  let i = from;
  let skippedValue = false;
  while (i < tokens.length) {
    const token = tokens[i]!;
    if (token === "--") return i + 1;
    if (VALUE_FLAGS[name]?.has(token)) {
      i += 2;
      continue;
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(token)) {
      i++;
      continue;
    }
    if (token.startsWith("-")) {
      i++;
      continue;
    }
    // `timeout 30 cmd` y `script -q out cmd` se comen un operando antes del programa.
    if ((name === "timeout" || name === "gtimeout" || name === "script") && !skippedValue) {
      skippedValue = true;
      i++;
      continue;
    }
    return i;
  }
  return i;
}

type Found =
  /** El tramo entero es un envoltorio o una redirección: no es un acto. */
  | { kind: "skip" }
  /** El tramo lanza otra cosa: `sh -c`, `pwsh -c`. */
  | { kind: "payload"; text: string }
  /** El acto, con su programa y sus palabras. */
  | { kind: "program"; at: number; name: string }
  | { kind: "none" };

/** Qué es el primer tramo: el programa, un guion que hay que abrir, o nada. */
function read(tokens: readonly string[]): Found {
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i]!;
    if (/^\d*[<>]/.test(token) || token.startsWith("&>")) return { kind: "skip" };
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(token)) {
      i++;
      continue;
    }
    const name = program(token);
    if (WRAPPERS.has(name)) {
      i = afterWrapper(name, tokens, i + 1);
      continue;
    }
    if (SHELLS.has(name.toLowerCase())) {
      const at = scriptIndex(tokens, i + 1);
      const text = at === null ? undefined : tokens[at];
      return text ? { kind: "payload", text: text.charAt(0) === "$" ? text.slice(1) : text } : { kind: "none" };
    }
    // `cd`, `export`, `set`… solo preparan lo que sigue: el acto está después.
    if (SETUP.has(name)) return { kind: "skip" };
    return { kind: "program", at: i, name };
  }
  return { kind: "skip" };
}

/** El primer tramo que sí es un acto, ya sin envoltorios ni preparativos. */
function meaningful(command: string, depth = 0): { text: string; program: string | null } | null {
  if (depth > 6) return null;
  const { first, rest } = splitFirst(command.trim());
  const tokens = tokenize(first);
  if (!tokens) return { text: first.trim(), program: null };
  if (tokens.length === 0) return rest ? meaningful(rest, depth + 1) : null;

  const found = read(tokens);
  switch (found.kind) {
    case "payload":
      return meaningful(found.text, depth + 1);
    case "program": {
      // Las redirecciones no se leen —`2>&1` es fontanería— y una palabra con
      // espacios vuelve entre comillas: al quitar las de shell se perdería
      // dónde empieza y acaba.
      const words = tokens
        .slice(found.at)
        .filter((word) => !/^\d*[<>]/.test(word))
        .map((word) => (/\s/.test(word) ? JSON.stringify(word) : word));
      return { text: words.join(" "), program: found.name };
    }
    case "skip":
      return rest ? meaningful(rest, depth + 1) : null;
    default:
      return null;
  }
}

/**
 * El comando tal como corrió, sin el intérprete que lo lanzó y sin inventarle
 * nada: el cuerpo desplegado de la fila es la transcripción que se aprueba. El
 * `cd … &&` de preparación se queda aquí; la fila lo salta con
 * `commandSummary`.
 */
export function bareCommand(cmd: string) {
  const trimmed = cmd.trim();
  const { first, rest } = splitFirst(trimmed);
  const tokens = tokenize(first);
  const name = tokens?.[0] ? program(tokens[0]) : "";
  const at = SHELLS.has(name.toLowerCase()) && !rest ? scriptIndex(tokens!, 1) : null;
  return at !== null && tokens && at === tokens.length - 1 ? tokens[at]!.trim() : trimmed;
}

/**
 * Lo que la fila escribe en su sujeto: el primer tramo con acto, sin el
 * envoltorio. «Corrió pnpm verify», no «Corrió /bin/bash -lc '…'».
 */
export function commandSummary(cmd: string, max = 64) {
  const first = meaningful(cmd);
  if (!first) return bareCommand(cmd).split("\n")[0] ?? "";
  const text = first.text.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** El programa del acto, sin ruta ni argumentos: `git`, `pnpm`, `rg`. */
export function commandProgram(cmd: string) {
  return meaningful(cmd)?.program ?? null;
}
