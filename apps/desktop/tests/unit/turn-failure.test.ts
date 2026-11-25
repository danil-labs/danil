import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// El catálogo primero: sin él `t()` devuelve la clave, y lo que se afirmaría
// abajo son identificadores en vez de frases.
import "../helpers/catalog.ts";
import {
  avisoDeEncargado as handlerNotice,
  mensajeDeFallo,
  cupoResuelveElFallo as quotaResolves,
  gestoDelFallo as failureAction,
  gestoDeLaFila as rowAction,
  prosaDelCambioPorCupo as quotaChangeText,
  prosaDelFallo as failureText,
} from "../../../../packages/features/chat/src/model/failures.ts";
import {
  esFilaDeLaBandeja as isInboxRow,
  idDeLaEntregaAntigua as oldDeliveryId,
  prosaDeLaFila as rowText,
  TOPE_DE_SALTOS as MAX_HOPS,
} from "../../../../packages/features/chat/src/model/inboxRows.ts";
import { transcripcion as transcript } from "../../../../packages/features/chat/src/model/transcript.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

test("el bloqueo de otra app se traduce al releer el fallo guardado", () => {
  assert.match(failureText({ text: "accounts.error.home_other_app" }), /Otra ventana de Danil/);
});

test("cada clase de fallo dice algo distinto", () => {
  const classes = [
    "sin_cupo",
    "sin_saldo",
    "tope_de_gasto",
    "credencial",
    "proveedor_caido",
    "sin_red",
    "contexto_lleno",
    "modelo_no_existe",
    "politica",
    "memoria_perdida",
  ];
  const texts = new Set<string>();
  for (const failureClass of classes) {
    const text = failureText({ text: "crudo", fallo: { clase: failureClass, detail: "429" } });
    assert.ok(
      !text.includes(`chat.failure.${failureClass}`),
      `«${failureClass}» se quedó con la clave a la vista: ${text}`,
    );
    assert.ok(!text.includes("crudo"), `«${failureClass}» no debe repetir el crudo: ${text}`);
    texts.add(text);
  }
  assert.equal(texts.size, classes.length, "dos clases dicen lo mismo");
});

test("un fallo sin clase conserva el texto que ya se enseñaba", () => {
  const raw = "Claude no terminó este turno — salió con código 1: boom";
  assert.equal(failureText({ text: raw }), raw);
  assert.equal(
    failureText({ text: raw, fallo: { clase: "desconocido", detail: "código 1" } }),
    raw,
  );
});

test("la hora de vuelta y los reintentos solo salen si los hubo", () => {
  const alone = failureText({ text: "", fallo: { clase: "sin_cupo", detail: "429" } });
  assert.ok(!/\d/.test(alone.replace(/[^\d]/g, "")), `sin datos no hay números: ${alone}`);

  const withData = failureText({
    text: "",
    fallo: {
      clase: "sin_cupo",
      detail: "429",
      // 2026-08-25T18:40:00Z — la hora se pinta en la zona de quien mira, así
      // que lo que se afirma es que hay una, no cuál.
      vuelve_en: 1_787_690_400_000,
      reintentos: 5,
    },
  });
  assert.match(withData, /\d{1,2}[:.]\d{2}/, `sin la hora de vuelta: ${withData}`);
  assert.match(withData, /5/, `sin el número de intentos: ${withData}`);
});

test("la hora de vuelta lleva fecha cuando no es hoy", () => {
  const prose = (returnsAt: number) =>
    failureText({ text: "", fallo: { clase: "sin_cupo", detail: "429", vuelve_en: returnsAt } });

  const week = prose(Date.now() + 7 * 24 * 3_600_000);
  assert.match(week, /\d{4}/, `sin el año de vuelta: ${week}`);

  // Del final de hoy y no de `ahora + un minuto`: ese minuto cae en el día
  // siguiente durante el último minuto de cada día, y ahí la fecha sí sale.
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 0);
  const sameDay = prose(todayEnd.getTime());
  assert.ok(!/\d{4}/.test(sameDay), `sobra la fecha: ${sameDay}`);
});

test("un mensaje que no se pudo mandar ofrece reintentarlo, solo el vigente", () => {
  // `enviar` anota el rechazo sin clase: el envío ni llegó al proveedor.
  const rechazo = { meta: "fallo", text: "No hay conexión con la máquina." };
  assert.equal(rowAction(rechazo, true)?.accion, "reintentar");
  assert.equal(rowAction({ ...rechazo, fallo: { clase: "desconocido", detail: "exit 1" } }, true)?.accion, "reintentar");
  // En una fila vieja mandaría el último texto, no el que falló.
  assert.equal(rowAction(rechazo, false), null);
  assert.equal(rowAction({ ...rechazo, fallo: { clase: "proveedor_caido", detail: "503" } }, false), null);
  // Cambiar de cuenta sirve en cualquier fila.
  assert.equal(rowAction({ ...rechazo, fallo: { clase: "sin_cupo", detail: "429" } }, false)?.accion, "cuentas");
  // Las clases sin gesto siguen sin fingirlo.
  assert.equal(rowAction({ ...rechazo, fallo: { clase: "contexto_lleno", detail: "" } }, true), null);
  // El turno corrió y no se guardó: repetirlo haría el trabajo dos veces.
  assert.equal(rowAction({ ...rechazo, text: "chat.turn.unsaved" }, true), null);
  // Un aviso no es un fallo.
  assert.equal(rowAction({ meta: "aviso", text: "Hola" }, true), null);
});

test("cada clase ofrece el gesto que sirve, o ninguno", () => {
  assert.equal(failureAction("sin_cupo")?.accion, "cuentas");
  assert.equal(failureAction("sin_saldo")?.accion, "cuentas");
  assert.equal(failureAction("credencial")?.accion, "cuentas");
  assert.equal(failureAction("proveedor_caido")?.accion, "reintentar");
  assert.equal(failureAction("sin_red")?.accion, "reintentar");

  // Y las que no tienen gesto no lo fingen: decir qué pasó ya es todo lo que
  // esta pantalla puede hacer por quien mira.
  for (const sin of [
    "tope_de_gasto",
    "contexto_lleno",
    "modelo_no_existe",
    "politica",
    "memoria_perdida",
    "desconocido",
    undefined,
  ]) {
    assert.equal(failureAction(sin), null, `«${sin}» ofrece un gesto que no sirve`);
  }
});

test("el gesto nombra una clave que el catálogo define", () => {
  const es = JSON.parse(
    readFileSync(join(root, "src/locales/es/chat.json"), "utf8"),
  ) as Record<string, unknown>;
  for (const failureClass of ["sin_cupo", "sin_saldo", "credencial", "proveedor_caido", "sin_red"]) {
    const key = failureAction(failureClass)!.clave;
    assert.ok(es[key], `«${key}» no está en el catálogo`);
  }
});

test("un cupo en espera dice cuándo sigue solo, no cuándo vuelve", () => {
  const returnsAt = new Date(2026, 8, 25, 7, 0).getTime();
  const continuesAt = new Date(2026, 8, 25, 9, 30).getTime();
  const text = failureText({
    text: "crudo",
    fallo: { clase: "sin_cupo", detail: "429", vuelve_en: returnsAt, resumes_at: continuesAt },
  });
  assert.match(text, /Danil la retoma sola/);
  assert.match(text, /9:30/);
  assert.doesNotMatch(text, /Vuelve a las/);
});

test("la línea del cupo dice a qué cuenta pasó y por qué", () => {
  const until = new Date(2026, 8, 25, 7, 0).getTime();
  const change = quotaChangeText({ from: "Cuenta 1", to: "Cuenta 2", until: until });
  assert.match(
    change,
    /^Se acabó el cupo de Cuenta 1; la tarea siguió con Cuenta 2\. Cuenta 1 vuelve el .*2026.*7:00/,
  );
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 0, 0);
  const today = quotaChangeText({ from: "Cuenta 1", to: "Cuenta 2", until: todayEnd.getTime() });
  assert.match(today, /Cuenta 1 vuelve a las .*11:59|Cuenta 1 vuelve a las .*23:59/);
  assert.doesNotMatch(today, /\d{4}/, `sobra la fecha: ${today}`);
  assert.equal(
    quotaChangeText({ from: "Cuenta 1", to: "Cuenta 2" }),
    "Se acabó el cupo de Cuenta 1; la tarea siguió con Cuenta 2.",
  );
  assert.equal(
    quotaChangeText({ from: "Cuenta 1" }),
    "Volvió el cupo de Cuenta 1; la tarea sigue.",
  );
  assert.equal(quotaChangeText({}), "Volvió el cupo; la tarea sigue.");
});

test("solo el cupo y el saldo agotados quedan resueltos por la línea del cupo", () => {
  assert.ok(quotaResolves("sin_cupo"));
  assert.ok(quotaResolves("sin_saldo"));
  for (const other of ["credencial", "proveedor_caido", "tope_de_gasto", "desconocido", undefined]) {
    assert.ok(!quotaResolves(other), `«${other}» no lo resuelve otra cuenta`);
  }
});

test("las filas de la Bandeja antigua sobreviven a reabrir su historial", () => {
  const sender = { folder: "p", task: "h1", title: "Revisión", provider: "claude" };
  const msgs = transcript([
    { role: "system", text: "Revisé el módulo.", meta: "task_finished", from_task: sender, hops: 1 },
    { role: "system", text: "", meta: "task_finished_read", from_task: sender, hops: 1 },
    { role: "system", text: "", meta: "task_chain_limit", from_task: sender, hops: 4 },
    { role: "system", text: "", meta: "woke_by_tasks", woke_by: ["h1", "h2"], hops: 1 },
    { role: "system", text: "", meta: "woke_by_tasks" },
  ]);
  assert.deepEqual(
    msgs.map((m) => m.meta),
    ["task_finished", "task_finished_read", "task_chain_limit", "woke_by_tasks", "woke_by_tasks"],
  );
  assert.equal(msgs[0].fromTask?.title, "Revisión");
  assert.deepEqual(msgs[3].woke_by, ["h1", "h2"]);
  assert.equal(msgs[4].woke_by, undefined);
  assert.ok(msgs.every((m) => isInboxRow(m.meta)));
});

test("cada fila histórica de la Bandeja dice algo distinto y sin la clave a la vista", () => {
  const texts = [
    rowText("task_finished", "Revisión", 0),
    rowText("task_finished_read", "Revisión", 0),
    rowText("task_chain_limit", "Revisión", 0),
    rowText("woke_by_tasks", null, 2),
    rowText("woke_by_tasks", null, 1),
    rowText("woke_by_tasks", null, 0),
    rowText("task_finished", null, 0),
  ];
  for (const text of texts) assert.ok(!/chat\.inbox|\{/.test(text), text);
  assert.equal(new Set(texts).size, texts.length);
  assert.match(texts[0], /Revisión/);
  assert.match(texts[2], new RegExp(String(MAX_HOPS)));
  assert.match(texts[3], /2/);
  assert.ok(!/\d/.test(texts[5]), `sin ids no se inventa cuántas: ${texts[5]}`);
});

// Rust abre el turno que contesta a la terminal con una línea sin texto; sin
// ella, al reabrir la tarea la respuesta del agente parece llegar de la nada.
test("la línea con que el agente contesta a la terminal sobrevive a reabrir la tarea", () => {
  const msgs = transcript([
    { role: "shell", text: "pnpm test", shell: { cwd: "/p", output: "ok", exit_code: 0, duration_ms: 1200, truncated: false } },
    { role: "system", text: "", meta: "shell_reply" },
    { role: "agent", text: "Pasaron todas." },
  ]);
  assert.deepEqual(msgs.map((m) => m.meta ?? m.role), ["usó", "shell_reply", "agent"]);
  assert.equal(msgs[0].shell?.duration_ms, 1200);
});

test("la respuesta entregada es una fila de sistema con el título, también la guardada antes", () => {
  const recipient = { folder: "p", task: "mfpbwsj1", title: "Revisión del contrato", provider: "claude" };
  const [current, old] = transcript([
    { role: "system", text: "", meta: "respondido", from_task: recipient, hops: 2 },
    { role: "system", text: "Respuesta entregada a la tarea «mfpbwsj1». Salto 2.", meta: "respondido" },
  ]);
  assert.ok(isInboxRow(current.meta) && isInboxRow(old.meta), "cae en «Trabajo»");
  const text = rowText("respondido", current.fromTask?.title ?? null, 0);
  assert.match(text, /Revisión del contrato/);
  const said = rowText("respondido", old.fromTask?.title ?? null, 0);
  for (const frase of [text, said]) {
    assert.ok(!/chat\.|\{|mfpbwsj1|Salto/.test(frase), frase);
  }
  assert.notEqual(said, rowText("task_finished", null, 0));
});

test("la entrega guardada antes nombra su tarea por el id de su prosa", () => {
  assert.equal(oldDeliveryId("Respuesta entregada a la tarea «mfpbwsj1». Salto 2."), "mfpbwsj1");
  assert.equal(oldDeliveryId("Respuesta entregada."), null);
  assert.equal(oldDeliveryId(""), null);
});


test("un fallo antes de arrancar conserva el diagnóstico y ofrece instrucciones", () => {
  const message = mensajeDeFallo({ code: "launch_failed", message: "spawn failed" });
  assert.match(failureText(message), /No se pudo completar la acción/);
  assert.match(failureText(message), /soporte/);
  assert.match(message.fallo.detail, /launch_failed/);
  assert.match(message.fallo.detail, /spawn failed/);
  assert.doesNotMatch(failureText(message), /object Object/);
});

test("el historial con object Object ofrece una salida al volver a abrirlo", () => {
  for (const fallo of [undefined, { clase: "desconocido", detail: "" }, { clase: "future_class", detail: "" }]) {
    const text = failureText({ text: "[object Object]", fallo });
    assert.match(text, /soporte/);
    assert.doesNotMatch(text, /object Object/);
  }
});

test("a handler limit preserves its explanation and structured diagnostic", () => {
  const error = {
    code: "handler_limit_unenforceable",
    message_key: "cli.error.handler_limit_unenforceable",
    detail: { provider: "codex", reason: "permissions_ceiling", alternatives: ["claude"] },
  };
  const message = mensajeDeFallo(error);
  assert.match(message.text, /l\u00edmites del encargado/);
  assert.match(message.fallo.detail, /permissions_ceiling/);
  assert.match(message.fallo.detail, /claude/);
  assert.doesNotMatch(message.text, /object Object|cli\.error/);
});

test("handler notices remain translated when history is reloaded", () => {
  for (const meta of ["handler_definition_modified", "handler_memory_in_doubt", "handler_memory_unavailable", "handler_memory_legacy", "handler_requires_tool_missing"]) {
    const text = failureText({ text: meta, meta });
    assert.doesNotMatch(text, /handler_|chat\.notice/);
    assert.ok(text.length > 20);
  }
});


test("a handler notice saved with engine prose uses the window catalog and keeps the tool", () => {
  const saved = { text: "El encargado pide la herramienta `seldon-lab-missing-tool` y no está en el PATH de este turno.", meta: "handler_requires_tool_missing" };
  assert.equal(handlerNotice(saved), failureText(saved));
  assert.match(handlerNotice(saved) ?? "", /\(seldon-lab-missing-tool\)$/);
  assert.notEqual(handlerNotice(saved), saved.text);
  assert.equal(handlerNotice({ text: "otro aviso", meta: "aviso" }), null);
});

test("a notice the engine saves as a catalog key reads as its phrase", () => {
  assert.doesNotMatch(failureText({ text: "chat.mentions.in_code" }), /chat\.mentions/);
  assert.match(failureText({ text: "chat.mentions.in_code" }), /código/);
});

import { handlerMutation, pendingHandlerOperation, resumeHandlerOperation, staleReason } from "../../../../packages/features/projects/src/queries/handlerOperations.ts";
test("an uncertain handler mutation survives scope switches and resumes without repeating", async () => {
  let mutations = 0;
  const unknown = { detail: { detail: { operation: "op-7" } } };
  await assert.rejects(handlerMutation("workspace-a/folder/handler", "approve", async () => { mutations++; throw unknown; }));
  await handlerMutation("workspace-b/folder/handler", "revoke", async () => true);
  assert.equal(pendingHandlerOperation("workspace-a/folder/handler")?.operation, "op-7");
  await assert.rejects(handlerMutation("workspace-a/folder/handler", "release", async () => { mutations++; }));
  await assert.rejects(resumeHandlerOperation("workspace-a/folder/handler", async id => { assert.equal(id, "op-7"); throw new Error("offline"); }));
  assert.ok(pendingHandlerOperation("workspace-a/folder/handler"));
  await resumeHandlerOperation("workspace-a/folder/handler", async id => { assert.equal(id, "op-7"); return {}; });
  assert.equal(pendingHandlerOperation("workspace-a/folder/handler"), undefined);
  assert.equal(mutations, 1);
});
test("a terminal handler receipt releases the mutation lock and retains its error", async () => {
  await assert.rejects(handlerMutation("terminal-scope", "approve", async () => { throw { detail: { detail: { operation: "op-8" } } }; }));
  const terminal = { detail: { detail: { operation: "op-8", settled: true, detail: { read_tools: ["read"] } } } };
  await assert.rejects(resumeHandlerOperation("terminal-scope", async () => { throw terminal; }), e => e === terminal);
  assert.equal(pendingHandlerOperation("terminal-scope"), undefined);
});

test("a stale approval reads its reason as a phrase, never the engine code", () => {
  const approval = { digest: "sha256:a", at: 1, by: "person", revoked_at: null };
  const revoked = staleReason({ approval: { ...approval, revoked_at: 2 }, dirty: false });
  const changed = staleReason({ approval, dirty: false });
  assert.ok(revoked.length > 5 && changed.length > 5 && revoked !== changed);
  assert.doesNotMatch(revoked + changed, /revoked|settings\.handler|sha256/);
  assert.equal(staleReason({ approval, dirty: true }), "");
});
