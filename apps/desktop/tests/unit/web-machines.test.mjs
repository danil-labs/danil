/**
 * One panel over every computer of the person: the browser build opens a relay
 * session per computer, joins their workspaces and projects by id (the same on
 * every machine) and their tasks (each with its machine and an id that cannot
 * collide), sends each command to the machine of its envelope (the
 * `x-terminus-machine` header, never its arguments), creates where the person
 * chose (making the workspace that machine's own first), fails short and
 * neutral on a computer that is off and cannot be woken, leaves out one that
 * speaks another contract, and keeps each registered AI credential separate.
 * Mounts `dist-web/`.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { engine } from "../helpers/fake-relay.mjs";
import { sleep } from "../helpers/jsdom-app.mjs";
import { MAC, SAME, VM, account, folder, on, open, registry, table, until } from "../helpers/web-machines.mjs";

test("a primary context on another machine clears the empty-context notice", async () => {
  const configured = { workspaces: [{ ...SAME, context_root: "/lab/context" }], active: "w" };
  const { app, invoke, text } = await open("web-context-source", [VM, MAC], {
    cmp_vm: { table: table("Panel", "VM") },
    cmp_mac: { table: table("Notas", "Mac", { list_workspaces: configured, workspaces_startup: configured }) },
  });
  try {
    for (const command of ["workspaces_startup", "list_workspaces"]) {
      const startup = await invoke(command);
      assert.equal(startup.workspaces[0].context_root, "/lab/context");
    }
    assert.ok(!text().includes("Sin fuente de contexto"), "the workspace has context on the Mac");
  } finally {
    app.w.close();
  }
});

test("two machines show together and each command goes to the machine it names", async () => {
  const { app, invoke, calls, doc, text } = await open("web-machines", [VM, MAC], {
    cmp_vm: { table: table("Panel", "Tarea de la VM", { list_slash_menu: { commands: [], skills: [], side_question: "btw" } }, "pv") },
    cmp_mac: { table: table("Notas", "Tarea del Mac", {
      list_slash_menu: { commands: [], skills: [], side_question: "btw" },
      ask_side_question: { answer: "Respuesta de la Mac" },
      list_workspace_attention: [{ workspace: "w", tasks: [{ session: "t1", project: "pm", state: "unseen" }] }],
      mark_task_seen: null,
      load_session: (args) => ({ ...engine.load_session(args), turns: [{ id: "a1", role: "agent", text: "Respuesta guardada", at: 1 }] }),
      prepare_session_continuation: { path: "/lab/continuation.md", last_prompt: "", last_reply: "Respuesta guardada", sources: [], excluded_sources: [] },
      list_session_git: ({ project: p }) => (p === "pm" ? { t1: { kind: "branch", branch: "feat/notas", repository: "/lab/pm" } } : {}),
    }, "pm") },
  });

  assert.ok(text().includes("Panel") && text().includes("Notas"), "the projects of both machines are in the sidebar");
  assert.ok(doc.querySelector('[data-sesion="cmp_vm~t1"]'), "the VM task has its namespaced id");
  assert.ok(doc.querySelector('[data-sesion="cmp_mac~t1"]'), "the Mac task with the same raw id does not collide");
  assert.ok(doc.querySelector('[data-sesion="cmp_vm~t1"] [data-machine]'), "the rail card keeps the machine in its fixed slot");
  assert.ok(calls("cmp_vm", "list_projects").some((c) => c.workspace === "w"), "the VM gets the workspace id");
  assert.ok(calls("cmp_mac", "list_projects").some((c) => c.workspace === "w"), "the Mac gets the same workspace id");
  assert.deepEqual([...doc.querySelectorAll("[data-machine-row]")].map((r) => r.dataset.state), ["online", "online"]);
  const projects = await invoke("list_projects");
  assert.deepEqual(projects.map((p) => [p.id, p.machines]), [["pv", ["cmp_vm"]], ["pm", ["cmp_mac"]]], "projects keep their ids and say where they live");

  const git = await invoke("list_session_git", { project: "pm", remote: false, priority: ["cmp_mac~t1"] });
  assert.deepEqual(Object.keys(git), ["cmp_mac~t1"], "a task's git status is keyed by the id the panel knows");
  assert.equal(git["cmp_mac~t1"].branch, "feat/notas");
  assert.deepEqual(calls("cmp_mac", "list_session_git").at(-1).args.priority, ["t1"], "the Mac is asked with its own task ids");

  const task = await invoke("load_session", { project: "pm", id: "cmp_mac~t1" }, on("cmp_mac"));
  assert.equal(task.id, "cmp_mac~t1");
  const read = calls("cmp_mac", "load_session").at(-1);
  assert.deepEqual([read.args.project, read.args.id, read.workspace], ["pm", "t1", "w"], "the Mac reads its task with the same project and workspace ids");
  assert.equal(calls("cmp_vm", "load_session").length, 0, "the VM is not asked for the Mac's task");

  assert.equal(await invoke("send_message", { session: "cmp_mac~t1", text: "hola" }, on("cmp_mac")), "cmp_mac~t1");
  await assert.rejects(invoke("send_message", { session: "cmp_mac~t1", text: "hola" }, on("cmp_vm")), (e) => e.detail === "cross_machine", "an id of another machine in the args is refused, not followed");
  assert.equal(calls("cmp_mac", "send_message").length, 1);
  assert.equal(calls("cmp_vm", "send_message").length, 0);

  assert.equal((await invoke("create_project", { name: "Nuevo" })).id, "p9", "a new project keeps the id its engine gave it");
  assert.equal(calls("cmp_vm", "create_project").length, 1, "without a choice a project is made on the managed VM");
  await invoke("create_project", { name: "Otro" }, { headers: { "x-terminus-machine": "cmp_mac" } });
  assert.equal(calls("cmp_mac", "create_project").length, 1, "the picked machine makes it");
  await invoke("create_project", { name: "Tercero" });
  assert.equal(calls("cmp_vm", "create_project").length, 2, "without a choice it is the workspace's first machine again, as on the desktop");
  const machines = await invoke("machine_list");
  assert.deepEqual(machines.map((m) => [m.id, m.active, m.hosts]), [["cmp_vm", true, true], ["cmp_mac", false, true]]);

  doc.querySelector('[data-sesion="cmp_mac~t1"]').click();
  await sleep(600);
  const where = doc.querySelector("[data-task-location]");
  assert.equal(where?.querySelector("[data-task-location-machine]")?.textContent, "Mac de Ana", "the task window names the machine that runs it");
  assert.ok(!where?.textContent?.includes("(macOS)"), "the task bar does not name the system");
  assert.equal(where?.querySelector("[data-machine-form]")?.getAttribute("data-machine-form"), "computer", "a physical machine keeps the laptop");
  assert.equal(where?.querySelector("[data-task-location-project]")?.textContent, "Notas");
  assert.ok(calls("cmp_mac", "list_mentions").some((c) => c.args.session === "t1" && c.workspace === "w"), "opening the second machine’s task reads its mention files on that machine");
  assert.ok(!calls("cmp_vm", "list_mentions").some((c) => c.args.session === "t1"), "the first machine never receives the other machine’s task");
  const field = doc.querySelector("textarea");
  field.value = "/btw ¿Qué está pasando?";
  field.dispatchEvent(new app.w.Event("input", { bubbles: true }));
  field.closest("form").dispatchEvent(new app.w.Event("submit", { bubbles: true, cancelable: true }));
  assert.ok(await until(() => text().includes("Respuesta de la Mac")), "the side question is answered by the task’s machine");
  assert.equal(calls("cmp_mac", "ask_side_question").at(-1)?.args.session, "t1");
  assert.equal(calls("cmp_vm", "ask_side_question").length, 0);
  assert.ok(calls("cmp_mac", "mark_task_seen").some((c) => c.args.session === "t1"), "opening the task marks it seen on its machine");
  assert.equal(calls("cmp_vm", "mark_task_seen").length, 0);
  assert.ok(calls("cmp_mac", "task_history").some((c) => c.args.id === "t1" && c.workspace === "w"), "the task’s work history is read from its machine");
  assert.ok(!calls("cmp_vm", "task_history").some((c) => c.args.project === "pm"), "another machine’s history never goes to the default machine");
  doc.querySelector('[aria-label="Crear tarea desde aquí"]').click();
  await sleep(100);
  const continueButton = [...doc.querySelectorAll("button")].find((b) => b.textContent === "Conversación completa");
  assert.ok(continueButton, "the continuation dialog opens");
  continueButton.click();
  assert.ok(await until(() => calls("cmp_mac", "prepare_session_continuation").length === 1), "the continuation is prepared on the task’s machine");
  assert.equal(calls("cmp_mac", "prepare_session_continuation")[0].args.id, "t1");
  assert.equal(calls("cmp_vm", "prepare_session_continuation").length, 0);
  assert.ok(await until(() => doc.querySelector("textarea")?.value.includes("/lab/continuation.md")));
  assert.equal(app.w.localStorage.getItem("harness.layout.machines.run_on"), JSON.stringify({ w: "cmp_mac" }), "la continuación conserva la máquina de su archivo de contexto");
  assert.deepEqual(app.failures, []);
});

test("the usage strip reads an account from its machine when the default machine has no account list", async () => {
  const providers = [{ id: "codex", label: "Codex", available: true, driver: true, limits: true }];
  const { app, calls } = await open("web-machines-usage", [VM, MAC], {
    cmp_vm: { table: table("Panel", "Tarea de la VM", { list_providers: providers, list_accounts: null }) },
    cmp_mac: { table: table("Notas", "Tarea del Mac", {
      list_providers: providers,
      list_accounts: { provider: "codex", accounts: [account("m1", "ana@example.com")], active: "m1" },
      account_limits: { mode: "read", windows: [], at: Date.now() },
      account_status: { id: "m1", authenticated: true, detail: "" },
    }) },
  });
  assert.ok(await until(() => calls("cmp_mac", "account_limits").length > 0), "usage is read from the machine with the account");
  assert.equal(calls("cmp_mac", "account_limits").at(-1).args.id, "m1");
  assert.equal(calls("cmp_mac", "account_status").at(-1)?.args.id, "m1");
  assert.equal(calls("cmp_vm", "account_limits").length, 0);
  assert.equal(calls("cmp_vm", "account_status").length, 0);
  assert.deepEqual(app.failures, []);
});

test("a tab of one machine's task leaves the other machines' tasks in every folder", async () => {
  const { app, invoke, calls } = await open("web-machines-open-tabs", [VM, MAC], {
    cmp_vm: { table: table("Panel", "Tarea de la VM") },
    cmp_mac: { table: table("Panel", "Tarea del Mac") },
  });
  const rows = await invoke("list_live_sessions", { project: "p1", open: ["cmp_vm~t1"] });
  assert.deepEqual(rows.map((r) => r.id).sort(), ["cmp_mac~t1", "cmp_vm~t1"], "the open tab does not send the folder's read to its machine alone");
  assert.deepEqual(calls("cmp_vm", "list_live_sessions").at(-1)?.args.open, ["t1"], "the VM gets its open task with its own id");
  assert.deepEqual(calls("cmp_mac", "list_live_sessions").at(-1)?.args.open, [], "the Mac gets none of another machine's");
  assert.deepEqual(app.failures, []);
});

test("workspaces join by id alone, never by name, and a project is one row with its machines", async () => {
  const LOGO = "/Users/ana/ws/y/logo.png";
  const PNG = "data:image/png;base64,iVBORw0KGgo=";
  const vmList = { workspaces: [SAME, { id: "x", name: "Notas", context_root: null }], active: "w" };
  const macList = { workspaces: [{ ...SAME, name: "W en la Mac" }, { id: "y", name: "Notas", context_root: null, logo: LOGO }], active: "w" };
  const { app, invoke, calls } = await open("web-machines-ids", [VM, MAC], {
    cmp_vm: { table: table("Panel", "Tarea de la VM", { list_workspaces: vmList, workspaces_startup: vmList, list_projects: [folder("p1", "Panel"), folder("pv", "Solo VM")] }) },
    cmp_mac: { table: table("Panel", "Tarea del Mac", { list_workspaces: macList, workspaces_startup: macList, list_projects: [folder("p1", "Panel en la Mac"), folder("pm", "Solo Mac")], preview_file: ({ path }) => ({ data_url: path === LOGO ? PNG : null }) }) },
  });

  const list = await invoke("list_workspaces");
  assert.deepEqual(list.workspaces.map((w) => [w.id, w.name, w.machines]), [["w", "W", ["cmp_vm", "cmp_mac"]], ["x", "Notas", ["cmp_vm"]], ["y", "Notas", ["cmp_mac"]]], "the same id is one workspace; the same name is not");
  const y = list.workspaces.find((w) => w.id === "y");
  assert.equal(y.logo, `cmp_mac~${LOGO}`, "a logo path carries its machine");
  assert.equal((await invoke("preview_file", { path: y.logo, rel: y.logo }, on("cmp_mac"))).data_url, PNG, "and is read there");
  assert.equal(calls("cmp_vm", "preview_file").length, 0);

  const projects = await invoke("list_projects");
  assert.deepEqual(projects.map((p) => [p.id, p.name, p.machines]), [["p1", "Panel", ["cmp_vm", "cmp_mac"]], ["pv", "Solo VM", ["cmp_vm"]], ["pm", "Solo Mac", ["cmp_mac"]]]);
  assert.deepEqual(app.failures, []);
});

test("a new task is born on the machine chosen, with the same project id, and makes the workspace its own first", async () => {
  const W2 = { id: "w2", name: "Producto", context_root: null };
  const vmWorkspaces = [SAME];
  const vmListing = () => ({ workspaces: [...vmWorkspaces], active: "w" });
  const macListing = { workspaces: [SAME, W2], active: "w" };
  const { app, invoke, calls } = await open("web-machines-create", [VM, MAC], {
    cmp_vm: {
      table: table("Panel", "Tarea de la VM", {
        list_workspaces: vmListing,
        workspaces_startup: vmListing,
        list_projects: [folder("p1", "Panel", { remote_url: "https://github.com/danil/panel", materialized: false, working_directory: null })],
        materialize_workspace: ({ id }) => (vmWorkspaces.push({ ...W2, id }), { ...W2, id }),
        send_message: () => "r1",
      }),
    },
    cmp_mac: { table: table("Panel", "Tarea del Mac", { list_workspaces: macListing, workspaces_startup: macListing, list_projects: [folder("p1", "Panel", { remote_url: "https://github.com/danil/panel" })], set_active_workspace: null }) },
  }, registry({ w: ["cmp_vm", "cmp_mac"], w2: ["cmp_mac"] }));

  const projects = await invoke("list_projects");
  assert.deepEqual(projects.map((p) => [p.id, p.machines, p.remote_url]), [["p1", ["cmp_mac"], "https://github.com/danil/panel"]], "the VM knows it from the account but has no folder yet");
  const vm = { headers: { "x-terminus-machine": "cmp_vm" } };
  assert.equal(await invoke("send_message", { project: "p1", session: null, prompt: "hola" }, vm), "cmp_vm~r1");
  assert.deepEqual(calls("cmp_vm", "send_message").map((c) => [c.args.project, c.workspace]), [["p1", "w"]], "the VM got it with the same project id");
  assert.equal(calls("cmp_mac", "send_message").length, 0, "nothing is born on the Mac");
  assert.equal(calls("cmp_vm", "materialize_workspace").length, 0, "a machine that has the workspace makes nothing");

  await invoke("set_active_workspace", { id: "w2" });
  await invoke("list_projects");
  assert.equal((await invoke("machine_list")).find((m) => m.id === "cmp_vm").hosts, false, "the VM lacks the open workspace");
  assert.equal(await invoke("send_message", { project: "p1", session: null, prompt: "otra" }, vm), "cmp_vm~r1");
  assert.deepEqual(calls("cmp_vm", "materialize_workspace").map((c) => [c.args.id, c.workspace]), [["w2", "w2"]], "the VM makes the workspace its own with the same id, said in the envelope");
  assert.deepEqual(calls("cmp_vm", "send_message").at(-1).workspace, "w2", "and then gets the task in it");
  let after = await invoke("list_workspaces");
  for (let attempt = 0; attempt < 20 && !after.workspaces.find(w => w.id === "w2")?.machines.includes("cmp_vm"); attempt++) {
    await sleep(50);
    after = await invoke("list_workspaces");
  }
  assert.deepEqual(after.workspaces.find((w) => w.id === "w2").machines, ["cmp_vm", "cmp_mac"]);
  assert.deepEqual(app.failures, []);
});

test("«Ejecutar en» disables, with the reason, a machine that cannot make the workspace its own, and offers a folder without remote while its machine is on", async () => {
  const VM2 = { computer_id: "cmp_old", name: "VM vieja", state: "online", provider: "aws-ec2" };
  const empty = { workspaces: [], active: null };
  const { app, invoke, calls, doc } = await open("web-machines-picker", [VM, MAC, VM2], {
    cmp_vm: { table: table("Panel", "Tarea de la VM", {}, "pv") },
    cmp_mac: { table: table("Notas", "Tarea del Mac", {}, "pm") },
    cmp_old: { table: table("Nada", "Nada", { list_workspaces: empty, workspaces_startup: empty, list_projects: [] }) },
  }, registry({ w: ["cmp_vm", "cmp_mac"] }));

  const old = { headers: { "x-terminus-machine": "cmp_old" } };
  await assert.rejects(invoke("send_message", { project: "pv", session: null, prompt: "hola" }, old), (e) => {
    assert.equal(e.what, "VM vieja no tiene este workspace y su motor todavía no sabe crearlo. Actualízalo para crear tareas ahí.");
    return true;
  });
  assert.equal(calls("cmp_old", "materialize_workspace").length, 1, "it was asked once");
  assert.equal(calls("cmp_old", "send_message").length, 0, "and never got the task");
  assert.deepEqual((await invoke("machine_list")).find((m) => m.id === "cmp_old"), { id: "cmp_old", local: false, active: false, on: true, power: "on", hosts: false, materializes: false, wakes: true });

  doc.querySelector('[aria-label="Ejecutar en"]').click();
  assert.ok(await until(() => doc.querySelector('[data-machine-option="cmp_mac"]')), "the machine picker opens");
  doc.querySelector('[data-machine-option="cmp_mac"]').click();
  await sleep(300);
  doc.querySelector('[aria-label="Proyecto"]').click();
  assert.ok(await until(() => [...doc.querySelectorAll("button")].some((b) => b.textContent.includes("Notas") && b.textContent.includes("tarea"))), "the project picker opens with that machine's folders");
  [...doc.querySelectorAll("button")].find((b) => b.textContent.includes("Notas") && b.textContent.includes("tarea")).click();
  await sleep(300);
  doc.querySelector('[aria-label="Ejecutar en"]').click();
  assert.ok(await until(() => doc.querySelector("[data-machine-option]")), "the picker opens");
  const option = (id) => doc.querySelector(`[data-machine-option="${id}"]`);
  assert.ok(await until(() => option("cmp_old")?.getAttribute("title")?.includes("no tiene este workspace")), "it reads the machines again when it opens");
  assert.equal(option("cmp_mac").disabled, false, "the machine with the folder is offered");
  assert.equal(option("cmp_vm").querySelector("[data-machine-form]")?.getAttribute("data-machine-form"), "vm");
  assert.equal(option("cmp_mac").querySelector("[data-machine-form]")?.getAttribute("data-machine-form"), "computer", "a physical machine keeps the laptop");
  assert.equal(option("cmp_vm").disabled, false, "a folder without remote is carried from its machine while that one is on");
  assert.ok(!option("cmp_vm").textContent.includes("sin este proyecto"));
  assert.equal(option("cmp_old").disabled, true);
  assert.deepEqual(app.failures, []);
});
