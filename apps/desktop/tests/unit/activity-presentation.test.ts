import assert from "node:assert/strict";
import test from "node:test";
import "../helpers/catalog.ts";
import { currentActivityAction, observedActivityAction, presentActivity } from "../../../../packages/features/chat/src/model/activityPresentation.ts";
import { narrateStep, reasoningHeadline } from "../../../../packages/features/chat/src/model/activityNarration.ts";
import { pasoDe } from "../../src/lib/steps.ts";

test("stop request suppresses animation and shows stopping caption before authoritative completion", () => {
  const action = { kind: "step" as const, step: pasoDe("command_execution", "pnpm test:unit") };
  assert.deepEqual(presentActivity({ active: true, stopping: true, action }), { label: "Deteniendo…", animate: false });
  assert.deepEqual(presentActivity({ active: false, action }), { label: "Trabajo", animate: false });
});

test("a single observed action names its subject without aggregate counts and shows parallel count only when > 1", () => {
  const action = observedActivityAction({ role: "system", text: "Read", paso: { ...pasoDe("Read", "src/features/chat/Chat.tsx"), corriendo: true } });
  assert.equal(presentActivity({ active: true, action }).label, "Leyendo Chat.tsx");
  assert.equal(presentActivity({ active: true, action, runningSteps: 3 }).label, "Leyendo Chat.tsx (+2)");
  assert.equal(presentActivity({ active: true, action: observedActivityAction({ role: "agent", text: "", razonamiento: [{ text: "x" }] }) }).label, "Pensando…");
  assert.equal(presentActivity({ active: true, action: observedActivityAction({ role: "agent", text: "previous answer", razonamiento: [{ text: "new reasoning" }] }, "thinking") }).label, "Pensando…");
});

test("unknown recovery cannot invent thinking or a command from queue inputs", () => {
  assert.equal(observedActivityAction({ role: "user", text: "continue" }), null);
  assert.equal(presentActivity({ active: true }).label, "Preparando…");
  assert.equal(presentActivity({ active: true, blocked: true }).animate, false);
  assert.equal(presentActivity({ active: true, paused: true }).animate, false);
});

for (const corriendo of [false, undefined]) test(`a completed command is not the current work of an active turn (${corriendo})`, () => {
  const action = { kind: "step" as const, step: { ...pasoDe("command_execution", "pwd"), corriendo } };
  assert.deepEqual(presentActivity({ active: true, action }), { label: "Pensando…", animate: true });
  assert.deepEqual(presentActivity({ active: false, action }), { label: "Trabajo", animate: false });
  assert.deepEqual(presentActivity({ active: true, stopping: true, action }), { label: "Deteniendo…", animate: false });
  assert.deepEqual(presentActivity({ active: true, blocked: true, action }), { label: "Actividad", animate: false });
  assert.equal(presentActivity({ active: true, action: { kind: "thinking" } }).label, "Pensando…");
});


test("finished activity uses duration on success and activity-before-error on failure", () => {
  assert.deepEqual(presentActivity({ active: false, duration: "1m 4s" }), { label: "Trabajó durante 1m 4s", animate: false });
  assert.deepEqual(presentActivity({ active: false, duration: null }), { label: "Trabajo", animate: false });
  assert.equal(presentActivity({ active: false, stopping: true, duration: "1m 4s" }).label, "Trabajó durante 1m 4s");
  assert.deepEqual(presentActivity({ active: false, outcome: "failed", duration: "1m 4s" }), { label: "Actividad antes del error", animate: false });
});

test("a stop quiets current work without claiming execution finished or fabricating duration", () => {
  const action = { kind: "step" as const, step: { ...pasoDe("command_execution", "pwd"), corriendo: true } };
  assert.deepEqual(presentActivity({ active: true, stopping: true, blocked: true, action }), { label: "Deteniendo…", animate: false });
  assert.equal(action.step.corriendo, true);
  assert.deepEqual(presentActivity({ active: true }), { label: "Preparando…", animate: true });
});


test("completed tools resume thinking unless another tool remains active", () => {
  const finished = pasoDe("Bash", "pwd", { corriendo: false });
  const running = pasoDe("Read", "large-file.ts", { corriendo: true });
  assert.deepEqual(currentActivityAction({ kind: "step", step: finished }, [finished]), { kind: "thinking" });
  assert.deepEqual(currentActivityAction({ kind: "step", step: finished }, [running, finished]), { kind: "step", step: running });
  assert.deepEqual(currentActivityAction({ kind: "responding" }, [running]), { kind: "responding" });
  assert.equal(currentActivityAction(null, []), null);
});

test("streaming reasoning headlines update live from headings, explicit summaries, or completed sentences", () => {
  const streamed = [
    { text: "**Revisando la configuración adecuada**\nPrimero veo wrangler.toml.\n\n**Verificando el despliegue en beta**\nAhora reviso los scripts." },
  ];
  // Live streaming picks the latest bold heading.
  const action = observedActivityAction({ role: "agent", text: "", razonamiento: streamed }, "thinking");
  assert.equal(presentActivity({ active: true, action }).label, "Verificando el despliegue en beta…");
  // Collapsed row picks the first explicit heading and hides plain body-only reasoning.
  assert.equal(reasoningHeadline(streamed, { latest: false, allowSentence: false }), "Revisando la configuración adecuada");
  assert.equal(reasoningHeadline([{ text: "Razonamiento separado de los mensajes públicos." }], { latest: false, allowSentence: false }), null);
  // Live streaming falls back to the first completed sentence when there are no headings.
  assert.equal(
    presentActivity({
      active: true,
      action: { kind: "thinking" },
      reasoning: [{ text: "Voy a revisar la configuración de Cloudflare.\nLuego valido el build." }],
    }).label,
    "Voy a revisar la configuración de Cloudflare…",
  );
  // Explicit server/engine summary takes highest priority.
  assert.equal(
    reasoningHeadline([{ text: "raw", summary: "Analizando métricas de latencia" }], { latest: true, allowSentence: false }),
    "Analizando métricas de latencia",
  );
});

test("commands, web lookups, and explicit step summaries render as personalized phrases", () => {
  assert.equal(
    presentActivity({ active: true, action: { kind: "step", step: pasoDe("command_execution", "git status", { corriendo: true }) } }).label,
    "Revisando cambios en git…",
  );
  assert.equal(
    presentActivity({
      active: true,
      action: { kind: "step", step: pasoDe("Bash", "node --test apps/desktop/tests/unit/paste.test.ts", { corriendo: true }) },
      runningSteps: 2,
    }).label,
    "Corriendo pruebas en paste.test.ts… (+1)",
  );
  assert.equal(narrateStep(pasoDe("Bash", "pnpm -C apps/desktop exec vite build"), { live: false }), "Compiló el proyecto");
  assert.equal(narrateStep(pasoDe("Bash", 'rg "scrollTop" packages/features/chat'), { live: true }), "Buscando «scrollTop» en el código…");
  assert.equal(narrateStep(pasoDe("WebFetch", "https://docs.cloudflare.com/workers/"), { live: true }), "Consultando docs.cloudflare.com…");
  assert.equal(narrateStep(pasoDe("Bash", "custom-script", { summary: "Validando certificados TLS" }), { live: true }), "Validando certificados TLS…");
  assert.equal(narrateStep(pasoDe("Bash", "custom-script", { summary: "Validando certificados TLS" }), { live: false }), "Validando certificados TLS");
});
