import assert from "node:assert/strict";
import { test } from "node:test";
import { actionFailure, createActionFeedback } from "../../src/lib/actionFailure.ts";
import { asFailure } from "../../src/lib/failure.ts";
import { canRepeat, neverRan, retrying, untilConnected, WAITS } from "../../src/lib/invoke.ts";

function service(failures: number, code = "app_unavailable") {
  const waits: number[] = [];
  let attempts = 0;
  const call = async () => {
    attempts += 1;
    if (attempts <= failures) throw { what: "shell.service.unreachable", detail: code };
    return "listo";
  };
  return {
    waits,
    attempts: () => attempts,
    run: () => retrying(call, async (ms) => void waits.push(ms)),
  };
}

test("el servicio que vuelve no llega a la pantalla", async () => {
  const s = service(3);
  assert.equal(await s.run(), "listo");
  assert.equal(s.attempts(), 4);
  assert.deepEqual(s.waits, WAITS.slice(0, 3));
});

test("el servicio que no vuelve falla una sola vez, al final", async () => {
  const s = service(99);
  await assert.rejects(s.run());
  assert.equal(s.attempts(), WAITS.length + 1);
});

test("lo que pudo ejecutarse no se repite", async () => {
  for (const code of ["io", "operation_failed", "task_busy"]) {
    const s = service(1, code);
    await assert.rejects(s.run());
    assert.equal(s.attempts(), 1);
    assert.deepEqual(s.waits, []);
  }
});

test("a read is repeated after io, a write is not", () => {
  const io = { what: { clave: "shell.service.unreachable" }, detail: "io" };
  assert.equal(canRepeat("list_workspaces", io), true);
  assert.equal(canRepeat("account_status", io), true);
  assert.equal(canRepeat("load_session", io), true);
  assert.equal(canRepeat("send_message", io), false, "it may have run: repeating would send twice");
  assert.equal(canRepeat("save_queue", io), false);
  assert.equal(canRepeat("delete_workspace", io), false);
});

test("the disk sweep is not repeated after io: it is still running in the engine", () => {
  const io = { detail: "io" };
  assert.equal(canRepeat("list_storage", io), false);
  assert.equal(canRepeat("list_storage", { detail: "service_busy" }), true);
});

test("antes del motor la orden espera a que conecte y se repite una vez", async () => {
  let up = false;
  let attempts = 0;
  const call = async () => {
    attempts += 1;
    if (!up) throw { what: { clave: "shell.service.engine_down" }, detail: "engine_down" };
    return "listo";
  };
  const result = untilConnected(call, () => up, async () => {
    up = true;
  });
  assert.equal(await result, "listo");
  assert.equal(attempts, 2);
});

test("con el motor ya conectado, engine_down llega a la pantalla", async () => {
  let waited = false;
  const call = async () => {
    throw { detail: "engine_down" };
  };
  await assert.rejects(untilConnected(call, () => true, async () => void (waited = true)));
  assert.equal(waited, false);
});

test("a proxy failure with engine detail keeps its code inside detail", () => {
  const busy = { what: { clave: "shell.service.busy" }, detail: { code: "service_busy", message_key: "cli.error.service_busy", detail: { task: "t1" } } };
  assert.equal(neverRan(busy), true);
  assert.equal(neverRan({ what: { clave: "shell.service.failed" }, detail: { code: "forbidden", detail: {} } }), false);
});

 test("explicit engine error code takes precedence over diagnostic text", () => {
  assert.equal(canRepeat("task_lifecycle_apply", { code: "task_family_consent_changed", detail: "service_busy" }), false);
  assert.equal(neverRan({ code: "service_busy", detail: "writers" }), true);
});

test("a lost response in the task list names the action and keeps its diagnostic", () => {
  const failure = { what: { clave: "shell.service.unreachable" }, detail: "io" };
  const actions = ["finish", "archive", "discard", "pin", "unpin"] as const;
  for (const action of actions) {
    assert.deepEqual(actionFailure(failure, action), {
      what: { clave: `projects.sessions.unconfirmed_${action}` },
      detail: "io",
    });
  }
  assert.deepEqual(actionFailure(failure, "blockers"), {
    what: { clave: "projects.sessions.unchecked_blockers" },
    detail: "io",
  });
});

test("a lost response reports an available request ID without adding action arguments", () => {
  const what = { clave: "shell.service.unreachable" };
  const project = "/private/work";
  assert.equal(
    actionFailure({ what, detail: "io", request_id: "r-1", project, files: [project] }, "archive").detail,
    "io\nrequest_id: r-1",
  );
  const nested = { what, detail: { code: "io", detail: { request_id: "r-2" } } };
  assert.equal(actionFailure(nested, "finish").detail, `${asFailure(nested).detail}\nrequest_id: r-2`);
  const unsafe = { code: "io", request_id: `r-1\nproject: ${project}`, project };
  assert.equal(actionFailure(unsafe, "archive").detail, "io");
});

test("other task errors keep the existing failure", () => {
  for (const detail of ["service_busy", "version_mismatch", "invalid_token", "operation_failed"]) {
    const failure = { what: { clave: "shell.service.busy" }, detail };
    assert.deepEqual(actionFailure(failure, "finish"), asFailure(failure));
  }
});

test("task action notices stay with the workspace generation that started the action", () => {
  let generation = 1;
  const feedback = createActionFeedback(() => generation);
  const error = { what: { clave: "shell.service.unreachable" }, detail: "io" };
  const first = feedback.begin();
  first(error, "archive");
  assert.deepEqual(feedback.notice(), actionFailure(error, "archive"));

  const late = feedback.begin();
  assert.equal(feedback.notice(), null);
  generation++;
  feedback.clear();
  late(error, "finish");
  assert.equal(feedback.notice(), null);

  feedback.begin()(error, "pin");
  assert.deepEqual(feedback.notice(), actionFailure(error, "pin"));
  feedback.begin()(error, "unpin");
  assert.deepEqual(feedback.notice(), actionFailure(error, "unpin"));
  feedback.clear();
  assert.equal(feedback.notice(), null);
});
