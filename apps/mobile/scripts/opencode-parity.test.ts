/**
 * OpenCode como en la ventana: el modelo del chip y el consentimiento de los
 * modelos gratuitos (`src/lib/engine.ts`).
 *
 *   node --test apps/mobile/scripts/opencode-parity.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { APP_COMMANDS } from "@terminus/protocol";
import { consentText, consented, freeModelsOf, setProviderConsent, setSessionModel, surfacesOf, type TaskView, taskDefaults } from "../src/lib/engine.ts";
import { failureKey } from "../src/lib/failureNotice.ts";
import type { Host } from "../src/lib/hosts.ts";

function machine(answers: Record<string, unknown>) {
  const calls: { command: string; workspace: string | null; args?: object }[] = [];
  const host = {
    id: "mac",
    label: "Mac",
    power: () => "on",
    call: async (command: string, workspace: string | null, args?: object) => {
      calls.push({ command, workspace, args });
      const value = typeof answers[command] === "function" ? (answers[command] as (a?: object) => unknown)(args) : answers[command];
      return { value: value ?? null, cachedAt: null };
    },
  } as unknown as Host;
  return { host, calls };
}

const view = (session: Partial<TaskView["session"]>) => ({ session: { id: "t", provider: "opencode-zen", model: null, turns: [], ...session } }) as unknown as TaskView;

test("el chip abre con el modelo elegido, luego el observado; no con el del último turno", () => {
  const turns = [{ role: "agent", text: "", model: "zen/old" }];
  assert.deepEqual(taskDefaults(view({ model: "zen/chosen", observed_model: "zen/seen", turns })), { provider: "opencode-zen", model: "zen/chosen" });
  assert.deepEqual(taskDefaults(view({ observed_model: "zen/seen", turns })).model, "zen/seen");
  assert.equal(taskDefaults(view({ turns })).model, null);
});

test("los comandos de superficies y consentimiento están en la lista cerrada", () => {
  for (const command of ["list_surfaces", "consent_text", "set_provider_consent", "stop_turn", "inject_message"]) assert.ok(APP_COMMANDS.includes(command as never), command);
});

test("activar y desactivar los gratuitos manda `set_provider_consent` con el agente y dice lo que quedó guardado", async () => {
  const { host, calls } = machine({ set_provider_consent: (args?: object) => ({ consents: (args as { accepted: boolean }).accepted ? [{ provider: "opencode-zen", version: 2 }] : [] }) });
  assert.equal(await setProviderConsent(host, "w1", "opencode-zen", true), true);
  assert.equal(await setProviderConsent(host, "w1", "opencode-zen", false), false);
  assert.deepEqual(calls, [
    { command: "set_provider_consent", workspace: "w1", args: { provider: "opencode-zen", accepted: true } },
    { command: "set_provider_consent", workspace: "w1", args: { provider: "opencode-zen", accepted: false } },
  ]);
});

test("vale el sí de la versión de hoy: quien aceptó un texto anterior lo vuelve a ver", async () => {
  assert.equal(consented({ consents: [{ provider: "opencode-zen", version: 2 }] }, "opencode-zen", 2), true);
  assert.equal(consented({ consents: [{ provider: "opencode-zen", version: 1 }] }, "opencode-zen", 2), false);
  assert.equal(consented({}, "opencode-zen", 2), false);

  const free = { id: "opencode-zen:free", provider: "opencode-zen", label: "Modelos Free", catalogo: "gratuitos", usable: false, marca: "sin activar", porque: null };
  const paid = { id: "opencode-zen", provider: "opencode-zen", label: "OpenCode", catalogo: "de_pago", usable: true, marca: null, porque: null };
  const lines = [{ clave: "workspaces.consent.free_models.accept" }, { clave: "workspaces.consent.free_models.responsibility" }];
  const { host, calls } = machine({
    list_surfaces: [paid, free],
    consent_text: [lines, 2],
    list_workspaces: { active: "w1", workspaces: [{ id: "w1", name: "W", consents: [{ provider: "opencode-zen", version: 1 }] }] },
  });
  assert.deepEqual((await surfacesOf(host, "w1")).map((s) => s.id), ["opencode-zen", "opencode-zen:free"]);
  assert.deepEqual(await consentText(host, "w1"), { lines, version: 2 });
  const rows = await freeModelsOf(host, "w1");
  assert.deepEqual(rows.map((r) => ({ provider: r.provider, accepted: r.accepted, version: r.text.version })), [{ provider: "opencode-zen", accepted: false, version: 2 }]);
  // En orden: primero el texto (la versión), luego el consentimiento guardado.
  assert.deepEqual(calls.map((c) => c.command), ["list_surfaces", "consent_text", "list_surfaces", "consent_text", "list_workspaces"]);
});

test("sin texto del consentimiento no se ofrece activar", async () => {
  const { host } = machine({ list_surfaces: [{ id: "f", provider: "opencode-zen", label: "", catalogo: "gratuitos", usable: false, marca: null, porque: null }], consent_text: null });
  assert.deepEqual(await freeModelsOf(host, "w1"), []);
});

test("el modelo del chip se guarda en la tarea con modelo y esfuerzo juntos", async () => {
  assert.ok(APP_COMMANDS.includes("set_session_model" as never));
  const { host, calls } = machine({});
  await setSessionModel(host, "w1", "f1", "t1", "zen/glm", "high");
  await setSessionModel(host, "w1", "f1", "t1", "zen/glm", null);
  assert.deepEqual(calls, [
    { command: "set_session_model", workspace: "w1", args: { project: "f1", id: "t1", model: "zen/glm", effort: "high" } },
    { command: "set_session_model", workspace: "w1", args: { project: "f1", id: "t1", model: "zen/glm", effort: null } },
  ]);
});

test("los rechazos de set_session_model y model_required tienen frase", () => {
  for (const key of [
    "chat.session_model.not_offered",
    "chat.session_model.effort_not_offered",
    "chat.session_model.catalog_unavailable",
    "chat.session_model.agent_changed",
    "cli.error.model_required",
  ]) {
    // `i18n.ts` trae `expo-localization`: se contrasta el texto, como en `failure-notice.test.ts`.
    const [spanish, english] = readFileSync(new URL("../src/lib/i18n.ts", import.meta.url), "utf8").split("const en");
    for (const block of [spanish, english]) assert.ok(block.includes(`  "${key}": "`), key);
  }
  assert.equal(failureKey({ detail: { what: { clave: "chat.session_model.not_offered" } } }), "chat.session_model.not_offered");
  assert.equal(failureKey({ message_key: "cli.error.model_required", detail: { free_models_accepted: false, account_connected: false } }), "cli.error.model_required");
});
