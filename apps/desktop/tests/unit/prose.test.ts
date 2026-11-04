import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  elegirLengua,
  registrarCatalogo,
  saltillo,
  type Manifiesto,
} from "../../src/lib/i18n.ts";
import { SIN_ESPACIO } from "../../src/lib/no-space.ts";
import { asFailure, claveDe, detalleDe, explicacionDelMotor, prosaDe } from "../../src/lib/failure.ts";
import { mensajeDeFallo } from "../../src/features/chat/failures.ts";
import { prosa } from "../../src/lib/prose.ts";

// El control en español evita que un respaldo fijo en inglés pase como traducción.

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * El catálogo tal cual está en disco. Se compara contra `saltillo(…)` porque el
 * motor normaliza el apóstrofo al registrarlo: el saltillo maya es `U+02BC` y
 * llegan las tres variantes según con qué se escriba (`lib/i18n.ts`).
 */
function catalogo(codigo: string): Record<string, string> {
  const dir = join(RAIZ, "src/locales", codigo);
  const frases: Record<string, string> = {};
  for (const nombre of readdirSync(dir)) {
    if (!nombre.endsWith(".json") || nombre === "manifiesto.json") continue;
    Object.assign(frases, JSON.parse(readFileSync(join(dir, nombre), "utf8")));
  }
  return frases;
}

function manifiesto(codigo: string): Manifiesto {
  return JSON.parse(
    readFileSync(join(RAIZ, "src/locales", codigo, "manifiesto.json"), "utf8"),
  );
}

/** Las claves que manda el motor: su código no vive aquí, el contrato las lista. */
function clavesDelBackend(): string[] {
  const contrato = JSON.parse(readFileSync(join(RAIZ, "src-tauri/crates/engine-protocol/phrase-keys.json"), "utf8"));
  return [...new Set<string>(contrato.keys)].sort();
}

const es = catalogo("es");
const en = catalogo("en");
registrarCatalogo(manifiesto("es"), es);
registrarCatalogo(manifiesto("en"), en);

// Sin cifras, la falta de espacio se dice con su frase sin números.
const sinDatos = (cat: Record<string, string>, clave: string) =>
  saltillo(cat[clave === SIN_ESPACIO ? "common.install.no_space_plain" : clave]);

test("una frase del backend se pinta en la lengua de la ventana", () => {
  const claves = clavesDelBackend();
  assert.ok(claves.length > 0, "el backend no pide ninguna clave; el detector se rompió");

  elegirLengua("en");
  for (const clave of claves) {
    assert.equal(
      prosa({ clave }),
      sinDatos(en, clave),
      `«${clave}» no se pintó en inglés con la app en inglés`,
    );
  }

  // Control negativo: la misma clave, en español, tiene que dar el español.
  elegirLengua("es");
  for (const clave of claves) {
    assert.equal(prosa({ clave }), sinDatos(es, clave), `«${clave}» no se pintó en español`);
  }
});

test("una cadena de un módulo sin migrar se pinta tal cual", () => {
  elegirLengua("en");
  assert.equal(prosa("lo que todavía escribe Rust"), "lo que todavía escribe Rust");
});

test("los datos se interpolan en la lengua elegida", () => {
  elegirLengua("en");
  const ingles = prosa({ clave: "mcp.error.no_binary", datos: { agent: "Claude Code" } });
  assert.ok(ingles.includes("Claude Code"), ingles);
  assert.ok(!ingles.includes("{agent}"), `quedó el placeholder sin sustituir: ${ingles}`);
  assert.notEqual(
    ingles,
    saltillo(es["mcp.error.no_binary"]).replace("{agent}", "Claude Code"),
  );
});


test("los errores desconocidos ofrecen una salida y conservan el diagnóstico", () => {
  elegirLengua("es");
  const errors = [{ message: "rpc failed", code: 500 }, new Error("socket closed"), null, undefined,
    { what: null, detail: "bad envelope" }, { what: {}, detail: "bad phrase" },
    { clave: "future.error", datos: {} }, "[object Object]", "", 42];
  for (const error of errors) {
    assert.ok(prosaDe(error).includes(saltillo(es["common.failure.generic"])));
    const failure = asFailure(error);
    assert.equal(prosa(failure.what), saltillo(es["common.failure.generic"]));
    assert.doesNotMatch(failure.detail, /\[object Object\]/);
  }
  assert.match(prosaDe(errors[0]), /rpc failed/);
  assert.match(prosaDe(errors[1]), /socket closed/);
  assert.match(detalleDe(errors[0]), /rpc failed/);
  assert.match(detalleDe(errors[0]), /500/);
  assert.match(detalleDe(errors[1]), /socket closed/);
  assert.match(detalleDe(errors[1]), /stack/);
  assert.match(detalleDe(new Error("outer", { cause: new Error("inner") })), /inner/);
});

test("las frases estructuradas conservan sus datos y su instrucción", () => {
  elegirLengua("es");
  const phrase = { clave: "mcp.error.no_binary", datos: { agent: "Claude Code" } };
  for (const error of [phrase, { what: phrase, detail: "ENOENT" }]) {
    assert.equal(prosaDe(error), prosa(phrase));
    assert.equal(claveDe(error), phrase.clave);
  }
  assert.equal(prosaDe("mcp.error.no_binary", { agent: "Codex" }), prosa({ ...phrase, datos: { agent: "Codex" } }));
  assert.equal(detalleDe({ what: phrase, detail: "" }), prosa(phrase));
  assert.equal(detalleDe({ what: phrase, detail: { code: "ENOENT" } }), '{"code":"ENOENT"}');
  assert.equal(prosaDe("Una instrucción del motor. Revisa la cuenta."), "Una instrucción del motor. Revisa la cuenta.");
  const raw = "git rev-parse failed";
  assert.equal(prosa(asFailure(raw).what), saltillo(es["common.failure.generic"]));
  assert.equal(asFailure(raw).detail, raw);
});

test("el diagnóstico admite ciclos y el respaldo cambia con la lengua", () => {
  const circular: Record<string, unknown> = { code: "broken", bytes: 12n };
  circular.cause = circular;
  assert.match(detalleDe(circular), /broken/);
  assert.match(detalleDe(circular), /12/);
  elegirLengua("en");
  assert.equal(prosaDe(circular), saltillo(en["common.failure.generic"]));
  elegirLengua("es");
  assert.equal(prosaDe(circular), saltillo(es["common.failure.generic"]));
});


test("la falta de espacio conserva las cifras del motor o las del evento", () => {
  elegirLengua("es");
  const datos = { needed: 1048576, free: 1024 };
  const expected = prosa({ clave: SIN_ESPACIO, datos });
  assert.equal(prosaDe({ clave: SIN_ESPACIO, datos }), expected);
  assert.equal(prosaDe({ what: { clave: SIN_ESPACIO, datos }, detail: "" }), expected);
  assert.equal(prosaDe(SIN_ESPACIO, datos), expected);
  assert.equal(prosaDe(SIN_ESPACIO), saltillo(es["common.install.no_space_plain"]));
});


test("un error guardado conserva su frase al cambiar de idioma", () => {
  elegirLengua("es");
  const error = asFailure({ what: { clave: "mcp.error.no_binary", datos: { agent: "Codex" } }, detail: "ENOENT" });
  const unknown = asFailure({ code: "unknown" });
  elegirLengua("en");
  assert.equal(prosa(error.what), prosa({ clave: "mcp.error.no_binary", datos: { agent: "Codex" } }));
  assert.equal(prosa(unknown.what), saltillo(en["common.failure.generic"]));
  elegirLengua("es");
});

// danil-labs/danil-engine#329: el encargado que no arranca se leía como «[object Object]».
test("el rechazo del motor pinta su frase y su motivo, nunca la ficha", () => {
  elegirLengua("es");
  const detail = {
    handler: "qa",
    reason: "El motor todavía no tiene un adaptador certificado que aplique estos límites. No se inicia el proveedor.",
    recovery: "Elige un proveedor configurado que garantice el límite o crea una copia con otro nombre y sin ese límite.",
    alternatives: [],
  };
  const raw = { code: "handler_limit_unenforceable", message_key: "cli.error.handler_limit_unenforceable", detail };
  const proxied = { what: { clave: raw.message_key }, detail: { code: raw.code, detail } };
  const phrase = saltillo(es["cli.error.handler_limit_unenforceable"]);
  for (const error of [raw, proxied]) {
    for (const text of [prosaDe(error), prosa(asFailure(error).what), mensajeDeFallo(error).text]) {
      assert.ok(text.startsWith(phrase), text);
      assert.ok(text.includes(detail.reason), text);
      assert.ok(text.includes(detail.recovery), text);
      assert.doesNotMatch(text, /\[object Object\]|\{/);
    }
    assert.equal(claveDe(error), raw.message_key, "la clave sigue sirviendo para decidir");
    assert.match(asFailure(error).detail, /handler_limit_unenforceable/, "el código queda en el detalle");
  }
  // Una ficha con `message` y sin frase conocida lo enseña antes del genérico.
  const future = { code: "future_error", message_key: "cli.error.future_error", message: "Algo nuevo que la ventana no conoce." };
  assert.ok(prosaDe(future).startsWith(future.message), prosaDe(future));
  // Las claves y los códigos no son explicación; el `message` de un Error es del cliente.
  assert.equal(explicacionDelMotor({ code: "io", detail: "timeout" }), null);
  assert.equal(explicacionDelMotor({ what: { clave: "x" }, detail: { message: "cli.error.io" } }), null);
  assert.equal(explicacionDelMotor(new Error("socket closed now")), null);
  // Sin repetir lo que la frase ya dice.
  assert.equal(prosaDe({ what: "Ya se explicó aquí.", detail: { reason: "Ya se explicó aquí." } }), "Ya se explicó aquí.");
});

test("los rechazos de set_session_model y model_required pintan su frase en las dos lenguas", () => {
  for (const [codigo, cat] of [["es", es], ["en", en]] as const) {
    elegirLengua(codigo);
    for (const clave of ["chat.session_model.not_offered", "chat.session_model.effort_not_offered", "chat.session_model.catalog_unavailable", "chat.session_model.agent_changed"]) {
      const fallo = { what: { clave }, detail: JSON.stringify({ agent: "opencode-zen", model: "x" }) };
      assert.ok(prosaDe(fallo).startsWith(saltillo(cat[clave])), `${codigo} ${clave}`);
    }
    const sinModelo = { code: "model_required", message_key: "cli.error.model_required", detail: { agent: "opencode-zen", valid_models: [], free_models_accepted: false, account_connected: false } };
    assert.ok(prosaDe(sinModelo).startsWith(saltillo(cat["cli.error.model_required"])), codigo);
  }
  elegirLengua("es");
});
