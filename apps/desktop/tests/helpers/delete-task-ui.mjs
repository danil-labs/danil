import assert from "node:assert/strict";
import { boot, sleep } from "./jsdom-app.mjs";
import { responses } from "./push-fixture.mjs";

const scenario = process.argv[2] ?? "stale";
let generation = 0;
let reject = true;
const applications = [];
const member = (id, project) => ({ workspace: "w", project, id, title: `Task ${id}`, working: false,
  files: [{ path: `${id}/ignored.txt`, hash: String(generation) }, ...(generation > 0 ? [{ path: `${id}/new.txt`, hash: "new" }] : [])], inspection: { status: scenario === "inspection" && id === "child" ? "failed" : "complete", ...(scenario === "inspection" && id === "child" ? { error: { message: "Cannot inspect owned files" } } : {}) } });
const app = await boot("listo", "delete-task-consent", responses({
  machine_list: [{ id: "local", local: true, active: true, on: true, hosts: true, features: scenario === "unsupported" ? [] : ["task_lifecycle_v1"] }],
  task_lifecycle_preview: () => ({ members: [member("t1", "p1"), member("child", "p2")], consent: scenario === "inspection" ? null : `snapshot-${++generation}` }),
  task_lifecycle_apply: args => {
    applications.push(args);
    if (scenario === "partial") return { status: "partial", applied: [{ project: "p2", id: "child" }], failures: [{ project: "p1", id: "t1", error: { message: "Disk removal failed" } }] };
    if (reject) throw { code: scenario === "refresh" ? "task_family_consent_changed" : "operation_failed", detail: "family", message: "Family contents changed" };
    return { status: "complete", applied: [{ project: "p1", id: "t1" }, { project: "p2", id: "child" }], failures: [] };
  },
}));
try {
  await sleep(600);
  const doc = app.w.document;
  const click = (root, selector, text) => {
    const button = [...root.querySelectorAll(selector)].find(el => el.textContent.trim() === text);
    assert.ok(button, `button ${text} exists`);
    button.click();
  };
  const row = doc.querySelector('[data-sesion="t1"]');
  assert.ok(row);
  row.querySelector('[aria-haspopup="menu"]').click();
  await sleep(100);
  click(doc, '[role="menuitem"]', "Borrar la tarea");
  await sleep(100);
  click(doc.querySelector('[data-session-confirm]'), 'button', "Borrar la tarea");
  await sleep(250);
  const dialog = () => doc.querySelector('[role="dialog"]');
  assert.ok(dialog());
  if (scenario === "unsupported") {
    assert.match(dialog().textContent, /no admite el borrado/);
    assert.equal(app.commands.includes("task_lifecycle_preview"), false);
    assert.equal([...dialog().querySelectorAll('button')].find(el => el.textContent.trim() === "Borrar la tarea").disabled, true);
    console.log("PASS: unsupported engine blocks deletion without legacy fallback");
    process.exit(0);
  }
  assert.match(dialog().textContent, /Task child/);
  assert.match(dialog().textContent, /P1/);
  assert.match(dialog().textContent, /p2/);
  assert.match(dialog().textContent, /child\/ignored.txt/);
  const remove = () => [...dialog().querySelectorAll('button')].find(el => el.textContent.trim() === "Borrar la tarea");
  assert.equal(remove().disabled, true, "every family member requires review");
  const review = () => [...dialog().querySelectorAll('input[type="checkbox"]')].forEach(input => input.click());
  review();
  if (scenario === "inspection") {
    assert.equal(remove().disabled, true);
    assert.match(dialog().textContent, /No se pudo completar la inspección/);
    assert.equal(applications.length, 0);
    console.log("PASS: failed inspection remains visible and blocks deletion");
    process.exit(0);
  }
  assert.equal(remove().disabled, false);
  remove().click();
  await sleep(150);
  assert.ok(dialog(), "a rejection preserves the dialog");
  if (scenario === "partial") {
    assert.match(dialog().querySelector('[role="alert"]').textContent, /P1 \/ Task t1/);
    assert.equal(remove().disabled, true);
    assert.ok(doc.querySelector('[data-sesion="t1"]'), "an unapplied root remains available");
    console.log("PASS: partial deletion retains the dialog and reports the failed task");
    process.exit(0);
  }
  assert.ok(dialog().querySelector('[role="alert"]'), "error remains inside the dialog");
  assert.equal(remove().disabled, true, "a rejected consent cannot be used again");
  if (scenario === "refresh") {
    assert.equal(generation, 2, "stale family consent automatically refreshes the preview");
    assert.match(dialog().textContent, /child\/new.txt/);
    assert.match(dialog().textContent, /La lista se actualizó/);
  } else {
    click(dialog(), 'button', "Revisar de nuevo");
    await sleep(120);
  }
  assert.ok([...dialog().querySelectorAll('input')].every(input => !input.checked), "new preview resets all review selections");
  assert.equal(remove().disabled, true);
  reject = false;
  review();
  remove().click();
  await sleep(150);
  assert.equal(dialog(), null);
  assert.deepEqual(applications.map(args => args.consent), ['snapshot-1', 'snapshot-2']);
  assert.ok(applications.every(args => args.discard === true));
  assert.deepEqual(app.failures, []);
  console.log("PASS: grouped family review, stale consent, modal error, explicit reconfirmation, applied cleanup");
} finally { app.w.close(); }

process.exit(0);
