import "../../src/locales/catalogs";
import "../../../../packages/ui/src/styles/global.css";
import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { RegistroDeTrabajo } from "../../../../packages/features/chat/src/screens/activity/TurnActivity";
import { ComposerAction } from "../../../../packages/features/chat/src/components/composer/ComposerAction";
import { PendingHandoff } from "../../../../packages/features/chat/src/screens/thread/PendingHandoff";
import type { HandoffPresentation } from "../../../../packages/ui/src/lib/handoff";
import { TaskUserBubble } from "../../../../packages/features/chat/src/components/TaskChatPresentation";
import { observedActivityAction } from "../../../../packages/features/chat/src/model/activityPresentation";
import { pasoDe, type Paso } from "../../src/lib/steps";

document.documentElement.dataset.theme = new URLSearchParams(location.search).get("theme") ?? "dark";

const rehydrated = new URLSearchParams(location.search).get("mode") === "rehydrated";

function Fixture() {
  const [handoff, setHandoff] = createSignal<HandoffPresentation>(null);
  const [draft, setDraft] = createSignal("");
  const [submissions, setSubmissions] = createSignal(0);
  const [stops, setStops] = createSignal(0);
  const [stopping, setStopping] = createSignal(false);
  const [paused, setPaused] = createSignal(false);
  const [active, setActive] = createSignal(true);
  const [open, setOpen] = createSignal(false);
  const [steps, setSteps] = createSignal<Paso[]>(rehydrated ? [] : [{ ...pasoDe("command_execution", "pnpm test:unit"), corriendo: true }]);
  const presentation = { get stopping() { return stopping(); }, get latestAction() { return observedActivityAction({ role: "system", text: "", paso: steps().at(-1) }); } };
  return <main class="max-w-3xl bg-surface p-6 text-neutral-950">
    <nav class="mb-4 flex flex-wrap gap-3 text-sm">
      <button data-stop onClick={() => setStopping(true)}>Stop</button>
      <button data-pause onClick={() => setPaused(true)}>Pause</button>
      <button data-done onClick={() => setActive(false)}>Done</button>
      <button data-read onClick={() => setSteps([...steps(), { ...pasoDe("Read", "src/features/chat/Chat.tsx"), corriendo: true }])}>Read</button>
      <button data-reset onClick={() => { setStopping(false); setActive(true); }}>Resume</button>
    </nav>
    <p data-existing-response class="mb-3">Previously loaded response remains visible.</p>
    <nav class="my-3 flex gap-3 text-sm">
      <button data-handoff-queued onClick={() => setHandoff({ phase: "waiting-close", pendingMessage: { text: "Pending replacement" } })}>Queue</button>
      <button data-handoff-submit onClick={() => setHandoff({ phase: "submitting" })}>Dispatch</button>
      <button data-handoff-start onClick={() => setHandoff({ phase: "awaiting-start" })}>Await</button>
      <button data-handoff-complete onClick={() => setHandoff(null)}>Started</button>
    </nav>
    <PendingHandoff handoff={handoff()} bubble={TaskUserBubble} userClass="ml-auto max-w-[80%]" miniatura={async () => null} />
    <form data-composer-fixture class="my-4 flex gap-2" onSubmit={event => { event.preventDefault(); setSubmissions(value => value + 1); setDraft(""); }}>
      <input aria-label="Draft during stop" value={draft()} onInput={event => setDraft(event.currentTarget.value)} />
      <ComposerAction busy stopping={stopping()} hasMessage={Boolean(draft())} canSend onStop={() => { setStops(value => value + 1); setStopping(true); }} />
      <output data-send-count>{submissions()}</output><output data-stop-count>{stops()}</output>
    </form>
    <RegistroDeTrabajo {...presentation} animando={!rehydrated && !paused()} observed pasos={steps()} corriendo={active()} abierto={open()} onAlternar={setOpen} />
  </main>;
}

render(() => <Fixture />, document.getElementById("root")!);
