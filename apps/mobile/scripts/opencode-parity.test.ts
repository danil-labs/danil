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
import { subscribeFreeCatalog, changeFreeModels, FREE_BEAM_MODEL, consentText, consented, freeModelsOf, setProviderConsent, setSessionModel, surfacesOf, type TaskView, taskDefaults } from "../src/lib/engine.ts";
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
  assert.deepEqual(rows, []);
  // En orden: primero el texto (la versión), luego el consentimiento guardado.
  assert.deepEqual(calls.map((c) => c.command), ["list_surfaces", "consent_text", "list_workspaces"]);
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

const policy = { workspace_id: "w1", version: 3, providers: ["kilo", "vercel", "reflection"], lines: ["Terms"], acceptance_ref: "opaque-ref", enabled: true, accepted: true, terms: [{ label: "Kilo", url: "https://kilo.ai/terms" }] };
const surface = { id: "free", provider: "opencode-zen", catalogo: "gratuitos", usable: true };
function freeMachine(models: unknown[], extra: Record<string, unknown> = {}) {
  return machine({ list_workspaces: { free_model_policy: policy }, list_surfaces: [surface, surface], list_models: { models }, ...extra });
}
test("v3 conserva aceptación sin Beam; no sustituye otro Beam ni acepta catálogo de pago", async () => {
  for (const models of [[], [{ id: "reflection/beam", gratis: true }], [{ id: FREE_BEAM_MODEL, gratis: false }]]) {
    const { host } = freeMachine(models);
    const rows = await freeModelsOf(host, "w1");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].accepted, true);
    assert.equal(rows[0].usable, false);
  }
  const { host } = freeMachine([{ id: FREE_BEAM_MODEL, gratis: true }]);
  assert.equal((await freeModelsOf(host, "w1"))[0].usable, true);
});
test("v3 envía acceptance_ref por la máquina y refresca superficies y modelos", async () => {
  const { host, calls } = freeMachine([{ id: FREE_BEAM_MODEL, gratis: true }], {
    set_provider_consent: { free_model_consent: { ...policy, policy_id: "policy", acceptance_id: "acceptance" } },
  });
  const row = (await freeModelsOf(host, "w1"))[0];
  calls.length = 0;
  const refreshed: string[] = [];
  const unsubscribe = subscribeFreeCatalog((host, workspace) => refreshed.push(`${host}/${workspace}`));
  assert.equal((await changeFreeModels(host, "w1", row, true))[0].usable, true);
  unsubscribe();
  assert.deepEqual(refreshed, ["mac/w1"]);
  assert.deepEqual(calls.map((c) => c.command), ["list_workspaces", "set_provider_consent", "list_workspaces", "list_surfaces", "list_models"]);
  assert.deepEqual(calls[1], { command: "set_provider_consent", workspace: "w1", args: { provider: "opaque-ref", accepted: true } });
});
test("v3 rechaza política cambiada y copias que puedan autorizar", async () => {
  const { host } = freeMachine([{ id: FREE_BEAM_MODEL, gratis: true }]);
  const row = (await freeModelsOf(host, "w1"))[0];
  await assert.rejects(changeFreeModels(host, "w1", { ...row, policy: { ...policy, destination_host: "other-host" } }, true));
  const liveCall = host.call.bind(host);
  host.call = (async (...args: Parameters<Host["call"]>) => ({ ...await liveCall(...args), cachedAt: 10 })) as Host["call"];
  assert.deepEqual(await freeModelsOf(host, "w1"), []);
});

test("una copia del catálogo nunca declara disponible la ruta", async () => {
  const { host } = freeMachine([{ id: FREE_BEAM_MODEL, gratis: true }]);
  const call = host.call.bind(host);
  host.call = (async (...args: Parameters<Host["call"]>) => ({ ...await call(...args), cachedAt: args[0] === "list_models" ? 10 : null })) as Host["call"];
  const row = (await freeModelsOf(host, "w1"))[0];
  assert.equal(row.accepted, true);
  assert.equal(row.usable, false);
});

test("la referencia mostrada sigue válida cuando una lectura emite otra oferta del mismo texto", async () => {
  let reads = 0;
  const { host, calls } = freeMachine([{ id: FREE_BEAM_MODEL, gratis: true }], {
    list_workspaces: () => ({ active: "w1", free_model_policy: { ...policy, acceptance_ref: `offer-${++reads}` } }),
    set_provider_consent: { free_model_consent: { ...policy, policy_id: "policy", acceptance_id: "acceptance" } },
  });
  const shown = (await freeModelsOf(host, "w1"))[0];
  assert.equal(shown.policy?.acceptance_ref, "offer-1");
  await changeFreeModels(host, "w1", shown, true);
  const mutation = calls.find((call) => call.command === "set_provider_consent");
  assert.deepEqual(mutation?.args, { provider: "offer-1", accepted: true });
});
