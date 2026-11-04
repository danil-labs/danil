/** Computers that are off, other engine contracts and per-machine AI credentials in the browser panel. Mounts `dist-web/`. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { sleep } from "../helpers/jsdom-app.mjs";
import { MAC, VM, account, on, open, table, until } from "../helpers/web-machines.mjs";

test("an action on a computer that is off and cannot be woken fails short and neutral", async () => {
  const { app, invoke, calls, doc, text } = await open("web-machines-off", [VM, MAC], {
    cmp_vm: { table: table("Panel", "Tarea de la VM") },
    cmp_mac: { table: table("Notas", "Tarea del Mac"), state: "offline", cachedAt: "2026-10-18T21:30:00Z" },
  });

  assert.ok(doc.querySelector('[data-sesion="cmp_mac~t1"]'), "the Mac's copy shows");
  assert.equal(doc.querySelector('[data-machine-row="cmp_mac"]')?.dataset.state, "offline");
  const taskRow = doc.querySelector('[data-sesion="cmp_mac~t1"]');
  assert.equal(taskRow.querySelector("[data-folder-chip]")?.getAttribute("title") ?? null, null, "no native tooltip over the task card");
  taskRow.parentElement.dispatchEvent(new app.w.PointerEvent("pointerenter", { pointerType: "mouse" }));
  await sleep(900);
  const machine = doc.querySelector('[data-hover-machine="cmp_mac"]');
  assert.ok(machine?.parentElement.textContent.includes("Mac de Ana"), "the task card names its machine");
  assert.ok(machine?.parentElement.textContent.includes("(macOS)"), "the task card names the system after the machine");
  assert.equal(machine.getAttribute("aria-label"), "apagada");
  const vmRow = doc.querySelector('[data-sesion="cmp_vm~t1"]');
  vmRow.parentElement.dispatchEvent(new app.w.PointerEvent("pointerenter", { pointerType: "mouse" }));
  await sleep(900);
  const vmCard = doc.querySelector('[data-hover-machine="cmp_vm"]');
  assert.ok(vmCard?.parentElement.textContent.includes("Danil VM"), "the VM card names its machine");
  assert.ok(vmCard?.parentElement.textContent.includes("(Linux)"), "the VM card names Linux when the row says so");
  await assert.rejects(invoke("send_message", { session: "cmp_mac~t1", text: "hola" }, on("cmp_mac")), (e) => {
    assert.equal(e.what, "Mac de Ana está sin conexión. Verifica que Danil esté abierto y tenga acceso a internet.");
    return true;
  });
  assert.equal(calls("cmp_mac", "send_message").length, 0, "nothing tries to start a computer the relay cannot start");
  assert.equal(doc.querySelector('[data-machine-row="cmp_mac"]')?.dataset.state, "offline", "it stays off, not starting");
  assert.ok(!text().includes("Algo se rompió"), "no generic failure");
  assert.deepEqual(app.failures, []);
});

test("a machine with another engine contract needs an update and never breaks the panel", async () => {
  const OLD = { computer_id: "cmp_old", name: "Servidor viejo", state: "online", provider: "aws-ec2" };
  const { app, invoke, calls, doc, text } = await open("web-machines-outdated", [VM, MAC, OLD], {
    cmp_vm: { table: table("Panel", "Tarea de la VM", {}, "pv") },
    cmp_mac: { table: table("Notas", "Tarea del Mac", {}, "pm") },
    cmp_old: { table: table("Viejo", "Tarea vieja", {}, "po"), outdated: true },
  });

  const old = doc.querySelector('[data-machine-row="cmp_old"]');
  assert.equal(old?.dataset.state, "outdated");
  assert.ok(old.textContent.includes("Necesita actualizarse"));
  assert.ok(text().includes("Panel") && text().includes("Notas"), "the other machines still fill the panel");
  const projects = await invoke("list_projects");
  assert.deepEqual(projects.map((p) => p.id).sort(), ["pm", "pv"]);
  const before = calls("cmp_old", "list_projects").length;
  await invoke("list_projects");
  assert.equal(calls("cmp_old", "list_projects").length, before, "it is left out of later reads");
  await assert.rejects(invoke("send_message", { session: "cmp_old~t1", text: "hola" }, on("cmp_old")), (e) => {
    assert.equal(e.what, "Servidor viejo necesita actualizarse antes de usarla desde aquí.");
    return true;
  });
  assert.equal(calls("cmp_old", "send_message").length, 0);
  assert.ok(!(await invoke("machine_list")).some((m) => m.id === "cmp_old"), "it is not offered to run new tasks");
  assert.deepEqual(app.failures, []);
});

test("AI credentials with the same email keep separate cards and machine actions", async () => {
  const vmAccounts = { provider: "claude", env_var: "", shared_credential: null, secret_note: null, active: "a1", accounts: [account("a1", "ana@example.com", "Personal"), account("a2", "ana@example.com", "Team")] };
  const macAccounts = { provider: "claude", env_var: "", shared_credential: null, secret_note: null, active: "m1", accounts: [account("m1", "Ana@Example.com")] };
  const { app, invoke, calls } = await open("web-machines-accounts", [VM, MAC], {
    cmp_vm: { table: table("Panel", "Tarea de la VM", {
      list_accounts: vmAccounts,
      account_limits: ({ id }) => ({ mode: "read", plan: id === "a1" ? "Personal" : "Team", windows: [] }),
      set_active_account: null,
    }) },
    cmp_mac: { table: table("Notas", "Tarea del Mac", { list_accounts: macAccounts }) },
  });

  const list = await invoke("list_accounts", { provider: "claude" });
  assert.equal(list.accounts.length, 3, "Personal, Team and the Mac credential stay separate despite sharing email");
  const [ana, other] = list.accounts;
  assert.equal(ana.id, "cmp_vm~a1");
  assert.deepEqual(ana.machines.map((m) => [m.machine, m.id, m.on]), [["cmp_vm", "cmp_vm~a1", true]]);
  assert.deepEqual(list.accounts[2].machines.map((m) => [m.machine, m.id, m.on]), [["cmp_mac", "cmp_mac~m1", true]]);
  assert.equal(list.active, "cmp_vm~a1");
  assert.equal(other.label, "Team", "the second credential keeps its own label");
  assert.deepEqual(other.machines.map((m) => m.machine), ["cmp_vm"]);
  const personal = await invoke("account_limits", { provider: "claude", id: ana.id, force: false }, on("cmp_vm"));
  const team = await invoke("account_limits", { provider: "claude", id: other.id, force: false }, on("cmp_vm"));
  assert.deepEqual([personal.plan, team.plan], ["Personal", "Team"], "each card reads its own subscription usage");
  await invoke("set_active_account", { provider: "claude", id: other.id }, on("cmp_vm"));
  assert.equal(calls("cmp_vm", "set_active_account").at(-1).args.id, "a2", "Team can be selected independently");

  await invoke("remove_account", { provider: "claude", id: "cmp_mac~m1" }, on("cmp_mac"));
  assert.deepEqual(calls("cmp_mac", "remove_account").map((c) => c.args.id), ["m1"], "signing out is per machine");
  assert.equal(calls("cmp_vm", "remove_account").length, 0);
  await invoke("add_account", { provider: "claude", label: "" }, { headers: { "x-terminus-machine": "cmp_mac" } }).catch(() => {});
  assert.equal(calls("cmp_mac", "add_account").length, 1, "signing in on another machine goes to that machine");
  assert.deepEqual(app.failures, []);
});

test("one subscription shows both machine chips while Team keeps its own card and actions", async () => {
  const list = (active, accounts) => ({ provider: "codex", env_var: "", shared_credential: null, secret_note: null, active, accounts });
  const status = (id, plan) => ({ id, authenticated: true, detail: `ana@example.com · ${plan}` });
  const { app, calls, doc } = await open("web-account-subscriptions", [VM, MAC], {
    cmp_vm: { table: table("Panel", "VM", {
      list_language_packs: [],
      list_bundled_language_packs: [],
      get_profile: { name: "Fixture" },
      get_project_directory: "/lab",
      list_accounts: list("personal", [account("personal", "ana@example.com"), account("team", "ana@example.com")]),
      account_status: ({ id }) => status(id, id === "personal" ? "Pro" : "Team"),
      account_limits: ({ id }) => ({ mode: "read", plan: id === "personal" ? "Pro" : "Team", windows: [] }),
      set_active_account: null,
      tasks_awaiting_quota: [],
    }) },
    cmp_mac: { table: table("Notas", "Mac", {
      list_accounts: list("copy", [account("copy", "Ana@Example.com")]),
      account_status: ({ id }) => status(id, "Pro"),
      account_limits: { mode: "read", plan: "Pro", windows: [] },
    }) },
  });
  const button = (label) => [...doc.querySelectorAll("button")].find((b) => b.textContent?.trim() === label || b.getAttribute("aria-label") === label);
  button("Configuración").click();
  assert.ok(await until(() => button("Cuentas de IA")));
  button("Cuentas de IA").click();
  assert.ok(await until(() => doc.querySelectorAll('[data-account-machines="cmp_vm~personal"] [data-account-machine]').length === 2));
  assert.equal(doc.querySelectorAll("[data-account-machines]").length, 2, "one Pro card and one Team card");
  const personal = doc.querySelector('[data-account-machines="cmp_vm~personal"]');
  const team = doc.querySelector('[data-account-machines="cmp_vm~team"]');
  assert.deepEqual([...personal.querySelectorAll("[data-account-machine]")].map((m) => m.dataset.accountMachine), ["cmp_vm", "cmp_mac"]);
  assert.deepEqual([...team.querySelectorAll("[data-account-machine]")].map((m) => m.dataset.accountMachine), ["cmp_vm"]);
  const useTeam = [...team.previousElementSibling.querySelectorAll("button")].find((b) => b.textContent.trim() === "Usar esta");
  assert.ok(useTeam);
  useTeam.click();
  assert.ok(await until(() => calls("cmp_vm", "set_active_account").some((c) => c.args.id === "team")));
  const mac = doc.querySelector('[data-account-machines="cmp_vm~personal"] [data-account-machine="cmp_mac"]');
  mac.querySelector("button").click();
  mac.querySelector("[data-sign-out-yes]").click();
  assert.ok(await until(() => calls("cmp_mac", "remove_account").some((c) => c.args.id === "copy")));
  assert.equal(calls("cmp_vm", "remove_account").length, 0, "sign out removes only the selected machine's credential");
  assert.deepEqual(app.failures, []);
});

test("provider login from settings receives its link and code", async () => {
  let created = false;
  const { app, f, calls, doc } = await open("web-settings-login", [VM, MAC], {
    cmp_vm: { table: table("Panel", "VM", {
      list_language_packs: [],
      list_bundled_language_packs: [],
      get_profile: { name: "Fixture" },
      get_project_directory: "/lab",
      list_accounts: () => ({ provider: "codex", active: null, accounts: created ? [account("new", null)] : [] }),
      add_account: () => { created = true; return account("new", null); },
      login_account: null,
      account_status: { authenticated: false, detail: "" },
      tasks_awaiting_quota: [],
    }) },
    cmp_mac: { table: table("Notas", "Mac", {
      list_accounts: { provider: "codex", active: null, accounts: [] },
      add_account: account("mac-new", null),
      login_account: null,
    }) },
  });
  const button = (label) => [...doc.querySelectorAll("button")].find((b) => b.textContent?.trim() === label || b.getAttribute("aria-label") === label);
  button("Configuración").click();
  assert.ok(await until(() => button("Cuentas de IA")));
  button("Cuentas de IA").click();
  assert.ok(await until(() => button("+ Agregar cuenta")));
  button("+ Agregar cuenta").click();
  assert.ok(await until(() => calls("cmp_vm", "login_account").length));
  app.w.open = () => null;
  f.relays.cmp_vm.push({ type: "events", cursor: 1, runtime: "rt1", gap: false, events: [
    { name: "account", payload: { account: "new", kind: "url", text: "https://auth.example/device" } },
    { name: "account", payload: { account: "new", kind: "confirm", text: "ABCD-1234" } },
  ] });
  assert.ok(await until(() => doc.body.textContent.includes("ABCD-1234")), "the login dialog shows the code");
  assert.ok(button("Abrir navegador"), "the login dialog offers the provider's page");
  f.relays.cmp_vm.push({ type: "events", cursor: 2, runtime: "rt1", gap: false, events: [
    { name: "account", payload: { account: "new", kind: "done", text: "Login failed" } },
  ] });
  assert.ok(await until(() => button("Reintentar")), "a failed login can be retried");
  assert.equal(button("Abrir en la Terminal"), undefined, "web login never offers a terminal on the remote machine");
  assert.ok(await until(() => doc.querySelector("[data-sign-in-elsewhere]")));
  const elsewhere = doc.querySelector("[data-sign-in-elsewhere]");
  elsewhere.dispatchEvent(new app.w.PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "mouse" }));
  elsewhere.click();
  assert.ok(await until(() => doc.querySelector('[data-sign-in-on="cmp_mac"]')));
  doc.querySelector('[data-sign-in-on="cmp_mac"]').dispatchEvent(new app.w.KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
  assert.ok(await until(() => calls("cmp_mac", "login_account").length), "sign in elsewhere starts the CLI on the chosen machine");
  assert.deepEqual(calls("cmp_mac", "login_account")[0].args, { provider: "codex", id: "mac-new", mode: "tuberia" });
  f.relays.cmp_mac.push({ type: "events", cursor: 1, runtime: "rt1", gap: false, events: [
    { name: "account", payload: { account: "mac-new", kind: "confirm", text: "MAC-1234" } },
  ] });
  assert.ok(await until(() => doc.body.textContent.includes("MAC-1234")), "the chosen machine's login reaches the same dialog");
  assert.deepEqual(app.failures, []);
});

// Un cambio de contrato nunca deja sin uso máquinas enteras: como el teléfono,
// solo `version_mismatch` del relay o del motor la marca desactualizada.
test("an engine of the previous additive family stays in service", async () => {
  const contract = "3972c281dba1b61f9ad06fc82fbf059af3dbc55770b0a1bcb59ce786ec0a56f1";
  const { app, calls, doc, text } = await open("web-machines-additive-contract", [{ ...VM, contract }], {
    cmp_vm: { table: table("Panel actualizado", "Tarea de la VM"), contract },
  });
  assert.ok(await until(() => text().includes("Panel actualizado")), "its panel is read as usual");
  assert.equal(doc.querySelector('[data-machine-row="cmp_vm"]')?.dataset.state, "online");
  assert.ok(calls("cmp_vm", "list_projects").length > 0);
  assert.deepEqual(app.failures, []);
});

test("a machine on another contract is not marked outdated by its hash", async () => {
  const own = createHash("sha256").update(readFileSync(new URL("../../src-tauri/crates/engine-protocol/commands.json", import.meta.url))).digest("hex");
  const { app, calls, doc, text } = await open("web-machines-contract", [{ ...VM, contract: own }, { ...MAC, contract: "0".repeat(64) }], {
    cmp_vm: { table: table("Panel", "Tarea de la VM", {}, "pv") },
    cmp_mac: { table: table("Notas", "Tarea del Mac", {}, "pm") },
  });
  assert.ok(await until(() => text().includes("Panel") && text().includes("Notas")), "both panels are read");
  assert.equal(doc.querySelector('[data-machine-row="cmp_vm"]')?.dataset.state, "online");
  assert.equal(doc.querySelector('[data-machine-row="cmp_mac"]')?.dataset.state, "online", "another contract keeps working");
  assert.ok(calls("cmp_mac", "list_projects").length > 0);
  assert.deepEqual(app.failures, []);
});

test("a computer the relay cannot start answers off at once, never starting", async () => {
  // Without `provider` the list does not say it is the person's own: the relay does.
  const OWN = { computer_id: "cmp_own", name: "Portátil", state: "offline" };
  const { app, invoke, calls, doc } = await open("web-machines-not-startable", [VM, OWN], {
    cmp_vm: { table: table("Panel", "Tarea de la VM") },
    cmp_own: { table: table("Notas", "Tarea del portátil"), state: "offline", notStartable: true },
  });
  await assert.rejects(invoke("send_message", { session: "cmp_own~t1", text: "hola" }, on("cmp_own")), (e) => {
    assert.equal(e.what, "Portátil está sin conexión. Verifica que Danil esté abierto y tenga acceso a internet.");
    return true;
  });
  assert.equal(calls("cmp_own", "send_message").length, 1, "the relay was asked and refused");
  assert.equal(doc.querySelector('[data-machine-row="cmp_own"]')?.dataset.state, "offline", "it never shows as starting");
  assert.deepEqual(app.failures, []);
});

test("el composer web sigue las credenciales de la máquina elegida y de la tarea abierta", async () => {
  const { app, doc, calls } = await open("web-composer-machine", [VM, MAC], {
    cmp_vm: { table: table("Panel", "Tarea de la VM") },
    cmp_mac: { table: table("Panel", "Tarea del Mac", {
      list_surfaces: [{ id: "claude", provider: "claude", label: "Claude Code", catalogo: "todo", usable: true, marca: null, porque: null }],
      list_models: ({ provider }) => ({ provider, models: [{ id: "remote-sonnet", label: "Sonnet del Mac", efforts: [], default_effort: null }], fallback: false }),
    }) },
  });
  doc.querySelector('[aria-label="Ejecutar en"]').click();
  assert.ok(await until(() => doc.querySelector('[data-machine-option="cmp_mac"]')));
  doc.querySelector('[data-machine-option="cmp_mac"]').click();
  assert.ok(await until(() => doc.querySelector('[aria-label*="Sonnet del Mac"]')), "el composer sigue ofreciendo solo lo autenticado en la VM");
  assert.ok(calls("cmp_mac", "list_surfaces").length, "no consulta las credenciales del Mac");
  const before = calls("cmp_vm", "list_surfaces").length;
  doc.querySelector('[data-sesion="cmp_vm~t1"]').click();
  assert.ok(await until(() => calls("cmp_vm", "list_surfaces").length > before), "la tarea abierta usa la máquina del borrador");
  assert.ok(await until(() => !doc.querySelector('[aria-label*="Sonnet del Mac"]')), "la tarea de la VM conserva el modelo del Mac");
  assert.ok(await until(() => doc.querySelector("[data-task-location]")));
  assert.equal(doc.querySelector("[data-task-git-actions]"), null);
  await sleep(100);
  assert.deepEqual(app.failures, []);
  app.w.close();
});
