import assert from "node:assert/strict";
import { boot, sleep } from "./jsdom-app.mjs";
import { responses } from "./push-fixture.mjs";

const scenario = process.argv[2] ?? "stale";
let generation = 0;
// Families without losses are applied as soon as the preview returns.
let reject = !["clean", "working", "concurrent"].includes(scenario);
const previews = [];
const applications = [];
const member = (id, project) => ({ workspace: "w", project, id, title: `Task ${id}`, working: false,
  files: [{ path: `${id}/ignored.txt`, hash: String(generation) }, ...(generation > 0 ? [{ path: `${id}/new.txt`, hash: "new" }] : [])], inspection: { status: scenario === "inspection" && id === "child" ? "failed" : "complete", ...(scenario === "inspection" && id === "child" ? { error: { message: "Cannot inspect owned files" } } : {}) } });
// clean: nothing to lose; working: an active turn and no files; cleanfailed: no files but one inspection failed;
// cleanchanged: a file appears after the preview; mixed: only some members list losses.
const clean = (id, project) => ({ workspace: "w", project, id, title: `Task ${id}`, working: false, files: [], inspection: { status: "complete" } });
const family = () => ["clean", "concurrent"].includes(scenario) ? [clean("t1", "p1"), clean("child", "p2")]
  : scenario === "working" ? [clean("t1", "p1"), { ...clean("child", "p2"), working: true }]
  : scenario === "cleanfailed" ? [clean("t1", "p1"), { ...clean("child", "p2"), inspection: { status: "failed", error: { message: "Cannot inspect owned files" } } }]
  : scenario === "cleanchanged" ? [clean("t1", "p1"), generation > 0 ? member("child", "p2") : clean("child", "p2")]
  : scenario === "mixed" ? [member("t1", "p1"), clean("quiet", "p1"), member("child", "p2"), { ...clean("runner", "p2"), working: true }]
  : [member("t1", "p1"), member("child", "p2")];
const app = await boot("listo", "delete-task-consent", responses({
  machine_list: [{ id: "local", local: true, active: true, on: true, hosts: true, features: scenario === "unsupported" ? [] : ["task_lifecycle_v1"] }],
  task_lifecycle_preview: args => (previews.push(args.id), scenario === "concurrent" ? sleep(500) : Promise.resolve()).then(() => ({ members: family(), consent: ["inspection", "cleanfailed"].includes(scenario) ? null : `snapshot-${++generation}` })),
  task_lifecycle_apply: args => {
    applications.push(args);
    if (scenario === "partial") return { status: "partial", applied: [{ project: "p2", id: "child" }], failures: [{ project: "p1", id: "t1", error: { message: "Disk removal failed" } }] };
    if (reject) throw { code: ["refresh", "cleanchanged"].includes(scenario) ? "task_family_consent_changed" : scenario === "busy" ? "task_family_busy" : "operation_failed", detail: "family", message: "Family contents changed" };
    return { status: "complete", applied: family().map(({ project, id }) => ({ project, id })), failures: [] };
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
  if (scenario === "concurrent") {
    assert.match(doc.body.textContent, /Borrando la tarea…/, "the hidden phase shows its progress");
    doc.querySelector('[data-sesion="t2"] [aria-haspopup="menu"]').click();
    await sleep(100);
    click(doc, '[role="menuitem"]', "Borrar la tarea");
    await sleep(100);
    click(doc.querySelector('[data-session-confirm]'), 'button', "Borrar la tarea");
    await sleep(700);
    assert.deepEqual(previews, ["t1"], "a second deletion waits for the first one");
    assert.deepEqual(applications.map(args => [args.id, args.consent]), [["t1", "snapshot-1"]]);
    assert.equal(dialog(), null);
    assert.doesNotMatch(doc.body.textContent, /Borrando la tarea…/);
    assert.deepEqual(app.failures, []);
    console.log("PASS: a second deletion does not take over the hidden one");
    process.exit(0);
  }
  if (!["clean", "working"].includes(scenario)) assert.ok(dialog());
  if (scenario === "unsupported") {
    assert.match(dialog().textContent, /no admite el borrado/);
    assert.equal(app.commands.includes("task_lifecycle_preview"), false);
    assert.equal([...dialog().querySelectorAll('button')].find(el => el.textContent.trim() === "Borrar la tarea").disabled, true);
    console.log("PASS: unsupported engine blocks deletion without legacy fallback");
    process.exit(0);
  }
  const remove = () => [...dialog().querySelectorAll('button')].find(el => el.textContent.trim() === "Borrar la tarea");
  const reviewAll = () => dialog().querySelector('[data-delete-review-all]');
  const boxes = () => [...dialog().querySelectorAll('input[type="checkbox"]:not([data-delete-review-all])')];
  if (scenario === "clean" || scenario === "working") {
    assert.equal(dialog(), null, "a family without losses opens no second window");
    assert.deepEqual(applications.map(args => [args.consent, args.discard]), [["snapshot-1", false]]);
    assert.deepEqual(app.failures, []);
    console.log(`PASS: ${scenario}: a family without losses is deleted directly`);
    process.exit(0);
  }
  if (scenario === "cleanfailed") {
    assert.ok(dialog(), "a failed inspection is not treated as having no losses");
    assert.match(dialog().textContent, /No se pudo completar la inspección/);
    assert.equal(remove().disabled, true);
    assert.equal(applications.length, 0);
    console.log("PASS: a failed inspection opens the review and deletes nothing");
    process.exit(0);
  }
  if (scenario === "cleanchanged") {
    assert.ok(dialog(), "a change after the inspection opens the review");
    assert.equal(applications.length, 1, "the engine refusal is never reapplied automatically");
    assert.equal(generation, 2);
    assert.match(dialog().textContent, /child\/new.txt/);
    assert.match(dialog().textContent, /La lista se actualizó/);
    assert.equal(remove().disabled, true, "the new losses require acceptance");
    assert.ok(boxes().length > 0);
    console.log("PASS: a family that changes after its inspection keeps the protection");
    process.exit(0);
  }
  if (scenario === "mixed") {
    assert.equal(boxes().length, 2, "only members with listed files ask for acceptance");
    assert.match(dialog().textContent, /turno activo/, "an active turn is reported without asking for acceptance");
    assert.ok(reviewAll(), "several members with losses offer accept all");
    assert.equal(remove().disabled, true);
    boxes()[0].click();
    assert.equal(reviewAll().checked, false);
    assert.equal(remove().disabled, true, "one accepted member is not enough");
    reviewAll().click();
    assert.ok(boxes().every(box => box.checked), "accept all marks every member with losses");
    assert.equal(reviewAll().checked, true);
    assert.equal(remove().disabled, false);
    reviewAll().click();
    assert.ok(boxes().every(box => !box.checked), "accept all clears them again");
    assert.equal(remove().disabled, true);
    reviewAll().click();
    click(dialog(), 'button', "Revisar de nuevo");
    await sleep(120);
    assert.ok(boxes().every(box => !box.checked) && !reviewAll().checked, "a new inspection resets accept all");
    assert.equal(remove().disabled, true);
    reviewAll().click();
    reject = false;
    remove().click();
    await sleep(150);
    assert.equal(dialog(), null);
    assert.deepEqual(applications.map(args => [args.consent, args.discard]), [["snapshot-2", true]]);
    assert.deepEqual(app.failures, []);
    console.log("PASS: accept all covers only members with losses and resets on a new inspection");
    process.exit(0);
  }
  assert.match(dialog().textContent, /Task child/);
  assert.match(dialog().textContent, /P1/);
  assert.match(dialog().textContent, /p2/);
  assert.match(dialog().textContent, /child\/ignored.txt/);
  assert.equal(remove().disabled, true, "every family member requires review");
  const review = () => boxes().forEach(input => input.click());
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
  if (scenario === "busy") {
    assert.match(dialog().querySelector('[role="alert"]').textContent, /Otra operación está en curso/);
    assert.equal(remove().disabled, false, "a busy rejection preserves consent for an explicit retry");
    assert.equal(generation, 1, "busy does not repeat the inspection");
    reject = false;
    remove().click();
    await sleep(150);
    assert.equal(dialog(), null);
    assert.deepEqual(applications.map(args => args.consent), ['snapshot-1', 'snapshot-1']);
    assert.deepEqual(app.failures, []);
    console.log("PASS: transient contention keeps review and supports an explicit retry");
    process.exit(0);
  }
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
