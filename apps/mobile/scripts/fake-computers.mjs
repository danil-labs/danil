#!/usr/bin/env node
/**
 * Un Danil Machines falso para probar la app sin la sesión de nadie:
 * el login de Supabase (`/auth/v1/token`), el plano de control
 * (`/v1/computers`, `/start`, `/v1/workspaces`, la memoria `/v1/workspaces/:id/memory/*`) y el relay (`/v1/computers/:id/session`, protocolo
 * v1 con espejo), sobre HTTP y WebSocket reales en localhost.
 *
 *   node apps/mobile/scripts/fake-computers.mjs [--port 8787] [--mac-off] [--license]
 *
 * Dos máquinas comparten el workspace «Producto» (cada motor con sus ids): la VM
 * de Danil (`aws-ec2`, apagada, con copia en el espejo) y una Mac propia
 * (`kind: physical`, encendida; apagada con `--mac-off`). `--workspace-mode <id>` le
 * pone a «Producto» un modo de permisos predeterminado. Cada una tiene su motor en memoria: tareas, un
 * agente, permisos y eventos; y lo que pide la app además de la lista: fijar y
 * archivar, el cuadro de escribir (modelos, permisos, `/`, `@`, ramas, `!` e
 * imágenes adjuntas con las reglas del motor) y las cuentas de IA con su
 * consumo y el inicio de sesión sin pantalla (enlace y código, por eventos
 * `account`). Para la app:
 *
 *   EXPO_PUBLIC_SUPABASE_URL=http://<ip>:8787 EXPO_PUBLIC_COMPUTERS_ENDPOINT=http://<ip>:8787 npm start
 *
 * y entrar con cualquier correo y contraseña. Sin dependencias.
 *
 * `--files <carpeta>` sirve esa carpeta como el árbol de cada tarea (`list_task_trees`,
 * `tree_files`, `tree_show`, `tree_read_part`), para probar el visor de archivos
 * con archivos de verdad; la primera respuesta de cada tarea nombra algunos.
 *
 * Para las pruebas, `POST /__fake/send?computer=cmp_mac` con `{ project, prompt,
 * session? }` manda un mensaje como otro dispositivo: crea la tarea (sin
 * `session`) o abre otro turno, con sus eventos por el relay.
 */
import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, openSync, readFileSync, readSync, readdirSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { join, relative, resolve } from "node:path";

const option = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const PORT = Number(option("port", "8787"));
const LICENSE = !process.argv.includes("--license");
const WAKE_MS = Number(option("wake-ms", "800"));
const WORKSPACE_MODE = option("workspace-mode", null);
const STEP_MS = Number(option("step-ms", "400"));
const TOKEN = "fake-jwt";
const FILES = option("files", null) ? resolve(option("files", "")) : null;
const INTENT = new Set(["send_message", "inject_message", "create_project", "start_project_clone", "create_agent", "create_agent_thread", "add_account", "login_account", "submit_login_code", "respond_permission", "answer_question", "answer_shell_output", "run_shell_command", "queue_ready", "resume_awaiting_quota", "recreate_task_work"]);
const MIRROR = new Set(["workspaces_startup", "list_workspaces", "list_projects", "list_spaces", "list_live_sessions", "list_agent_status", "list_providers", "load_session", "pending_requests", "list_active_turns", "list_live_turns", "list_workspace_attention", "list_agents", "list_agent_profiles", "archived_tasks"]);

// --- Motores --------------------------------------------------------------------

function engine(name, ws, projects, tasks, accounts) {
  const now = Date.now();
  const sessions = new Map(tasks.map((t, i) => [t.id, { ...t, created_at: now - (i + 1) * 60_000, updated_at: now - i * 60_000, turns: [{ id: `${t.id}-u`, role: "user", text: t.title }, { id: `${t.id}-a`, role: "agent", text: FILES ? `Hecho en ${name}. Revisa ![el informe](${FILES}/informe.pdf) y ![la demo](${FILES}/demo-app.mp4).` : `Hecho en ${name}.` }, ...(t.incoming ?? [])], pending: null }]));
  const spaces = [{ id: "s1", name: null, folders: [], created_at: now, updated_at: now }];
  return { name, ws, projects, sessions, spaces, awake: "agent", live: new Set(), cursor: 0, events: [], accounts, files: new Set(), logins: new Map(), gitObserved: new Set() };
}

const HOUR = 3_600_000;
/** El logo del workspace en la cuenta (`GET /v1/workspaces/:id/logo`); `--broken-logo` lo hace fallar y `--no-logo` lo quita. */
const LOGO_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAABjklEQVR42tXPSVIQQBBE0TxAHhAERBFQQGYUkBlUEAeQ8Y55CdjWriIXXRHV8db5q6EJtgZNsjXoDVuDptgaNM3WoBm2Br1la9AsW4PesTXoPVuD5tga9IGtQfNsDVpga9AiW4M+sjXoEy0vg597D7REy/APmPdAy7QM/4B5D7RCy/APmPdAn2kZ/gHzHmiVluEfMO+B1mgZ/gHzHmidluEfMO+BNmgZ/gHzHmiTluEfMO+BtmhJ8iULEbRNS5IvWYigHVqSfMlCBH2hJcmXLETQV1qSfMlCBO3SkuRLFiJoj5YkX7IQQfu0JPmShQj6RkuSL1mIoANaknzJQgQd0pLkSxYi6IiWJF+yEEHHtCT5koUIOqElyZcsRNApLUm+ZCGCzmhJ8iULEXROS5IvWYigC1qSfMlCBH2nJcmXLETQD1qSfMlCBP2kJcmXLETQJS1JvmQhgq7YGvSLrUHXbA36zdagP2wN+svWoH9sDbpha9AtW4P+szXojq1B92wNemBr0CNbg57YGvTM1l4B3PqAwlYG9wwAAAAASUVORK5CYII=", "base64");

const machines = {
  cmp_vm: {
    row: { computer_id: "cmp_vm", name: "VM de Danil", plan: "standard", provider: "aws-ec2", host_version: "0.3.0" },
    state: "offline",
    engine: engine("la VM", "w-prod", [{ id: "p-vm-web", name: "web" }], [
      { id: "t-vm-1", project: "p-vm-web", title: "Revisar el checkout", agent: "Ada", provider: "codex", model: "gpt-5.6" },
      { id: "t-vm-2", project: "p-vm-web", title: "Arreglar el login", agent: null, provider: "codex", model: "gpt-5.6", esperando: true },
    ], {
      claude: [{ id: "a-vm-1", label: "Trabajo", created_at: Date.now(), identity: "ana@example.com", authenticated_at: Date.now() }],
      codex: [],
    }),
    mirror: new Map(),
  },
  cmp_mac: {
    row: { computer_id: "cmp_mac", name: "Mac de Alberto", plan: null, provider: null, kind: "physical", host_version: "0.3.0" },
    state: process.argv.includes("--mac-off") ? "offline" : "online",
    engine: engine("la Mac", "w-prod", [{ id: "p-mac-web", name: "web" }, { id: "p-mac-api", name: "api" }], [
      { id: "t-mac-1", project: "p-mac-api", title: "Subir la API a v2", agent: null, provider: "claude", model: null, incoming: [
        // Inputs que no son de la persona: de un encargado y de otra tarea por el CLI.
        { id: "t-mac-1-in1", role: "user", text: "Revisa que el cliente siga usando /v1 antes de borrarlo.", agent: "Ada" },
        { id: "t-mac-1-in2", role: "user", text: "Listo: el login ya usa la API v2.", from_task: { folder: "p-mac-web", task: "t-mac-2", title: "Rediseñar el inicio", provider: "claude", model: "claude-opus-5-5" } },
      ] },
      { id: "t-mac-2", project: "p-mac-web", title: "Rediseñar el inicio", agent: null, provider: "claude", model: "claude-opus-5-5", unsaved: ["src/home.tsx"] },
    ], {
      claude: [{ id: "a-mac-1", label: "Cuenta 1", created_at: Date.now(), identity: "Ana@Example.com", authenticated_at: Date.now() }],
      codex: [],
    }),
    mirror: new Map(),
  },
};

// La Mac tiene un motor anterior a la UI nueva: no conoce Mantener despierta ni los puertos y contesta `command`, como el motor.
machines.cmp_mac.engine.older = new Set(["keep_awake_status", "set_keep_awake", "list_ports"]);

const row = (s) => ({
  id: s.id, title: s.title, provider: s.provider, model: s.model, last_message: s.turns.at(-1)?.text ?? null,
  created_at: s.created_at, updated_at: s.updated_at, esperando: Boolean(s.esperando), outcome: null, agent: s.agent, space: null,
  pinned: s.pinned ?? null, archived: s.archived ?? false,
});

const MODELS = {
  codex: [{ id: "gpt-5.6", label: "GPT-5.6", note: null, efforts: ["low", "medium", "high"], default_effort: "medium", gratis: null }],
  claude: [
    { id: "claude-opus-5-5", label: "Opus 5.5", note: { clave: "chat.model.note.opus" }, efforts: ["low", "medium", "high", "max"], default_effort: "high", gratis: null },
    { id: "claude-sonnet-5", label: "Sonnet 5", note: null, efforts: [], default_effort: null, gratis: null },
  ],
};
const IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const DOCUMENT_MIMES = new Set([
  "application/pdf", "text/plain", "text/markdown", "text/csv", "application/json",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.oasis.opendocument.text", "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.presentation", "application/rtf",
]);
const IMAGE_CAP = 25 * 1024 * 1024;

/** El inicio de sesión por tubería: Codex da enlace y código a comparar y termina solo; Claude pide pegar el código. */
function login(m, provider, id) {
  const e = m.engine;
  const account = e.accounts[provider]?.find((a) => a.id === id);
  if (!account) throw { code: "command_failed", detail: "no such account" };
  const say = (kind, text = "") => emit(m, "account", { account: id, kind, text });
  const timer = setTimeout(() => {
    say("url", `https://auth.example.com/${provider}/device?account=${id}`);
    if (provider === "codex") {
      say("confirm", "WXYZ-1234");
      e.logins.set(id, setTimeout(() => {
        Object.assign(account, { identity: "ana@example.com", authenticated_at: Date.now() });
        e.logins.delete(id);
        say("done");
      }, 200));
    } else {
      say("code");
      e.logins.set(id, { provider, waiting: true });
    }
  }, 50);
  e.logins.set(id, timer);
}

/** Git por tarea de una carpeta: un PR abierto con el CI fallido en la VM, uno integrado en la Mac. */
const PULLS = { "t-vm-1": { number: 312, state: "open", checks: "failure" }, "t-mac-1": { number: 302, state: "merged", checks: "success" } };
function gitOf(e, project) {
  return Object.fromEntries([...e.sessions.values()].filter((s) => s.project === project).map((s) => {
    const pull = PULLS[s.id];
    return [s.id, {
      kind: "branch", kn: null, branch: `task/${s.id}`, alias: null, head: "h1", repository: `/lab/${project}`, shared_with: null,
      pull: pull ? { git_host: "github", number: pull.number, state: pull.state, head_sha: "h1", checks: pull.checks } : null,
      pull_known: true, checked_at: Date.now(), stale: false, has_remote: true, merged_locally: false,
    }];
  }));
}

function attentionOf(e) {
  const tasks = [...e.sessions.values()].flatMap((s) => (s.pending ? [{ session: s.id, project: s.project, state: "approving" }] : s.esperando ? [{ session: s.id, project: s.project, state: "asked" }] : []));
  return [{ workspace: e.ws, tasks }];
}

function emit(m, name, payload) {
  m.engine.cursor += 1;
  const page = { type: "events", cursor: m.engine.cursor, events: [{ name, payload }] };
  for (const socket of sockets) if (socket.computer === m.row.computer_id && socket.subscribed) socket.send(page);
}

/** Un turno: arranca, escribe, y termina o pide permiso si el mensaje lo dice. */
function turn(m, s, prompt, extra = {}) {
  const e = m.engine;
  s.turns.push({ id: randomUUID(), role: "user", text: prompt, at: Date.now(), ...extra });
  s.started_at = Date.now();
  e.live.add(s.id);
  emit(m, "chat", { workspace: m.engine.ws, session: s.id, kind: "started", text: "", meta: null, ok: null, request_id: null });
  setTimeout(() => {
    emit(m, "chat", { workspace: m.engine.ws, session: s.id, kind: "delta", text: "Trabajando en ello", meta: null, ok: null, request_id: null });
    if (/pregunta/i.test(prompt)) {
      const turn = randomUUID();
      const questions = [{ id: "choice", question: "¿Qué opción prefieres?", options: [{ value: "one", label: "Primera" }, { value: "two", label: "Segunda" }], multiple: false, free_text: true }];
      s.question = { request_id: randomUUID(), turn };
      s.turns.push({ id: turn, role: "agent", text: "Elige una opción.", questions });
      emit(m, "question", { workspace: e.ws, session: s.id });
      return;
    }
    if (/trabajo/i.test(prompt)) return void work(m, s, prompt);
    if (/permiso/i.test(prompt)) {
      s.pending = { request_id: randomUUID(), tool: "Bash", target: "rm -rf build" };
      emit(m, "chat", { workspace: m.engine.ws, session: s.id, kind: "permission", text: "Bash", meta: null, ok: null, request_id: s.pending.request_id, target: "rm -rf build" });
      emit(m, "attention", attentionOf(e));
      return;
    }
    finish(m, s);
  }, 150);
}

/**
 * «trabajo»: una ejecución con pasos, un avance y un tramo guardado (`segment_saved`). Con «permiso»
 * pide aprobar a la mitad; con «falla», la primera aprobación contesta error. `--step-ms` marca el paso.
 */
function work(m, s, prompt) {
  const say = (kind, text = "", more = {}) => emit(m, "chat", { workspace: m.engine.ws, session: s.id, kind, text, meta: null, ok: null, request_id: null, ...more });
  const tools = [{ name: "Read", target: "src/lib/steps.ts", ok: true }, { name: "Bash", target: "pnpm verify --no-cargo 2>&1 | tail -20", ok: false }, { name: "Edit", target: "src/locales/en/chat.json", ok: true }];
  const script = [
    () => say("tool", "Read", { target: tools[0].target }),
    () => say("tool_done", "Read", { ok: true }),
    () => say("delta", "Reviso el error de la verificación.", { starts_message: true }),
    () => say("tool", "Bash", { target: tools[1].target }),
    () => say("tool_done", "Bash", { ok: false }),
    () => say("tool", "Edit", { target: tools[2].target }),
    () => say("tool_done", "Edit", { ok: true }),
    () => {
      s.turns.push({ id: randomUUID(), role: "agent", text: "", at: Date.now(), duration_ms: 4_000, tools, pieces: [{ tool: 0 }, { text: "Reviso el error de la verificación." }, { tool: 1 }, { tool: 2 }] });
      say("segment_saved");
    },
    () => say("tool", "Bash", { target: "pnpm verify --no-cargo" }),
  ];
  const close = () => {
    say("tool_done", "Bash", { ok: true });
    setTimeout(() => {
      s.turns.push({ id: randomUUID(), role: "agent", text: "Listo: la verificación pasó.", at: Date.now(), duration_ms: 2_000, tools: [{ name: "Bash", target: "pnpm verify --no-cargo", ok: true }], pieces: [{ tool: 0 }, { text: "Listo: la verificación pasó." }] });
      s.updated_at = Date.now();
      m.engine.live.delete(s.id);
      say("done", "", { ok: true });
      emit(m, "attention", attentionOf(m.engine));
    }, STEP_MS);
  };
  const next = (i) => {
    if (i < script.length) {
      script[i]();
      return void setTimeout(() => next(i + 1), STEP_MS);
    }
    if (!/permiso/i.test(prompt)) return close();
    s.pending = { request_id: randomUUID(), tool: "Bash", target: "gh pr merge 479 --squash --delete-branch", failOnce: /falla/i.test(prompt), then: close };
    say("permission", "Bash", { request_id: s.pending.request_id, target: s.pending.target });
    emit(m, "attention", attentionOf(m.engine));
  };
  next(0);
}

function finish(m, s) {
  s.turns.push({ id: randomUUID(), role: "agent", text: "Listo." });
  s.updated_at = Date.now();
  m.engine.live.delete(s.id);
  emit(m, "chat", { workspace: m.engine.ws, session: s.id, kind: "done", text: "", meta: null, ok: true, request_id: null });
  emit(m, "attention", attentionOf(m.engine));
}

/** Un clon en segundo plano, como `start_project_clone`: avanza por eventos y queda en `clones`. */
function startClone(m, args) {
  const e = m.engine;
  e.clones ??= new Map();
  if (e.clones.has(args.operation)) return { operation: args.operation };
  if (!/^(https:\/\/|git@)/.test(String(args.url))) throw { code: "operation_failed", detail: { what: { clave: "projects.error.clone_failed" }, detail: "bad url" } };
  const report = (event) => {
    const full = { workspace: e.ws, operation: args.operation, percent: null, done: false, ...event };
    e.clones.set(args.operation, full);
    emit(m, "project_clone", full);
  };
  report({ phase: "waiting" });
  const steps = [{ phase: "receiving", percent: 40 }, { phase: "resolving", percent: 90 }];
  let i = 0;
  const timer = setInterval(() => {
    const clone = e.clones.get(args.operation);
    if (clone.cancelled) {
      clearInterval(timer);
      return report({ phase: "done", done: true, error: { what: { clave: "projects.error.clone_cancelled" }, detail: "" } });
    }
    if (i < steps.length) return report(steps[i++]);
    clearInterval(timer);
    const name = args.name || String(args.url).replace(/\.git$/, "").split("/").pop();
    const project = { id: `p-${randomUUID().slice(0, 8)}`, name };
    e.projects.push(project);
    report({ phase: "done", done: true, project: { ...project, working_directory: `/home/danil/code/${name}` } });
  }, String(args.url).includes("slow") ? 1500 : 150);
  return { operation: args.operation };
}

/** Lo que eliminar un espacio toca: sus tareas sin archivar, como `TaskSeen`. */
function seenIn(e, space) {
  return [...e.sessions.values()].filter((s) => s.space === space && !s.archived).map((s) => ({ folder: s.project, task: s.id, root: s.id, title: s.title, working: e.live.has(s.id), files: [], kn_pending: [] }));
}

// --- Archivos de la tarea (`--files`), con las reglas de `delivery/development` ---
const IMAGE_MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", ico: "image/x-icon" };
const PART_MIME = { ...IMAGE_MIME, pdf: "application/pdf", mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm", mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", ogg: "audio/ogg" };
const OPAQUE = ["zip", "docx", "xlsx", "pptx", "doc", "xls", "ppt", "bin", "mp4", "mov", "webm", "m4a", "mp3", "wav"];
const extOf = (path) => (path.includes(".") ? path.slice(path.lastIndexOf(".") + 1).toLowerCase() : "");

function insideFiles(path) {
  const full = resolve(FILES, path);
  if (full !== FILES && !full.startsWith(`${FILES}/`)) throw { code: "command_failed", detail: "outside_tree" };
  if (!existsSync(full) || !statSync(full).isFile()) throw { code: "command_failed", detail: "development.error.gone" };
  return full;
}

function walk(dir, paths, folders) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    const rel = relative(FILES, full);
    if (entry.isDirectory()) {
      folders.push({ path: rel, repo: false });
      walk(full, paths, folders);
    } else paths.push(rel);
  }
}

function showFile(path) {
  const full = insideFiles(path);
  const ext = extOf(path);
  const bytes = statSync(full).size;
  if (IMAGE_MIME[ext]) return { kind: "image", text: "", data_url: `data:${IMAGE_MIME[ext]};base64,${readFileSync(full).toString("base64")}`, pdf: null, bytes, truncated: false };
  if (ext === "pdf") return { kind: "pdf", text: "", data_url: null, pdf: readFileSync(full).toString("base64"), bytes, truncated: false };
  const raw = OPAQUE.includes(ext) ? null : readFileSync(full);
  const text = raw && !raw.includes(0) ? raw.toString("utf8") : null;
  return text !== null ? { kind: "text", text, data_url: null, pdf: null, bytes, truncated: false } : { kind: "binary", text: "", data_url: null, pdf: null, bytes, truncated: false };
}

function readPart(args) {
  const full = insideFiles(args.path);
  const stat = statSync(full);
  const revision = `${stat.size}-${stat.mtimeMs}`;
  if (args.revision && args.revision !== revision) throw { code: "command_failed", detail: "file_changed" };
  const start = Math.min(Number(args.offset) || 0, stat.size);
  const size = Math.min(Math.max(1, Number(args.size) || 1), 1 << 20, stat.size - start);
  const chunk = Buffer.alloc(Math.max(0, size));
  const fd = openSync(full, "r");
  try {
    readSync(fd, chunk, 0, chunk.length, start);
  } finally {
    closeSync(fd);
  }
  return { data: chunk.toString("base64"), eof: start + chunk.length >= stat.size, total: stat.size, revision, mime: PART_MIME[extOf(args.path)] ?? "application/octet-stream" };
}

function fileCommand(command, args) {
  switch (command) {
    case "list_task_trees": return [{ key: "work", name: "Copia de la tarea", path: FILES, kind: "folder", missing: false }];
    case "tree_files": {
      const paths = [];
      const folders = [];
      walk(FILES, paths, folders);
      return { paths, folders, truncated: false };
    }
    case "tree_show": return showFile(args.path);
    case "tree_read_part": return readPart(args);
    // Sin Typst en el falso: el PDF de al lado hace de `dist/<principal>.pdf`.
    case "tree_typst_export": {
      const pdf = String(args.path).replace(/\.typ$/i, ".pdf");
      return existsSync(join(FILES, pdf)) ? { pdf, diagnostics: [] } : { pdf: null, diagnostics: [{ severity: "error", path: args.path, line: 1, column: 1, message: "no compila en el falso" }] };
    }
    case "tree_office_preview": throw { code: "command_failed", detail: "libreoffice_missing" };
    case "list_integrations": return { plugins: [{ id: "typst", enabled: true }] };
    case "preview_file": return { rel: args.rel, ...showFile(relative(FILES, args.path)) };
  }
  return undefined;
}

function invoke(m, command, args) {
  const e = m.engine;
  if (e.older?.has(command)) throw { code: "command", detail: command };
  if (FILES && (command !== "preview_file" || String(args.path).startsWith(`${FILES}/`))) {
    const answer = fileCommand(command, args);
    if (answer !== undefined) return answer;
  }
  switch (command) {
    case "list_activity": return [{ id: "maintenance-qa", project: e.projects[0].id, title: `Actualizar herramientas en ${e.name}`, state: "success", created_at: Date.now() - 60000, updated_at: Date.now() - 30000, steps: 1 }];
    case "read_activity": return { ...invoke(m, "list_activity", {})[0], steps: [{ id: "step-qa", command: "terminus --version", cwd: "/lab/tools", state: "success", started_at: Date.now() - 60000, ended_at: Date.now() - 30000, exit_code: 0, error: null }] };
    case "read_activity_log": return { text: "Terminus QA\nComprobación completada.\n", next_offset: 40, bytes: 40, has_more: false };
    case "get_project_directory": return "/home/danil/code";
    case "create_project": {
      const project = { id: `p-${randomUUID().slice(0, 8)}`, name: args.name };
      e.projects.push(project);
      return { ...project, working_directory: `/home/danil/code/${args.name}` };
    }
    case "start_project_clone": return startClone(m, args);
    case "project_clone_status": return e.clones?.get(args.operation) ?? null;
    case "cancel_project_clone": {
      const clone = e.clones?.get(args.operation);
      if (clone && !clone.done) clone.cancelled = true;
      return null;
    }
    case "list_workspaces": return { workspaces: [{ id: e.ws, name: "Producto", default_permission_mode: WORKSPACE_MODE }], active: e.ws };
    case "list_projects": return e.projects.map((p) => ({ ...p, working_directory: `/lab/${p.name}` }));
    // El primero tiene todas las carpetas, también las que se crean después.
    case "list_spaces": return e.spaces.map((x) => (x.id === "s1" ? { ...x, folders: e.projects.map((p) => p.id) } : x));
    case "create_space": {
      const space = { id: `s-${randomUUID().slice(0, 8)}`, name: String(args.name), folders: args.folders ?? [], created_at: Date.now(), updated_at: Date.now() };
      e.spaces.push(space);
      return space;
    }
    case "rename_space": {
      const space = e.spaces.find((x) => x.id === args.id);
      if (!space) throw { code: "command_failed", detail: { what: { clave: "spaces.error.not_found" }, detail: args.id } };
      Object.assign(space, { name: String(args.name), updated_at: Date.now() });
      return space;
    }
    case "space_delete_preview": {
      const space = e.spaces.find((x) => x.id === args.id);
      if (!space) throw { code: "command_failed", detail: { what: { clave: "spaces.error.not_found" }, detail: args.id } };
      return { space: { id: space.id, name: space.name }, last: e.spaces.length === 1, tasks: seenIn(e, space.id) };
    }
    case "delete_space": {
      const space = e.spaces.find((x) => x.id === args.id);
      if (!space || e.spaces.length === 1) throw { code: "command_failed", detail: { what: { clave: "spaces.error.last" }, detail: args.id } };
      // Como el motor: si ve algo que la persona no vio, no borra y devuelve la previa nueva.
      const now = seenIn(e, space.id);
      const seen = new Set((args.seen?.tasks ?? []).map((t) => t.task));
      if (now.some((t) => !seen.has(t.task))) return { deleted: false, changed: { space: { id: space.id, name: space.name }, last: false, tasks: now }, failures: [] };
      for (const t of now) e.sessions.get(t.task).archived = true;
      e.spaces.splice(e.spaces.indexOf(space), 1);
      return { deleted: true, changed: null, failures: [] };
    }
    case "keep_awake_status": return { mode: e.awake, active: e.awake === "on" || (e.awake === "agent" && e.live.size > 0), supported: true };
    case "set_keep_awake": {
      if (!["on", "agent", "off"].includes(args.mode)) throw { code: "command_failed", detail: "unknown mode" };
      e.awake = args.mode;
      return invoke(m, "keep_awake_status", {});
    }
    case "list_ports": return { tareas: [], externos: [{ id: "tcp-5173", pid: 4242, puerto: 5173, direccion: "*:5173", url: "http://localhost:5173", comando: "node" }], aviso: null };
    case "archived_tasks": return { tasks: [...e.sessions.values()].filter((s) => s.archived).map((s) => ({ ...row(s), folder: s.project })), spaces: [] };
    case "list_live_sessions": return [...e.sessions.values()].filter((s) => s.project === args.project && !s.archived).map(row);
    case "list_agents": return { agents: args.project === "p-vm-web" ? [{ name: "Ada", description: "Revisa PRs" }] : [] };
    case "list_agent_profiles": return args.project === "p-vm-web" ? { Ada: { body: "catplanet", avatar: process.argv.includes("--custom-avatar") ? "/lab/avatar.svg" : null } } : {};
    case "preview_file": {
      if (args.path !== "/lab/avatar.svg") throw { code: "command_failed", detail: "no fixture image" };
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="32" fill="#ffd98a"/><path d="m32 8 7 16 18 2-14 12 4 18-15-9-15 9 4-18L7 26l18-2z" fill="#7140ff"/></svg>';
      return { rel: "avatar.svg", kind: "image", data_url: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`, bytes: Buffer.byteLength(svg), truncated: false };
    }
    case "list_agent_status": return args.project === "p-vm-web" ? [{ name: "Ada", status: "awake", minutes_since_last_turn: 3, live_tasks: 0 }] : [];
    case "list_providers": return [{ id: "codex", label: "Codex", available: true, driver: true }, { id: "claude", label: "Claude", available: true, driver: true }];
    case "list_active_turns": return [...e.live];
    case "list_live_turns": return [...e.live].map((session) => ({ session, workspace: e.ws, project: e.sessions.get(session)?.project ?? "", started_at: e.sessions.get(session)?.started_at ?? Date.now() }));
    case "list_workspace_attention": return attentionOf(e);
    case "list_session_git": {
      if (!args.remote) e.gitObserved.add(args.project);
      return e.gitObserved.has(args.project) ? gitOf(e, args.project) : {};
    }
    case "load_session": {
      const s = e.sessions.get(args.id);
      if (!s) throw { code: "command_failed", detail: "no such task" };
      const opened = { id: s.id, provider: s.provider, model: s.model, agent: s.agent };
      if (!args.history_request) return { ...opened, turns: s.turns };
      // Como `bounded_history`: la revisión cambia con cada escritura y los textos largos salen por referencia.
      const revision = `r${s.turns.length}`;
      if (args.history_request.kind === "detail") {
        const { turn, pointer, offset = 0 } = args.history_request;
        if (args.history_request.revision !== revision) throw { code: "command_failed", detail: "revision_changed" };
        const body = JSON.stringify(s.turns[turn]?.text ?? "");
        if (pointer !== "/text") throw { code: "command_failed", detail: "unknown_pointer" };
        const next = Math.min(body.length, offset + 65_536);
        return { version: 1, revision, offset, next, total: body.length, done: next === body.length, text: body.slice(offset, next) };
      }
      const end = Math.min(args.history_request.before ?? s.turns.length, s.turns.length);
      const start = Math.max(0, end - 50);
      const turns = s.turns.slice(start, end).map((t, n) => t.text && t.text.length > 8192
        ? { ...t, text: "", history_refs: [{ version: 1, turn: start + n, pointer: "/text", bytes: t.text.length + 2, revision }] }
        : t);
      return { ...opened, turns, history: { version: 1, revision, total: s.turns.length, start, end, limit: 50, has_more: start > 0 } };
    }
    case "pending_requests": {
      const s = e.sessions.get(args.session);
      return { questions: s?.question ? [{ request_id: s.question.request_id, turn: s.question.turn }] : [], permissions: s?.pending ? [{ request_id: s.pending.request_id, tool: s.pending.tool, target: s.pending.target }] : [] };
    }
    case "send_message": {
      let s = args.session ? e.sessions.get(args.session) : null;
      if (!s) {
        const id = `t-${randomUUID().slice(0, 8)}`;
        s = { id, project: args.project, title: String(args.prompt).slice(0, 40), agent: args.agent ?? null, provider: args.provider, model: args.model ?? null, created_at: Date.now(), updated_at: Date.now(), turns: [], pending: null };
        e.sessions.set(id, s);
        emit(m, "session", { workspace: e.ws, project: args.project, session: id });
      }
      // Lo que eligió el cuadro queda en el turno, para que la prueba lo lea de vuelta.
      console.log(`send_message ${JSON.stringify({ prompt: args.prompt, provider: args.provider, permissionMode: args.permissionMode ?? null })}`);
      turn(m, s, String(args.prompt), { model: args.model ?? null, attachments: args.attachments ?? [], effort: args.effort ?? null, permissionMode: args.permissionMode ?? null, baseRef: args.baseRef ?? null });
      return s.id;
    }
    case "inject_message": return null;
    case "set_permission_mode": {
      const s = e.sessions.get(args.session);
      if (!s) throw { code: "command_failed", detail: "no such task" };
      s.permission_mode = args.mode;
      console.log(`set_permission_mode ${JSON.stringify({ session: args.session, mode: args.mode })}`);
      return null;
    }
    case "stop_turn": e.live.delete(args.session); return null;
    case "respond_permission": {
      const s = e.sessions.get(args.session);
      if (!s?.pending || s.pending.request_id !== args.requestId) throw { code: "command_failed", detail: "no pending permission" };
      if (s.pending.failOnce) {
        s.pending.failOnce = false;
        throw { code: "command_failed", detail: "el motor no pudo aplicar la decisión" };
      }
      const { tool, target, then } = s.pending;
      s.pending = null;
      s.turns.push({ id: randomUUID(), role: "user", text: "", at: Date.now(), permission: { tool, target, allow: args.allow } });
      setTimeout(() => (then ? then() : finish(m, s)), 100);
      return { role: "user", text: args.allow ? "Aprobado" : "Rechazado" };
    }
    case "answer_question": {
      const s = e.sessions.get(args.session);
      if (!s?.question || s.question.request_id !== args.requestId) throw { code: "command_failed", detail: "no pending question" };
      s.question = null;
      finish(m, s);
      return null;
    }
    case "mark_task_seen": return null;
    case "set_session_pinned": {
      const s = e.sessions.get(args.id);
      if (!s) throw { code: "command_failed", detail: "no such task" };
      s.pinned = Boolean(args.pinned);
      emit(m, "session", { workspace: e.ws, project: s.project, session: s.id });
      return null;
    }
    case "rename_session": {
      const s = e.sessions.get(args.id);
      if (!s) throw { code: "command_failed", detail: "no such task" };
      s.title = String(args.title);
      emit(m, "session", { workspace: e.ws, project: s.project, session: s.id });
      return null;
    }
    case "task_blockers": {
      const s = e.sessions.get(args.id);
      return { unsaved: s?.unsaved ? [{ session: s.id, title: s.title, files: s.unsaved }] : [], not_finished: Boolean(args.finish && (!s || PULLS[s.id]?.state !== "merged" || e.live.has(s.id))) };
    }
    case "finish_task": {
      const s = e.sessions.get(args.id);
      if (!s || s.project !== args.project || s.unsaved?.length || e.live.has(s.id) || PULLS[s.id]?.state !== "merged") throw { code: "command_failed", detail: "task not ready to finish" };
      s.archived = true;
      emit(m, "session", { workspace: e.ws, project: s.project, session: s.id });
      return null;
    }
    case "delete_session": {
      const s = e.sessions.get(args.id);
      if (!s || s.project !== args.project || s.unsaved?.length || e.live.has(s.id) || args.force !== false) throw { code: "command_failed", detail: "task has work" };
      e.sessions.delete(s.id);
      emit(m, "session", { workspace: e.ws, project: s.project, session: s.id });
      return null;
    }
    case "set_task_archived": {
      const s = e.sessions.get(args.id);
      if (!s) throw { code: "command_failed", detail: "no such task" };
      s.archived = Boolean(args.archived);
      emit(m, "session", { workspace: e.ws, project: s.project, session: s.id });
      return null;
    }
    case "list_models": return { provider: args.provider, models: MODELS[args.provider] ?? [], fallback: false };
    case "list_permission_modes":
      return ["manual", "edits", "auto"].map((id) => ({ id, label: { clave: `agents.mode.${id}` }, falta: args.provider === "codex" && id !== "auto" ? { clave: "agents.mode.missing.codex" } : null, por_omision: id === "auto" }));
    case "list_slash_menu":
      return { commands: [{ name: "review", description: "Revisa los cambios" }, { name: "compact", description: null }], skills: [{ name: "pdf", description: "Lee y escribe PDF" }], side_question: "btw" };
    case "list_mentions": return { fuentes: [{ ruta: "src", tipo: "carpeta" }, { ruta: "src/app.ts", tipo: "archivo" }, { ruta: "docs/guía de estilo.md", tipo: "archivo" }], truncado: false };
    case "project_base_branches": return { branches: [{ reference: "refs/heads/main", name: "main", remote: false, commit: "abc", ahead: null, behind: null }, { reference: "refs/remotes/origin/dev", name: "origin/dev", remote: true, commit: "def", ahead: 0, behind: 1 }], selected: "refs/heads/main", fetched_at: null };
    case "run_shell_command": {
      let s = args.session ? e.sessions.get(args.session) : null;
      if (!s) {
        const id = `t-${randomUUID().slice(0, 8)}`;
        s = { id, project: args.project, title: `!${args.command}`, agent: args.agent ?? null, provider: args.provider ?? "codex", model: args.model ?? null, created_at: Date.now(), updated_at: Date.now(), turns: [], pending: null };
        e.sessions.set(id, s);
        emit(m, "session", { workspace: e.ws, project: args.project, session: id });
      }
      const turn = randomUUID();
      s.turns.push({ id: turn, role: "shell", text: `$ ${args.command}\nok` });
      emit(m, "chat", { workspace: e.ws, session: s.id, kind: "done", text: "", meta: null, ok: true, request_id: null });
      return { session: s.id, turn };
    }
    case "stop_shell_command": return false;
    case "guardar_imagen_pegada": {
      if (!IMAGE_MIMES.has(args.mime)) throw { code: "command_failed", detail: "chat.attachments.paste_unsupported_format" };
      const bytes = Buffer.from(String(args.datos ?? ""), "base64");
      if (!bytes.length) throw { code: "command_failed", detail: "chat.attachments.paste_empty" };
      if (bytes.length > IMAGE_CAP) throw { code: "command_failed", detail: "chat.attachments.paste_too_large" };
      const path = `/tmp/captura-${randomUUID().slice(0, 6)}.${args.mime.split("/")[1]}`;
      e.files.add(path);
      return path;
    }
    case "guardar_adjunto": {
      if (!IMAGE_MIMES.has(args.mime) && !DOCUMENT_MIMES.has(args.mime)) throw { code: "command_failed", detail: "chat.attachments.paste_unsupported_format" };
      const bytes = Buffer.from(String(args.datos ?? ""), "base64");
      if (!bytes.length) throw { code: "command_failed", detail: "chat.attachments.paste_empty" };
      if (bytes.length > IMAGE_CAP) throw { code: "command_failed", detail: "chat.attachments.paste_too_large" };
      const name = String(args.nombre ?? "").replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^[._-]+|[._-]+$/g, "") || "adjunto";
      const path = `/tmp/adjunto-${randomUUID().slice(0, 6)}-${name.includes(".") ? name : `${name}.${args.mime.split("/")[1]}`}`;
      e.files.add(path);
      return path;
    }
    case "prepare_attachments":
      return args.paths.map((path) => {
        if (!e.files.has(path)) throw { code: "command_failed", detail: "preview.attachments.failed" };
        return `/lab/attachments/${randomUUID().slice(0, 8)}/${path.split("/").pop()}`;
      });
    case "list_accounts": {
      const accounts = e.accounts[args.provider] ?? [];
      const chosen = e.active?.[args.provider];
      const active = accounts.some((a) => a.id === chosen) ? chosen : (accounts[0]?.id ?? null);
      return { provider: args.provider, env_var: null, shared_credential: null, secret_note: null, active, accounts };
    }
    case "account_status": {
      const a = (e.accounts[args.provider] ?? []).find((x) => x.id === args.id);
      return { id: args.id, authenticated: Boolean(a?.authenticated_at), detail: "" };
    }
    case "account_limits": {
      const a = (e.accounts[args.provider] ?? []).find((x) => x.id === args.id);
      if (!a) return { mode: "no_account", what: null };
      return { mode: "read", windows: [{ label: "últimas 5 horas", used_pct: 38, resets_at: Date.now() + 3 * HOUR }, { label: "esta semana", used_pct: 91, resets_at: Date.now() + 72 * HOUR }], plan: "Max", fetched_at: Date.now() };
    }
    case "add_account": {
      const list = (e.accounts[args.provider] ??= []);
      const account = { id: `a-${randomUUID().slice(0, 6)}`, label: args.label || `Cuenta ${list.length + 1}`, created_at: Date.now(), identity: null, authenticated_at: null };
      list.push(account);
      return account;
    }
    case "login_account":
      if (args.mode !== "tuberia") throw { code: "command_failed", detail: "solo tubería en una máquina sin pantalla" };
      login(m, args.provider, args.id);
      return null;
    case "submit_login_code": {
      const waiting = e.logins.get(args.id);
      if (!waiting?.waiting) throw { code: "command_failed", detail: "Esa conexión ya no está esperando nada" };
      e.logins.delete(args.id);
      const account = (e.accounts[waiting.provider] ?? []).find((a) => a.id === args.id);
      setTimeout(() => {
        if (String(args.code).trim() === "good-code") {
          Object.assign(account, { identity: "ana@example.com", authenticated_at: Date.now() });
          emit(m, "account", { account: args.id, kind: "done", text: "" });
        } else emit(m, "account", { account: args.id, kind: "done", text: "El código no es válido." });
      }, 50);
      return null;
    }
    case "cancel_login": {
      const pending = e.logins.get(args.id);
      if (pending && typeof pending !== "object") clearTimeout(pending);
      e.logins.delete(args.id);
      return null;
    }
    case "discard_account": {
      const list = e.accounts[args.provider] ?? [];
      const i = list.findIndex((a) => a.id === args.id && !a.authenticated_at);
      if (i < 0) return false;
      list.splice(i, 1);
      return true;
    }
    case "remove_account": {
      const list = e.accounts[args.provider] ?? [];
      const i = list.findIndex((a) => a.id === args.id);
      if (i < 0) throw { code: "command_failed", detail: "no such account" };
      list.splice(i, 1);
      if (e.active?.[args.provider] === args.id) delete e.active[args.provider];
      return null;
    }
    case "set_active_account": {
      const list = e.accounts[args.provider] ?? [];
      if (!list.some((a) => a.id === args.id)) throw { code: "command_failed", detail: "no such account" };
      (e.active ??= {})[args.provider] = args.id;
      return null;
    }
  }
  throw { code: "command", detail: command };
}

const keyOf = (c) => JSON.stringify([c.command, c.workspace ?? null, c.folder ?? null, c.args ?? {}]);

// Antes de apagarse, la VM dejó en el espejo lo que se leía: la lista y sus tareas.
function seedMirror(m) {
  const W = m.engine.ws;
  const reads = [
    ["list_workspaces", null, {}], ["list_projects", W, {}], ["list_spaces", W, {}], ["list_active_turns", W, { workspace: W }],
    ["list_workspace_attention", null, {}], ["list_providers", W, {}],
    ...["", ...m.engine.projects.map((p) => p.id)].flatMap((project) => [["list_live_sessions", W, { project, open: [] }], ...(project ? [["list_agents", W, { project }], ["list_agent_status", W, { project }], ["list_agent_profiles", W, { project }]] : [])]),
    ...[...m.engine.sessions.values()].flatMap((s) => [["load_session", W, { project: s.project, id: s.id }], ["pending_requests", W, { session: s.id }]]),
  ];
  for (const [command, workspace, args] of reads) m.mirror.set(keyOf({ command, workspace, folder: null, args }), { value: invoke(m, command, args), at: new Date(Date.now() - 3_600_000).toISOString() });
}
seedMirror(machines.cmp_vm);

// --- Relay ------------------------------------------------------------------------

const sockets = new Set();

function setState(m, state) {
  m.state = state;
  for (const s of sockets) if (s.computer === m.row.computer_id) s.send({ type: "state", state });
}

function wake(m) {
  if (m.state === "starting" || m.state === "online") return true;
  if (m.row.kind === "physical") return false;
  setState(m, "starting");
  setTimeout(() => {
    setState(m, "online");
    for (const s of sockets) if (s.computer === m.row.computer_id) s.flush();
  }, WAKE_MS);
  return true;
}

/**
 * Como el motor por el relay (`admit_relayed` + `workspaces::active`): las cuentas
 * son de un workspace y sin él en el sobre no hay activo. `list_accounts` sale
 * vacía y lo demás falla con la frase del motor (medido en vm-alberto, 1198b04).
 */
const ACCOUNT_COMMANDS = new Set(["list_accounts", "account_status", "account_limits", "add_account", "login_account", "remove_account", "set_active_account"]);
const RELAY_WITHOUT_WORKSPACE = "Por el relay, la llamada tiene que decir de qué workspace es.";

function withoutWorkspace(call) {
  if (!ACCOUNT_COMMANDS.has(call.command) || call.workspace) return undefined;
  if (call.command === "list_accounts") return { provider: call.args?.provider, env_var: null, shared_credential: null, secret_note: null, active: null, accounts: [] };
  throw { code: "command_failed", detail: RELAY_WITHOUT_WORKSPACE };
}

function onCall(socket, m, call) {
  const reply = (body) => socket.send({ type: "result", id: call.id, ...body });
  const run = () => {
    try {
      const value = withoutWorkspace(call) ?? invoke(m, call.command, call.args ?? {});
      if (MIRROR.has(call.command)) m.mirror.set(keyOf(call), { value, at: new Date().toISOString() });
      reply({ value });
    } catch (error) {
      reply({ error: { code: error.code ?? "io", detail: error.detail ?? null } });
    }
  };
  if (m.state === "online") return run();
  if (INTENT.has(call.command)) {
    if (!wake(m)) return reply({ error: { code: "start_failed" } });
    socket.queue.push(run);
    return;
  }
  const kept = MIRROR.has(call.command) ? m.mirror.get(keyOf(call)) : null;
  if (kept) return reply({ value: kept.value, cached: { updated_at: kept.at } });
  reply({ error: { code: "machine_off" } });
}

// --- WebSocket mínimo (RFC 6455, frames de texto) ---------------------------------

function upgrade(request, raw, computer) {
  const offered = (request.headers["sec-websocket-protocol"] ?? "").split(",").map((p) => p.trim());
  if (!offered.includes("danil.computers.v1") || !offered.includes(`bearer.${TOKEN}`)) {
    raw.end("HTTP/1.1 401 Unauthorized\r\n\r\n");
    return;
  }
  const accept = createHash("sha1").update(`${request.headers["sec-websocket-key"]}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
  raw.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\nSec-WebSocket-Protocol: danil.computers.v1\r\n\r\n`);
  const m = machines[computer];
  const socket = {
    computer,
    subscribed: false,
    queue: [],
    send(message) {
      const data = Buffer.from(JSON.stringify(message));
      const head = data.length < 126 ? Buffer.from([0x81, data.length]) : data.length < 65536 ? Buffer.from([0x81, 126, data.length >> 8, data.length & 255]) : Buffer.concat([Buffer.from([0x81, 127]), (() => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(data.length)); return b; })()]);
      if (!raw.destroyed) raw.write(Buffer.concat([head, data]));
    },
    flush() {
      for (const run of this.queue.splice(0)) run();
    },
  };
  sockets.add(socket);
  socket.send({ type: "state", state: m.state });
  let buffer = Buffer.alloc(0);
  raw.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 2) {
      const opcode = buffer[0] & 15;
      let length = buffer[1] & 127;
      let offset = 2;
      if (length === 126) { if (buffer.length < 4) return; length = buffer.readUInt16BE(2); offset = 4; }
      else if (length === 127) { if (buffer.length < 10) return; length = Number(buffer.readBigUInt64BE(2)); offset = 10; }
      const masked = buffer[1] & 128;
      const mask = masked ? buffer.subarray(offset, offset + 4) : null;
      if (masked) offset += 4;
      if (buffer.length < offset + length) return;
      const payload = Buffer.from(buffer.subarray(offset, offset + length));
      if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
      buffer = buffer.subarray(offset + length);
      if (opcode === 8) { raw.end(Buffer.from([0x88, 0])); sockets.delete(socket); return; }
      if (opcode !== 1) continue;
      const message = JSON.parse(payload.toString("utf8"));
      if (message.type === "ping") socket.send({ type: "pong", t: message.t });
      if (message.type === "subscribe") socket.subscribed = true;
      if (message.type === "call") onCall(socket, m, message);
    }
  });
  raw.on("close", () => sockets.delete(socket));
  raw.on("error", () => sockets.delete(socket));
}

// --- Memoria del workspace (`/v1/workspaces/:id/memory/*`, computers#19) ----------
// Un repo por workspace en memoria: commits lineales con la foto entera. Misma regla
// de conflicto que el Worker: gana la escritura y la versión pisada queda en
// `<base>.conflicto-<autor>.md`; un borrado contra otra versión responde 409.

const oidOf = (content) => createHash("sha1").update(`blob ${Buffer.byteLength(content)}\0${content}`).digest("hex");
const entryText = (body, type, agent) =>
  `---\ntype: ${type}\nmodified: ${new Date().toISOString().replace(/\.\d{3}Z$/, "Z")}\norigin:\n  workspace: w-prod\n  project: p-mac-api\n${agent ? `  agent: ${agent}\n` : ""}---\n\n${body}\n`;
const memoryCommits = [];
function memoryCommit(files, message, author) {
  const commit = createHash("sha1").update(`${memoryCommits.length}${message}`).digest("hex");
  memoryCommits.push({ commit, message, author, at: new Date().toISOString(), files });
  return commit;
}
memoryCommit(new Map([["projects/p-mac-api/memory/deploy.md", entryText("Desplegar con pnpm deploy", "procedimiento", "claude")]]), "memory: add deploy.md", { name: "Claude", email: "agent@vm" });
memoryCommit(
  new Map([
    ["projects/p-mac-api/memory/deploy.md", entryText("Desplegar con wrangler deploy --env staging", "procedimiento", "codex")],
    ["projects/p-mac-api/memory/deploy.conflicto-mac.md", entryText("Desplegar con pnpm deploy", "procedimiento", "claude")],
    ["memory/regla.md", entryText("Las migraciones van en danil-workspace", "decisión")],
  ]),
  "memory: edit deploy.md",
  { name: "Mac", email: "ana@mac" },
);
const memoryHead = () => memoryCommits.at(-1);
const memorySlug = (text) => (text ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "anterior";

async function memory(request, response, url) {
  const m = /^\/v1\/workspaces\/([^/]+)\/memory\/(files|file|history|log)$/.exec(url.pathname);
  if (!m) return false;
  if (decodeURIComponent(m[1]) !== "w-prod") return json(response, 404, { error: { code: "not_found" } }), true;
  const path = url.searchParams.get("path");
  const ref = url.searchParams.get("ref") ?? "main";
  const filesAt = (r) => (r === "main" ? memoryHead().files : memoryCommits.find((c) => c.commit === r)?.files) ?? null;
  if (m[2] === "files") {
    const files = filesAt(ref) ?? new Map();
    json(response, 200, { commit: memoryHead().commit, files: [...files].sort(([a], [b]) => a.localeCompare(b)).map(([p, c]) => ({ path: p, oid: oidOf(c) })) });
    return true;
  }
  if (m[2] === "log") return json(response, 200, { commits: [...memoryCommits].reverse().map(({ files: _f, ...c }) => c) }), true;
  if (m[2] === "history") {
    const versions = [];
    let previous;
    for (const c of memoryCommits) {
      const now = c.files.get(path);
      if (now !== previous) versions.unshift({ commit: c.commit, message: c.message, author: c.author, at: c.at, oid: now === undefined ? null : oidOf(now) });
      previous = now;
    }
    return json(response, 200, { path, versions }), true;
  }
  if (request.method === "GET") {
    const content = filesAt(ref)?.get(path);
    return json(response, content === undefined ? 404 : 200, content === undefined ? { error: { code: "not_found" } } : { path, ref, oid: oidOf(content), content }), true;
  }
  const files = new Map(memoryHead().files);
  const author = { name: user.email, email: user.email };
  if (request.method === "DELETE") {
    const current = files.has(path) ? oidOf(files.get(path)) : null;
    if (current === null) return json(response, 404, { error: { code: "not_found" } }), true;
    if (current !== url.searchParams.get("base")) return json(response, 409, { error: { code: "memory_conflict" }, current }), true;
    files.delete(path);
    return json(response, 200, { status: "deleted", commit: memoryCommit(files, `memory: delete ${path} (web)`, author), path }), true;
  }
  if (request.method !== "PUT") return json(response, 405, { error: { code: "method_not_allowed" } }), true;
  let raw = "";
  for await (const chunk of request) raw += chunk;
  const body = JSON.parse(raw || "{}");
  const current = files.has(body.path) ? oidOf(files.get(body.path)) : null;
  let copy = null;
  if (current !== null && current !== body.base) {
    let who = "anterior";
    for (let i = memoryCommits.length - 1; i >= 0; i -= 1) if (memoryCommits[i].files.get(body.path) !== memoryCommits[i - 1]?.files.get(body.path)) { who = memoryCommits[i].author.name; break; }
    const stem = body.path.slice(0, -3);
    copy = `${stem}.conflicto-${memorySlug(who)}.md`;
    for (let n = 2; files.has(copy); n += 1) copy = `${stem}.conflicto-${memorySlug(who)}-${n}.md`;
    files.set(copy, files.get(body.path));
  }
  files.set(body.path, body.content);
  json(response, 200, { status: "written", commit: memoryCommit(files, `memory: edit ${body.path} (web)`, author), path: body.path, conflict_copy: copy, changed: true });
  return true;
}

// --- HTTP -------------------------------------------------------------------------

const user = { id: "00000000-0000-4000-8000-000000000001", aud: "authenticated", role: "authenticated", email: "persona@example.com", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
const session = () => ({ access_token: TOKEN, refresh_token: "fake-refresh", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user });

function json(response, status, body) {
  response.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS" });
  response.end(JSON.stringify(body));
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://fake");
  if (request.method === "OPTIONS") return json(response, 204, {});
  if (url.pathname === "/auth/v1/token" && request.method === "POST") return json(response, 200, session());
  if (url.pathname === "/auth/v1/user") return json(response, 200, user);
  if (url.pathname === "/auth/v1/logout") return json(response, 204, {});
  if (url.pathname === "/__fake/activity" && request.method === "POST") {
    const m = machines[url.searchParams.get("computer") ?? "cmp_mac"];
    if (!m) return json(response, 404, { error: { code: "not_found" } });
    emit(m, "activity", { workspace: m.engine.ws, id: "maintenance-qa", title: `Actualizar herramientas en ${m.engine.name}`, state: "success" });
    return json(response, 200, {});
  }
  if (url.pathname === "/__fake/send" && request.method === "POST") {
    const m = machines[url.searchParams.get("computer") ?? "cmp_mac"];
    if (!m) return json(response, 404, { error: { code: "not_found" } });
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      const args = JSON.parse(body || "{}");
      json(response, 200, { value: invoke(m, "send_message", { provider: "claude", ...args }) ?? null });
    });
    return;
  }
  if (request.headers.authorization !== `Bearer ${TOKEN}`) return json(response, 401, { error: { code: "invalid_token" } });
  if (url.pathname === "/v1/computers" && request.method === "GET") return json(response, 200, Object.values(machines).map((m) => ({ ...m.row, state: m.state, last_seen: null })));
  // El registro de la cuenta: el workspace existe aunque sus máquinas estén apagadas.
  if (url.pathname === "/v1/workspaces" && request.method === "GET")
    return json(response, 200, {
      workspaces: [
        {
          id: "w-prod",
          name: "Producto",
          radiant_workspace_id: null,
          settings: {},
          settings_version: 1,
          created_at: new Date(0).toISOString(),
          updated_at: new Date(0).toISOString(),
          projects: [{ id: "p-mac-api", name: "api", remote_url: null, default_branch: null, home_computer_id: "cmp_mac" }],
          computers: Object.keys(machines),
          logo_url: process.argv.includes("--no-logo") ? null : `http://${request.headers.host}/v1/workspaces/w-prod/logo`,
          background_url: null,
        },
      ],
    });
  if (url.pathname === "/v1/workspaces/w-prod/logo" && request.method === "GET") {
    if (process.argv.includes("--broken-logo")) return json(response, 500, { error: { code: "unavailable" } });
    response.writeHead(200, { "content-type": "image/png", "access-control-allow-origin": "*", "access-control-allow-headers": "*" });
    return response.end(LOGO_PNG);
  }
  if (url.pathname.includes("/memory/")) {
    void memory(request, response, url).then((handled) => handled || json(response, 404, { error: { code: "not_found" } }));
    return;
  }
  const start = /^\/v1\/computers\/([^/]+)\/start$/.exec(url.pathname);
  if (start && request.method === "POST") {
    const m = machines[start[1]];
    if (!m) return json(response, 404, { error: { code: "not_found" } });
    if (!LICENSE) return json(response, 403, { error: { code: "license_required" } });
    wake(m);
    return json(response, 202, { computer_id: m.row.computer_id, state: m.state });
  }
  json(response, 404, { error: { code: "not_found" } });
});

server.on("upgrade", (request, raw) => {
  const match = /^\/v1\/computers\/([^/]+)\/session$/.exec(new URL(request.url ?? "/", "http://fake").pathname);
  if (!match || !machines[match[1]] || !LICENSE) return raw.end("HTTP/1.1 404 Not Found\r\n\r\n");
  upgrade(request, raw, match[1]);
});

server.listen(PORT, "0.0.0.0", () => console.log(`Danil Machines falso en http://127.0.0.1:${PORT} (VM apagada con espejo, Mac ${machines.cmp_mac.state})`));

export { machines, server };
