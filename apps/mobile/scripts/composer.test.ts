/**
 * El cuadro de escribir del teléfono: qué tecla manda y cuál hace salto de
 * línea, y con qué modo de permisos arranca y se manda un mensaje.
 *
 *   node --test apps/mobile/scripts/composer.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { AccountWorkspace } from "@terminus/computers";
import type { PermissionModeOption, ProviderInfo } from "@terminus/protocol";
import { DANIL_CREDITS_MODEL, FREE_ROUTER_MODEL, type Surface } from "@terminus/tasks";
import { creditsSurfaceOf, effectiveMode, enterAction, hasSomethingToSend, initialMode, resolveProvider, resolveSurfaceModel } from "../src/lib/composer.ts";
import { workspaceEntries } from "../src/lib/engine.ts";

const label = { key: "x" };
// Claude: los tres; `ediciones` es el que resolvió el motor.
const CLAUDE: PermissionModeOption[] = [
  { id: "manual", label },
  { id: "ediciones", label, por_omision: true },
  { id: "auto", label },
];
// Un proveedor sin «automático».
const OTHER: PermissionModeOption[] = [
  { id: "manual", label, por_omision: true },
  { id: "ediciones", label },
  { id: "auto", label, falta: { key: "no" } },
];

test("Enter manda; Shift+Enter hace salto de línea, como en el escritorio", () => {
  assert.equal(enterAction({ key: "Enter" }), "send");
  assert.equal(enterAction({ key: "Enter", shiftKey: true }), "newline");
  assert.equal(enterAction({ key: "a" }), null, "las demás teclas siguen su curso");
});

test("Enter que confirma un carácter compuesto (IME) no manda", () => {
  assert.equal(enterAction({ key: "Enter", isComposing: true }), null);
  assert.equal(enterAction({ key: "Enter", keyCode: 229 }), null, "Safari marca la composición con 229");
});

test("no se manda vacío, ni un `!` sin comando", () => {
  assert.equal(hasSomethingToSend("   \n ", 0), false);
  assert.equal(hasSomethingToSend("", 1), true, "un adjunto subido basta");
  assert.equal(hasSomethingToSend("hola", 0), true);
  assert.equal(hasSomethingToSend("! ", 0), false);
  assert.equal(hasSomethingToSend("!ls", 0), true);
});

test("arranca con el modo del workspace, no con el del proveedor", () => {
  assert.equal(initialMode(CLAUDE, "auto"), "auto");
  assert.equal(effectiveMode(CLAUDE, null, { workspace: "auto" }), "auto", "y es el que se manda");
  assert.equal(initialMode(CLAUDE, null), "ediciones", "sin modo del workspace, el del proveedor");
});

test("si el proveedor no sostiene el del workspace, cae al suyo por omisión", () => {
  assert.equal(initialMode(OTHER, "auto"), "manual");
  assert.equal(effectiveMode(OTHER, null, { workspace: "auto" }), "manual");
  assert.equal(effectiveMode(OTHER, "auto", { workspace: "auto" }), "manual", "uno elegido que este proveedor no tiene tampoco se manda");
  assert.equal(initialMode([], "auto"), null, "sin lista, nada que marcar");
});

test("lo que elige la persona manda sobre el del workspace", () => {
  assert.equal(effectiveMode(CLAUDE, "manual", { workspace: "auto" }), "manual");
  assert.equal(effectiveMode(CLAUDE, "ediciones", { workspace: "auto" }), "ediciones", "aunque sea el del proveedor");
});

test("una tarea abierta sigue con su modo guardado, no con el del workspace", () => {
  assert.equal(effectiveMode(CLAUDE, null, { saved: "manual", workspace: "auto" }), "manual");
  assert.equal(effectiveMode(OTHER, null, { saved: "auto", workspace: "ediciones" }), "ediciones", "si ya no lo sostiene, el del workspace");
  assert.equal(effectiveMode(CLAUDE, "auto", { saved: "manual" }), "auto", "lo elegido manda");
});

test("sin lista de modos (la máquina apagada): el de la tarea, o `auto`, que todo proveedor sostiene", () => {
  assert.equal(effectiveMode([], null, { workspace: "auto" }), "auto", "el del workspace, no `null`");
  assert.equal(effectiveMode([], null, { workspace: "manual" }), null, "uno que quizá no sostenga lo negaría el motor");
  assert.equal(effectiveMode([], null, { saved: "manual", workspace: "auto" }), "manual", "el guardado, que el motor baja si hace falta");
  assert.equal(effectiveMode([], null, {}), null);
});

test("el modo del workspace sale de la máquina que contesta, o del registro de la cuenta", () => {
  const registry: AccountWorkspace[] = [{ id: "w1", name: "Producto", projects: [], computers: ["vm"], settings: { default_permission_mode: "auto" } }];
  const hosts = [{ id: "vm" }, { id: "mac" }];
  const fromMachine = workspaceEntries(hosts, { vm: null, mac: [{ id: "w1", name: "Producto", default_permission_mode: "manual" }] }, registry);
  assert.equal(fromMachine[0].defaultPermissionMode, "manual");
  const asleep = workspaceEntries(hosts, { vm: null, mac: [] }, registry);
  assert.equal(asleep[0].defaultPermissionMode, "auto", "la VM dormida: el del registro");
  const none = workspaceEntries(hosts, { vm: null, mac: [{ id: "w1", name: "Producto" }] }, null);
  assert.equal(none[0].defaultPermissionMode, null);
});

const PROVIDERS: ProviderInfo[] = [
  { id: "codex", label: "Codex", available: true, driver: true },
  { id: "claude", label: "Claude", available: true, driver: true },
  { id: "opencode", label: "OpenCode", available: true, driver: true },
];

const SURFACES: Surface[] = [
  { id: "codex", provider: "codex", label: "Codex", catalogo: "todo", usable: false, marca: "Sin cuenta", porque: null },
  { id: "danil-credits-claude", provider: "claude", label: "Danil Credits", catalogo: "de_pago", usable: true, marca: null, porque: null },
  { id: "danil-credits", provider: "opencode", label: "Danil Credits", catalogo: "de_pago", usable: true, marca: null, porque: null },
  { id: "free-router-opencode", provider: "free-router-opencode", label: "Free Router", catalogo: "gratuitos", usable: true, marca: null, porque: null },
];

test("elige el proveedor de la primera superficie utilizable antes que un CLI sin cuenta", () => {
  assert.equal(resolveProvider(null, PROVIDERS, SURFACES), "claude");
  assert.equal(resolveProvider("codex", PROVIDERS, SURFACES), "codex", "una elección explícita manda");
  assert.equal(resolveProvider(null, [], SURFACES), "claude", "funciona aunque list_providers todavía no haya llegado");
  assert.equal(resolveProvider(null, PROVIDERS, []), "codex", "sin superficies cae al primer CLI instalado");
});

test("completa el modelo canónico de Danil Credits y Free Router y respeta cuentas personales", () => {
  const creditsClaude = SURFACES[1];
  const router = SURFACES[3];
  const personalClaude: Surface = { id: "claude", provider: "claude", label: "Claude", catalogo: "todo", usable: true, marca: null, porque: null };

  assert.equal(resolveSurfaceModel(creditsClaude, null, []), DANIL_CREDITS_MODEL, "Danil Credits nunca manda model null");
  assert.equal(resolveSurfaceModel(creditsClaude, "claude-sonnet-4-5", []), DANIL_CREDITS_MODEL, "si el modelo no es de Credits, cambia a Equilibrado");
  assert.equal(resolveSurfaceModel(creditsClaude, "danil-credits/danil/avanzado", []), "danil-credits/danil/avanzado", "conserva otro nivel válido de Credits");
  assert.equal(resolveSurfaceModel(router, null, []), FREE_ROUTER_MODEL, "Free Router completa su ruta gratuita");
  assert.equal(resolveSurfaceModel(personalClaude, null, []), null, "una cuenta personal sin modelo deja elegir al CLI");
  assert.equal(resolveSurfaceModel(personalClaude, DANIL_CREDITS_MODEL, [{ id: "claude-sonnet-4-5" }]), "claude-sonnet-4-5", "al salir de Credits no conserva su modelo");
});

test("encuentra Danil Credits aunque el proveedor activo sea otro", () => {
  assert.equal(creditsSurfaceOf(SURFACES, "codex")?.id, "danil-credits-claude");
  assert.equal(creditsSurfaceOf(SURFACES, "opencode")?.id, "danil-credits");
  assert.equal(creditsSurfaceOf(SURFACES.map((s) => ({ ...s, usable: false })), "claude"), undefined);
});
