import assert from "node:assert/strict";
import { test } from "node:test";
import { APP_COMMANDS, APP_FEATURES, COMMAND_NOT_HERE, COMMAND_UNSUPPORTED, CommandSupport, isScopeRefusal, isUnknownCommand } from "../src/index.ts";

test("cada comando de una función está en la lista cerrada", () => {
  for (const commands of Object.values(APP_FEATURES)) for (const c of commands) assert.ok(APP_COMMANDS.includes(c), c);
});

test("comando desconocido: el código del relay o del bridge, el del motor dentro de detail, o su frase", () => {
  for (const code of ["command", "unsupported", "command_not_allowed", COMMAND_UNSUPPORTED]) assert.equal(isUnknownCommand({ code }), true, code);
  assert.equal(isUnknownCommand({ code: "command_failed", detail: { what: { clave: "shell.service.command" }, detail: "list_ports" } }), true);
  assert.equal(isUnknownCommand({ code: "command_failed", detail: { code: "command" } }), true);
  assert.equal(isUnknownCommand({ code: "io", message_key: "shell.service.command" }), true);
  assert.equal(isUnknownCommand(Object.assign(new Error("command"), { what: { clave: "shell.service.command" } })), true);
});

test("apagada, sin respuesta o un error del comando no es «no lo conoce»", () => {
  for (const error of [{ code: "machine_off" }, { code: "machine_timeout" }, { code: "command_failed", detail: "no such space" }, { code: "machine_asleep", detail: "command" }, null, "command"]) {
    assert.equal(isUnknownCommand(error), false, JSON.stringify(error));
  }
});

test("una función se enseña cuando contesta su lectura y se oculta si rechaza cualquiera de sus comandos", () => {
  const changed: string[] = [];
  const support = new CommandSupport((m) => changed.push(m));
  assert.equal(support.feature("vm", "ports"), "unknown");
  assert.equal(support.note("vm", "list_ports"), false);
  assert.equal(support.feature("vm", "ports"), "yes");
  assert.equal(support.note("vm", "keep_awake_status", { code: "machine_off" }), false);
  assert.equal(support.feature("vm", "keep_awake"), "unknown", "apagada no dice nada");
  support.note("vm", "keep_awake_status");
  assert.equal(support.note("vm", "set_keep_awake", { code: "command" }), true);
  assert.equal(support.feature("vm", "keep_awake"), "no");
  assert.equal(support.feature("mac", "keep_awake"), "unknown", "por máquina");
  assert.deepEqual(changed, ["vm", "vm", "vm"]);
  support.note("vm", "list_ports");
  assert.equal(changed.length, 3, "sin cambio no avisa");
  support.forget("vm");
  assert.equal(support.feature("vm", "keep_awake"), "unknown", "otro motor: se vuelve a saber al llamar");
});

test("el rechazo de alcance del relay (scope: machine) no es «no lo conoce»; el 403 de un bridge anterior sí", () => {
  const scope = { code: "command_not_allowed", detail: { command: "set_keep_awake", scope: "machine" } };
  assert.equal(isScopeRefusal(scope), true);
  assert.equal(isUnknownCommand(scope), false);
  assert.equal(isScopeRefusal({ code: COMMAND_NOT_HERE }), true);
  assert.equal(isUnknownCommand({ code: "command_not_allowed", detail: "set_keep_awake" }), true, "bridge anterior: detail es el comando");
  const support = new CommandSupport();
  support.note("vm", "keep_awake_status");
  assert.equal(support.note("vm", "set_keep_awake", scope), false);
  assert.equal(support.feature("vm", "keep_awake"), "yes", "no oculta la función");
});
