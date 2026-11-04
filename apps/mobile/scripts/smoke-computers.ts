/**
 * Recorre la capa de datos de la app (`src/lib/hosts.ts` y `engine.ts`, sin
 * React Native) contra el Danil Machines falso, por HTTP y WebSocket reales:
 *
 *   node apps/mobile/scripts/smoke-computers.ts
 *
 * No prueba pantallas (eso se mira en el simulador); prueba lo que hay debajo:
 * la lista de máquinas, el reparto entre máquinas, la copia del espejo con la
 * VM apagada, que una acción la encienda, que una máquina propia apagada no se
 * intente, permisos y avisos, y la lista cerrada de comandos. Y lo que se
 * agregó para parecerse al escritorio: fijar y archivar desde la vista previa
 * (encendiendo la VM), el cuadro de escribir (modelos, permisos, `/`, `@`,
 * ramas, `!`, imágenes adjuntas y la cola), y las credenciales de IA con su
 * consumo propio, el inicio de sesión sin pantalla en otra máquina y
 * cerrar la sesión en una.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { groupAccounts, groupWorkspaces, listComputers, listWorkspaces, orderComputers, startComputer, windowLabel } from "@terminus/computers";
import { readTaskGit, canFinishTask, type TaskGitStatus } from "@terminus/tasks";
import type { AiAccount, ArchivedTasks, DeleteOutcome, DeletePreview, EngineEvent, KeepAwakeStatus, LoginEvent, OpenPorts, Space } from "@terminus/protocol";
import {
  type Notice,
  accountsOf,
  addAccount,
  archiveTask,
  finishTask,
  stopTask,
  baseBranchesOf,
  beginLogin,
  cancelClone,
  cloneRepo,
  createFolder,
  createTask,
  defaultsFor,
  injectIntoTask,
  limitsOf,
  loadTask,
  markSeen,
  mentionsOf,
  mergeSnapshots,
  modelsOf,
  noticer,
  permissionModesOf,
  switchLiveMode,
  projectDirectoryOf,
  renameTask,
  respondPermission,
  runShell,
  sendToTask,
  setPinned,
  signOutAccount,
  slashMenuOf,
  snapshotOf,
  submitLoginCode,
  uploadAttachment,
  withAccountFolders,
  workspaceEntries,
  workspacesOf,
} from "../src/lib/engine.ts";
import { type Host, HostError, accountFleet } from "../src/lib/hosts.ts";

const here = dirname(fileURLToPath(import.meta.url));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fake(port: number, ...flags: string[]) {
  const child = spawn(process.execPath, [join(here, "fake-computers.mjs"), "--port", String(port), ...flags], { stdio: ["ignore", "pipe", "inherit"] });
  await new Promise<void>((done) => child.stdout.once("data", () => done()));
  return child;
}

async function until(what: string, check: () => boolean, ms = 5_000) {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`timeout: ${what}`);
    await sleep(50);
  }
}

async function hostsAt(endpoint: string) {
  const answer = await listComputers(endpoint, "fake-jwt");
  assert.equal(answer.kind, "ok");
  const computers = answer.kind === "ok" ? answer.value : [];
  // Una sola flota para todas, como la app (`machines.tsx`).
  const machines = accountFleet({ endpoint, getToken: () => "fake-jwt", wake: async (id) => (await startComputer(endpoint, "fake-jwt", id)).kind === "ok" });
  const hosts = machines.set(computers);
  const close = () => machines.close();
  const events = new Map<string, EngineEvent[]>();
  for (const h of hosts) h.onEvents((list) => events.set(h.id, [...(events.get(h.id) ?? []), ...list]));
  await sleep(200);
  return { hosts, events, close, byId: (id: string) => hosts.find((h) => h.id === id) as Host };
}

const steps: string[] = [];
const ok = (step: string) => {
  steps.push(step);
  console.log(`  ok  ${step}`);
};

// --- 1. VM apagada con copia, Mac encendida ---------------------------------------
{
  const port = 18787;
  const child = await fake(port);
  const endpoint = `http://127.0.0.1:${port}`;
  try {
    assert.equal((await listComputers(endpoint, "otro")).kind, "unauthorized");
    const { hosts, events, byId, close } = await hostsAt(endpoint);
    const vm = byId("cmp_vm");
    const mac = byId("cmp_mac");
    assert.equal(vm.managed, true);
    assert.equal(mac.managed, false);
    assert.equal(vm.power(), "off");
    assert.equal(mac.power(), "on");
    ok("lista de máquinas: VM administrada apagada, Mac propia encendida; abrirlas no enciende nada");

    await assert.rejects(vm.call("delete_workspace" as never, "w-prod", {}), (e: HostError) => e.code === "command_not_allowed");
    ok("la lista cerrada: un comando fuera de APP_COMMANDS ni se envía");

    assert.deepEqual(hosts.map((h) => h.id), ["cmp_vm", "cmp_mac"], "la VM administrada encabeza");
    const [vmWs, macWs] = await Promise.all([workspacesOf(vm), workspacesOf(mac)]);
    assert.ok(vmWs.cachedAt !== null, "la VM contesta desde el espejo");
    assert.equal(macWs.cachedAt, null);
    const groups = groupWorkspaces([{ machine: "cmp_vm", rows: vmWs.list ?? [] }, { machine: "cmp_mac", rows: macWs.list ?? [] }]);
    assert.equal(groups.length, 1, "el mismo workspace, con el mismo id en cada motor, se ve una vez");
    const members = groups[0].members;
    assert.deepEqual([...members], [["cmp_vm", "w-prod"], ["cmp_mac", "w-prod"]]);
    const parts = await Promise.all([snapshotOf(vm, "w-prod"), snapshotOf(mac, "w-prod")]);
    const merged = mergeSnapshots(parts, (id) => ({ machine: byId(id).label, on: byId(id).power() === "on" }));
    assert.deepEqual(merged.folders.map((f) => f.key), ["cmp_vm/p-vm-web", "cmp_mac/p-mac-web", "cmp_mac/p-mac-api"]);
    assert.ok(merged.spaces[0].folders.includes("cmp_mac/p-mac-api"), "las carpetas de las demás máquinas entran en los spaces");
    assert.equal(merged.tasks.length, 4);
    assert.ok(merged.tasks.every((t) => t.machine));
    assert.equal(merged.tasks.find((t) => t.id === "t-vm-1")?.machine_on, false);
    assert.deepEqual(merged.agents.map((a) => a.name), ["Ada"]);
    assert.ok(merged.cachedAt !== null);
    assert.equal(vm.power(), "off", "leer no enciende la VM");
    ok("reparto: el mismo workspace (otro id en cada motor) se junta, carpetas y tareas de cada máquina con su etiqueta, copia del espejo con la VM apagada");

    const cached = await loadTask(vm, "w-prod", "p-vm-web", "t-vm-1");
    assert.ok(cached.cachedAt !== null);
    assert.equal(cached.session.turns.length, 2);
    await markSeen(vm, "w-prod", "t-vm-1");
    assert.equal(vm.power(), "off", "abrir una tarea (marcarla vista) no enciende la VM");
    ok("una tarea de la VM apagada se lee de la copia, con su hora, y marcarla vista no la enciende");

    const vmNotices = noticer("cmp_vm");
    const defaults = await defaultsFor(vm, "w-prod", merged.tasks, null);
    assert.equal(defaults.provider, "codex");
    const created = createTask(vm, "w-prod", { folder: "p-vm-web", prompt: "Escribe el changelog", ...defaults, agent: null, space: null });
    await until("la VM se enciende", () => vm.power() === "starting" || vm.power() === "on");
    const id = await created;
    assert.equal(vm.power(), "on");
    await until("el turno termina", () => (events.get("cmp_vm") ?? []).some((e) => e.name === "chat" && (e.payload as { kind: string; session: string }).kind === "done" && (e.payload as { session: string }).session === id));
    const live = await loadTask(vm, "w-prod", "p-vm-web", id);
    assert.equal(live.cachedAt, null);
    assert.equal(live.session.turns.at(-1)?.text, "Listo.");
    const notices: Notice[] = (events.get("cmp_vm") ?? []).flatMap((e) => vmNotices.take(e));
    assert.ok(notices.some((n) => n.state === "finished" && n.session === id));
    ok("Nueva tarea en la VM apagada: la enciende el relay, el turno corre y llega el aviso de terminada");

    const macNotices = noticer("cmp_mac");
    const pid = await createTask(mac, "w-prod", { folder: "p-mac-api", prompt: "Pide permiso para borrar build", provider: "claude", model: null, agent: null, space: null });
    await until("pide permiso", () => (events.get("cmp_mac") ?? []).some((e) => e.name === "chat" && (e.payload as { kind: string }).kind === "permission"));
    const waiting = await loadTask(mac, "w-prod", "p-mac-api", pid);
    assert.equal(typeof waiting.liveSince, "number", "el reloj del turno sale de list_live_turns");
    assert.equal(waiting.permissions.length, 1);
    assert.equal(waiting.running, true);
    await respondPermission(mac, "w-prod", pid, waiting.permissions[0].request_id, true);
    await until("termina tras aprobar", () => (events.get("cmp_mac") ?? []).some((e) => e.name === "chat" && (e.payload as { kind: string; session: string }).kind === "done" && (e.payload as { session: string }).session === pid));
    const after = (events.get("cmp_mac") ?? []).flatMap((e) => macNotices.take(e));
    assert.ok(after.some((n) => n.state === "approving" && n.session === pid));
    assert.ok(after.some((n) => n.state === "finished" && n.session === pid));
    assert.equal((await loadTask(mac, "w-prod", "p-mac-api", pid)).permissions.length, 0);
    ok("en la Mac: la tarea pide permiso, se aprueba desde el teléfono y termina; avisos de aprobación y de terminada");

    const aid = await createTask(mac, "w-prod", { folder: "p-mac-api", prompt: "Pide permiso para borrar build", provider: "claude", model: null, agent: null, space: null, permissionMode: "manual" });
    const asking = () => (events.get("cmp_mac") ?? []).some((e) => e.name === "chat" && (e.payload as { kind: string; session: string }).kind === "permission" && (e.payload as { session: string }).session === aid);
    await until("pide permiso en manual", asking);
    assert.equal((await loadTask(mac, "w-prod", "p-mac-api", aid)).permissions.length, 1);
    await switchLiveMode(mac, "w-prod", "p-mac-api", aid, "auto");
    await until("termina al pasar a automático", () => (events.get("cmp_mac") ?? []).some((e) => e.name === "chat" && (e.payload as { kind: string; session: string }).kind === "done" && (e.payload as { session: string }).session === aid));
    assert.equal((await loadTask(mac, "w-prod", "p-mac-api", aid)).permissions.length, 0);
    ok("con el turno en marcha, pasar a automático lo cambia en el turno vivo y aprueba lo que ya pidió");

    close();
  } finally {
    child.kill();
  }
}

// --- 2. La Mac apagada no se intenta despertar ------------------------------------
{
  const port = 18788;
  const child = await fake(port, "--mac-off");
  const endpoint = `http://127.0.0.1:${port}`;
  try {
    const { hosts, byId, close } = await hostsAt(endpoint);
    const mac = byId("cmp_mac");
    assert.equal(mac.power(), "off");
    assert.equal(mac.canAct(), "asleep");
    const ws = await workspacesOf(mac);
    assert.equal(ws.list, null, "sin copia, una lectura apagada no dice nada, y no es un error");
    await assert.rejects(
      createTask(mac, "w-prod", { folder: "p-mac-api", prompt: "hola", provider: "claude", model: null, agent: null, space: null }),
      (e: HostError) => e.code === "machine_asleep",
    );
    assert.equal(mac.power(), "off");
    ok("una máquina propia apagada: lecturas vacías sin error y la acción no se manda (machine_asleep)");
    await assert.rejects(setPinned(mac, "w-prod", "p-mac-api", "t-mac-1", true), (e: HostError) => e.code === "machine_asleep");
    await assert.rejects(addAccount(mac, "w-prod", "claude"), (e: HostError) => e.code === "machine_asleep");
    assert.equal(mac.power(), "off");
    ok("fijar o iniciar sesión en una máquina propia apagada tampoco se intenta");

    const registry = await listWorkspaces(endpoint, "fake-jwt");
    assert.equal(registry.kind, "ok");
    const accountList = registry.kind === "ok" ? registry.value : null;
    const vmWs = await workspacesOf(byId("cmp_vm"));
    const entries = workspaceEntries(hosts, { cmp_vm: vmWs.list, cmp_mac: ws.list }, accountList);
    assert.deepEqual(entries.map((e) => [e.id, e.hosts.includes("cmp_mac")]), [["w-prod", true]], "el workspace de la cuenta sigue en la Mac apagada");
    const folders = withAccountFolders({ folders: [], spaces: [] }, accountList, "w-prod", ["cmp_mac"]).folders;
    assert.deepEqual(folders.map((f) => f.key), ["cmp_mac/p-mac-api"], "con sus carpetas del registro");
    ok("el registro de la cuenta (GET /v1/workspaces) trae el workspace y sus carpetas con la máquina apagada");
    close();
  } finally {
    child.kill();
  }
}

// --- 3. Vista previa, cuadro de escribir y cuentas ---------------------------------
{
  const port = 18789;
  const child = await fake(port);
  const endpoint = `http://127.0.0.1:${port}`;
  try {
    const { hosts, events, byId, close } = await hostsAt(endpoint);
    const vm = byId("cmp_vm");
    const mac = byId("cmp_mac");
    const live = async (h: Host, ws: string) => (await snapshotOf(h, ws)).tasks;

    // Fijar ya no enciende la VM (con ella apagada el relay lo aplaza, #307, y este falso no aplaza): se enciende antes.
    assert.equal(vm.power(), "off");
    await vm.wake();
    await setPinned(vm, "w-prod", "p-vm-web", "t-vm-1", true);
    assert.equal(vm.power(), "on");
    assert.equal((await live(vm, "w-prod")).find((t) => t.id === "t-vm-1")?.pinned, true);
    await setPinned(vm, "w-prod", "p-vm-web", "t-vm-1", false);
    assert.equal((await live(vm, "w-prod")).find((t) => t.id === "t-vm-1")?.pinned, false);
    ok("Fijar y Desfijar desde la vista previa (set_session_pinned) en la VM encendida");

    await renameTask(vm, "w-prod", "p-vm-web", "t-vm-1", "Revisar el pago");
    assert.equal((await live(vm, "w-prod")).find((t) => t.id === "t-vm-1")?.title, "Revisar el pago");
    ok("Cambiarle el nombre desde la vista previa (rename_session)");

    const blocked = await archiveTask(mac, "w-prod", "p-mac-web", "t-mac-2");
    assert.ok("blocked" in blocked && blocked.blocked[0].files.includes("src/home.tsx"));
    assert.ok((await live(mac, "w-prod")).some((t) => t.id === "t-mac-2"), "con cambios sin guardar no se archiva");
    assert.deepEqual(await archiveTask(vm, "w-prod", "p-vm-web", "t-vm-2"), { archived: true });
    assert.ok(!(await live(vm, "w-prod")).some((t) => t.id === "t-vm-2"));
    ok("Archivar: pregunta task_blockers; con cambios sin guardar no archiva, si no set_task_archived y sale de la lista");

    const models = await modelsOf(mac, "w-prod", "claude");
    assert.deepEqual(models.models.map((m) => m.id), ["claude-opus-5-5", "claude-sonnet-5"]);
    const modes = await permissionModesOf(mac, "w-prod", "codex");
    assert.deepEqual(modes.map((m) => [m.id, Boolean(m.falta), m.por_omision]), [["manual", true, false], ["edits", true, false], ["auto", false, true]]);
    const slash = await slashMenuOf(mac, "w-prod", "claude");
    assert.deepEqual([slash.commands[0].name, slash.skills[0].name], ["review", "pdf"]);
    const mentions = await mentionsOf(mac, "w-prod", "p-mac-api", null);
    assert.ok(mentions.fuentes.some((f) => f.tipo === "carpeta") && mentions.fuentes.some((f) => f.ruta.includes(" ")));
    const branches = await baseBranchesOf(mac, "w-prod", "p-mac-api");
    assert.equal(branches.selected, "refs/heads/main");
    ok("el cuadro: modelos y razonamiento, permisos (con los que faltan), `/` comandos y skills, `@` archivos y carpetas, ramas base");

    const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const path = await uploadAttachment(mac, "w-prod", "p-mac-api", { mime: "image/png", base64: png, name: "captura.png" });
    assert.match(path, /^\/lab\/attachments\//);
    const pdf = await uploadAttachment(mac, "w-prod", "p-mac-api", { mime: "application/pdf", base64: png, name: "informe.pdf" });
    assert.match(pdf, /informe\.pdf$/);
    await sendToTask(mac, "w-prod", "p-mac-api", "t-mac-1", { prompt: "Mira la captura", provider: "claude", model: "claude-opus-5-5", effort: "high", permissionMode: "manual", attachments: [path, pdf] });
    const sent = (await loadTask(mac, "w-prod", "p-mac-api", "t-mac-1")).session.turns.filter((t) => t.role === "user").at(-1) as Record<string, unknown>;
    assert.deepEqual([sent.text, sent.model, sent.effort, sent.permissionMode, sent.attachments], ["Mira la captura", "claude-opus-5-5", "high", "manual", [path, pdf]]);
    ok("adjuntar una imagen y un PDF del teléfono (guardar_adjunto + prepare_attachments) y mandarlos con modelo, razonamiento y permisos");

    await injectIntoTask(mac, "w-prod", "p-mac-api", "t-mac-1", "y también esto");
    const shell = await runShell(mac, "w-prod", { folder: "p-mac-api", session: null, command: "ls", provider: "claude" });
    const ran = await loadTask(mac, "w-prod", "p-mac-api", shell.session);
    assert.equal(ran.session.turns.at(-1)?.text, "$ ls\nok");
    ok("«Mandar ahora» (inject_message) y `!` sin tarea crea una con el comando (run_shell_command)");

    // El mismo correo no une credenciales: cada una conserva su máquina y consumo.
    const lists = await Promise.all(hosts.map(async (h) => ({ machine: h.id, on: h.power() === "on", accounts: ((await accountsOf(h, "w-prod", "claude"))?.accounts ?? []) as AiAccount[] })));
    const groups = groupAccounts("claude", lists);
    assert.equal(groups.length, 2);
    assert.deepEqual(groups.map((g) => g.members.map((m) => m.machine)), [["cmp_vm"], ["cmp_mac"]]);
    const limits = await limitsOf(byId(groups[0].usageFrom.machine), "w-prod", "claude", groups[0].usageFrom.id);
    assert.equal(limits?.mode, "read");
    assert.match(windowLabel("es", limits?.mode === "read" ? limits.windows[0] : { used_pct: 0, resets_at: null }), /^resta 62% · reset en 3 h$/);
    ok("cuentas: cada credencial conserva su tarjeta y consumo aunque comparta correo («resta 62% · reset en 3 h»)");

    const accountEvents = (h: Host, id: string) => (events.get(h.id) ?? []).filter((e) => e.name === "account" && (e.payload as LoginEvent).account === id).map((e) => e.payload as LoginEvent);
    const codexId = await addAccount(vm, "w-prod", "codex");
    await beginLogin(vm, "w-prod", "codex", codexId);
    await until("codex termina solo", () => accountEvents(vm, codexId).some((e) => e.kind === "done"));
    assert.deepEqual(accountEvents(vm, codexId).map((e) => e.kind), ["url", "confirm", "done"]);
    assert.equal(accountEvents(vm, codexId).find((e) => e.kind === "confirm")?.text, "WXYZ-1234");
    assert.equal((await accountsOf(vm, "w-prod", "codex"))?.accounts[0].identity, "ana@example.com");
    const claudeId = await addAccount(mac, "w-prod", "claude");
    await beginLogin(mac, "w-prod", "claude", claudeId);
    await until("claude pide el código", () => accountEvents(mac, claudeId).some((e) => e.kind === "code"));
    await submitLoginCode(mac, "w-prod", claudeId, "good-code");
    await until("claude termina", () => accountEvents(mac, claudeId).some((e) => e.kind === "done"));
    assert.equal(accountEvents(mac, claudeId).at(-1)?.text, "");
    ok("iniciar sesión en otra máquina sin pantalla: Codex con enlace y código a comparar; Claude con enlace y código pegado");

    await signOutAccount(mac, "w-prod", "claude", "a-mac-1");
    assert.ok(!(await accountsOf(mac, "w-prod", "claude"))?.accounts.some((a) => a.id === "a-mac-1"));
    assert.ok((await accountsOf(vm, "w-prod", "claude"))?.accounts.some((a) => a.id === "a-vm-1"), "en la otra máquina sigue");
    ok("cerrar la sesión en una máquina (remove_account) deja la de las demás");

    // Carpetas nuevas en la máquina elegida: vacía y clonada, con su avance por eventos.
    assert.equal(await projectDirectoryOf(vm, "w-vm"), "/home/danil/code");
    const folder = await createFolder(vm, "w-vm", "notas", null);
    assert.equal(folder.working_directory, "/home/danil/code/notas");
    const phases: string[] = [];
    const cloned = await cloneRepo(vm, "w-vm", { operation: "00000000-0000-4000-8000-000000000001", url: "https://github.com/danil/panel.git", name: "", space: null }, (e) => phases.push(e.phase), 200);
    assert.equal(cloned.name, "panel");
    assert.deepEqual([...new Set(phases)], ["waiting", "receiving", "resolving"], "el estado repite el último evento, no inventa otro");
    assert.ok((await snapshotOf(vm, "w-vm")).folders.some((f) => f.id === cloned.id), "la carpeta clonada se lista");
    await assert.rejects(
      cloneRepo(vm, "w-vm", { operation: "00000000-0000-4000-8000-000000000002", url: "ftp://nope", name: "", space: null }, () => {}),
      (e: HostError) => (e.detail as { what?: { clave?: string } })?.what?.clave === "projects.error.clone_failed",
    );
    const slow = cloneRepo(vm, "w-vm", { operation: "00000000-0000-4000-8000-000000000003", url: "https://github.com/danil/slow.git", name: "", space: null }, () => {}, 200);
    await sleep(300);
    await cancelClone(vm, "w-vm", "00000000-0000-4000-8000-000000000003");
    await assert.rejects(slow, (e: HostError) => (e.detail as { what?: { clave?: string } })?.what?.clave === "projects.error.clone_cancelled");
    ok("«Nueva carpeta» (create_project) y «Clonar repo» (start_project_clone + project_clone): avance, carpeta listada, URL rechazada y cancelar");

    await stopTask(mac, "w-prod", "p-mac-api", "t-mac-1");
    const { value: beforeGit } = await mac.call("list_session_git", "w-prod", { project: "p-mac-api", remote: true });
    assert.deepEqual(beforeGit, {}, "el motor no descubre tareas solo con el refresco remoto");
    const git = await readTaskGit(async remote => (await mac.call<Record<string, TaskGitStatus>>("list_session_git", "w-prod", { project: "p-mac-api", remote, priority: ["t-mac-1"] })).value);
    assert.equal(canFinishTask({}, git["t-mac-1"], false), true);
    assert.deepEqual(await finishTask(mac, "w-prod", "p-mac-api", "t-mac-1"), { finished: true });
    assert.equal((await live(mac, "w-prod")).some(t => t.id === "t-mac-1"), false);
    assert.ok("blocked" in await finishTask(mac, "w-prod", "p-mac-web", "t-mac-2"));
    ok("Git y Finalizar: lectura local y PR por el mismo motor; el cierre valida bloqueos y retira la tarea");

    // La UI nueva: espacios, Mantener despierta, puertos y archivadas.
    const spaces = async () => (await vm.call<Space[]>("list_spaces", "w-prod", {})).value;
    const made = (await vm.call<Space>("create_space", "w-prod", { name: "Pagos" })).value;
    await vm.call("rename_space", "w-prod", { id: made.id, name: "Cobros" });
    assert.equal((await spaces()).find((x) => x.id === made.id)?.name, "Cobros");
    const preview = (await vm.call<DeletePreview>("space_delete_preview", "w-prod", { id: made.id })).value;
    const gone = (await vm.call<DeleteOutcome>("delete_space", "w-prod", { id: made.id, seen: { tasks: preview.tasks, discard: false } })).value;
    assert.equal(gone.deleted, true);
    assert.ok(!(await spaces()).some((x) => x.id === made.id));
    assert.equal(vm.available?.("spaces"), "yes");
    ok("espacios: crear, renombrar, ver qué toca eliminar y eliminar (create_space, rename_space, space_delete_preview, delete_space)");

    assert.equal((await vm.call<KeepAwakeStatus>("keep_awake_status", "w-prod", {})).value.mode, "agent");
    assert.equal((await vm.call<KeepAwakeStatus>("set_keep_awake", "w-prod", { mode: "on" })).value.mode, "on");
    assert.equal(vm.available?.("keep_awake"), "yes");
    assert.equal((await vm.call<OpenPorts>("list_ports", "w-prod", {})).value.externos[0].url, "http://localhost:5173");
    await assert.rejects(mac.call("keep_awake_status", "w-prod", {}), (e: HostError) => e.code === "command_unsupported");
    await assert.rejects(mac.call("list_ports", "w-prod", {}), (e: HostError) => e.code === "command_unsupported");
    assert.equal(mac.available?.("keep_awake"), "no");
    assert.equal(mac.available?.("ports"), "no");
    assert.equal(mac.canAct(), "now", "la Mac con su motor anterior sigue en servicio");
    ok("Mantener despierta y puertos (keep_awake_status, set_keep_awake, list_ports); la Mac de motor anterior contesta command_unsupported y solo se apagan esas funciones");

    const archived = (await vm.call<ArchivedTasks>("archived_tasks", "w-prod", {})).value;
    assert.ok(archived.tasks.some((t) => t.id === "t-vm-2" && t.folder === "p-vm-web"), "la que se archivó arriba");
    ok("archivadas de todas las carpetas (archived_tasks)");

    close();
  } finally {
    child.kill();
  }
}

console.log(`\n${steps.length} pasos comprobados.`);
process.exit(0);
