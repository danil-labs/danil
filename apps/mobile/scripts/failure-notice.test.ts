/**
 * La frase de un turno detenido (`src/lib/failureNotice.ts`). El catálogo no se
 * importa: trae `expo-localization`. Las frases se contrastan con `i18n.ts`.
 *
 *   node --test apps/mobile/scripts/failure-notice.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { failureGesture, failureSentence, latestFailureSentence, quotaResolves } from "../src/lib/failureNotice.ts";

const es: Record<string, string> = {
  "task.failure.interrupted": "Interrumpido",
  "task.failure.back_at": "Vuelve a las {time}.",
  "task.failure.resumes_at": "Danil la retoma sola a las {time}.",
  "task.failure.retries_one": "Lo intentó {count} vez.",
  "task.failure.retries_other": "Lo intentó {count} veces.",
  "task.failure.sin_cupo": "Se acabó el cupo de esta cuenta.",
  "task.failure.sin_saldo": "Se acabó el saldo de esta cuenta.",
  "task.failure.credencial": "El proveedor no aceptó la credencial de esta cuenta: se venció o alguien la revocó.",
  "task.quota.switched": "Se acabó el cupo de {from}; la tarea siguió con {to}.",
  "task.quota.switched_until": "Se acabó el cupo de {from}; la tarea siguió con {to}. {from} vuelve a las {time}.",
  "task.quota.switched_until_day": "Se acabó el cupo de {from}; la tarea siguió con {to}. {from} vuelve el {time}.",
  "task.quota.resumed_account": "Volvió el cupo de {account}; la tarea sigue.",
  "task.quota.resumed": "Volvió el cupo; la tarea sigue.",
};

const say = (key: string, vars: Record<string, string | number> = {}) =>
  (es[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? ""));

test("el cupo agotado dice la frase, no el texto crudo, y cuándo sigue sola", () => {
  const alone = failureSentence({ text: "crudo", meta: "fallo", fallo: { clase: "sin_cupo", detail: "429" } }, say);
  assert.equal(alone, "Se acabó el cupo de esta cuenta.");

  const continuesAt = new Date(2026, 8, 25, 9, 30).getTime();
  const waiting = failureSentence(
    { text: "crudo", meta: "fallo", fallo: { clase: "sin_cupo", detail: "429", vuelve_en: continuesAt - 60_000, resumes_at: continuesAt, reintentos: 5 } },
    say,
  );
  assert.match(waiting ?? "", /Se acabó el cupo de esta cuenta\./);
  assert.match(waiting ?? "", /Danil la retoma sola/);
  assert.match(waiting ?? "", /9:30|09:30/);
  assert.match(waiting ?? "", /5/);
  assert.doesNotMatch(waiting ?? "", /Vuelve a las/);
  assert.doesNotMatch(waiting ?? "", /crudo/);
});

test("un fallo sin clase conserva el texto; una interrupción no se lee como error del proveedor", () => {
  const raw = "Claude no terminó este turno — salió con código 1: boom";
  assert.equal(failureSentence({ text: raw, meta: "fallo" }, say), raw);
  assert.equal(failureSentence({ text: raw, meta: "fallo", fallo: { clase: "desconocido", detail: "código 1" } }, say), raw);
  assert.equal(failureSentence({ text: "Turno interrumpido. Quedó a medias.", meta: "fallo", role: "system" }, say), "Interrumpido");
  assert.equal(failureSentence({ text: "hola" }, say), null);
});

test("la hora de otro día lleva fecha y la de hoy no", () => {
  const prose = (at: number) => failureSentence({ meta: "fallo", fallo: { clase: "sin_cupo", detail: "429", vuelve_en: at } }, say) ?? "";
  const week = prose(Date.now() + 7 * 24 * 3_600_000);
  assert.match(week, /\d{4}/);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 0);
  assert.doesNotMatch(prose(todayEnd.getTime()), /\d{4}/);
});

test("el gesto del cupo es otra cuenta; reintentar no se ofrece", () => {
  assert.equal(failureGesture("sin_cupo")?.key, "task.failure.other_account");
  assert.equal(failureGesture("sin_saldo")?.key, "task.failure.other_account");
  assert.equal(failureGesture("credencial")?.key, "task.failure.reconnect");
  for (const clase of ["proveedor_caido", "sin_red", "tope_de_gasto", "desconocido", undefined]) {
    assert.equal(failureGesture(clase), null);
  }
  assert.equal(quotaResolves("sin_cupo"), true);
  assert.equal(quotaResolves("credencial"), false);
});

test("la línea del cupo dice con qué cuenta siguió", () => {
  assert.equal(
    failureSentence({ meta: "cupo", quota: { from: "Cuenta 1", to: "Cuenta 2" } }, say),
    "Se acabó el cupo de Cuenta 1; la tarea siguió con Cuenta 2.",
  );
  assert.equal(failureSentence({ meta: "cupo", quota: { from: "Cuenta 1" } }, say), "Volvió el cupo de Cuenta 1; la tarea sigue.");
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 0, 0);
  const today = failureSentence({ meta: "cupo", quota: { from: "Cuenta 1", to: "Cuenta 2", until: todayEnd.getTime() } }, say) ?? "";
  assert.match(today, /vuelve a las/);
  assert.doesNotMatch(today, /\d{4}/);
});

test("el aviso usa el fallo más reciente", () => {
  const turns = [
    { role: "user", text: "sigue" },
    { role: "system", text: "viejo", meta: "fallo", fallo: { clase: "sin_red", detail: "x" } },
    { role: "system", text: "", meta: "fallo", fallo: { clase: "sin_cupo", detail: "429" } },
  ];
  assert.equal(latestFailureSentence(turns, say), "Se acabó el cupo de esta cuenta.");
  assert.equal(latestFailureSentence([{ text: "nada" }], say), null);
});

test("el catálogo del teléfono tiene la frase del cupo en los dos idiomas", () => {
  const src = readFileSync(new URL("../src/lib/i18n.ts", import.meta.url), "utf8");
  assert.match(src, /"task\.failure\.sin_cupo": "Se acabó el cupo de esta cuenta\."/);
  assert.match(src, /"task\.failure\.sin_cupo": "This account is out of quota\."/);
  assert.match(src, /"task\.failure\.resumes_at": "Danil la retoma sola a las \{time\}\."/);
  const keys = (block: string) => [...block.matchAll(/"((?:task\.failure|task\.quota)\.[^"]+)":/g)].map((match) => match[1]);
  const [spanish, english] = src.split("const en");
  assert.deepEqual(keys(english), keys(spanish));
});
