import { QUEUE_DISPATCH_FEATURE, QUEUE_FEATURE } from "../model.ts";
import type { EngineScope, Machine, Route } from "../model.ts";

type Invoke = <T>(command: string, args: Record<string, unknown>, options?: Route) => Promise<T>;
type TurnState = { state?: string; turn_id?: string };
// How long Stop keeps trying a turn the engine cannot stop yet (`starting`, a relief).
const STOP_RETRY_MS = 2000;
const STOP_RETRY_EVERY_MS = 250;

/** How the window and the engine of each task share its queue and its Stop. */
export function createEngineQueue(env: {
  invoke: Invoke;
  machines: () => readonly Machine[];
  /** The envelope of the task's machine; none for this window's own. */
  machineOf: (session: string) => Route;
  /** Desk: this window reaches its own engine over IPC. */
  nativeWindow: () => boolean;
  /** The engine could not tie this Stop to the turn seen: tell the person to try again. */
  notStoppableYet: (session: string) => void;
}) {
  const rpc = env.invoke;
  // The machine of the task, as `documentosEn`: this window's machine has no id in its row.
  const rowOf = (session: string) => {
    const machine = env.machineOf(session)?.headers["x-terminus-machine"];
    return env.machines().find((m) => (machine ? m.id === machine : m.local));
  };
  // Remote machines advertise capabilities over their authenticated relay session.
  const announces = (session: string, feature: string) => rowOf(session)?.features?.includes(feature) === true;

  /**
   * The engine of the task dispatches its queue: it announces both features. Every
   * `save_queue` asks it to (`App.tsx`); without them the person sends it.
   */
  const engineCanDispatch = (session: string | null | undefined): boolean =>
    !!session && announces(session, QUEUE_FEATURE) && announces(session, QUEUE_DISPATCH_FEATURE);

  // `stop_turn_if` only where the call reaches the engine as the person: Desk to its own
  // engine over IPC. The account relay token and connect.danil.ai do not carry the person.
  const conditional = (session: string) =>
    env.nativeWindow() && !env.machineOf(session) && rowOf(session)?.local === true && announces(session, QUEUE_FEATURE);

  // The turn this window saw start, per task: Stop acts only on that one.
  const seen = new Map<string, string>();
  const turnOf = (scope: EngineScope) =>
    rpc<TurnState | null>("get_turn", { project: scope.project, session: scope.session }, scope.route);

  /** A turn started (`started`): its id is the one Stop may act on. */
  function turnStarted(scope: EngineScope) {
    seen.delete(scope.session);
    if (!conditional(scope.session)) return;
    void turnOf(scope).then((turn) => { if (turn?.turn_id) seen.set(scope.session, turn.turn_id); }, () => {});
  }

  /**
   * Stops the visible agent turn. `false`: the engine did not stop it (another turn, none,
   * or one it cannot stop yet). `chat.error.person_required` arrives as an error, never as a fallback.
   * A turn still `starting`, or in a relief, is retried for a short while with the same
   * `turn_id`; if the engine still cannot stop it, the person is told and may press again.
   */
  async function stopTurn(scope: EngineScope): Promise<false | undefined> {
    const args = { project: scope.project, session: scope.session };
    if (!conditional(scope.session)) {
      await rpc("stop_turn", args, scope.route);
      return undefined;
    }
    const deadline = Date.now() + STOP_RETRY_MS;
    let turnId = seen.get(scope.session);
    for (;;) {
      if (!turnId) {
        const turn = await turnOf(scope);
        turnId = turn?.turn_id;
        if (!turnId && (!turn || turn.state === "idle")) break;
      }
      if (turnId) {
        const reply = await rpc<{ outcome?: string } | null>("stop_turn_if", { ...args, turnId }, scope.route);
        if (reply?.outcome === "stop_requested" || reply?.outcome === "closing") return undefined;
        if (reply?.outcome !== "not_controllable") break;
      }
      if (Date.now() >= deadline) {
        env.notStoppableYet(scope.session);
        return false;
      }
      await new Promise((resolve) => setTimeout(resolve, STOP_RETRY_EVERY_MS));
    }
    seen.delete(scope.session);
    return false;
  }

  return {
    engineCanDispatch, turnStarted, stopTurn,
    /** The turn closed (`done`): the next Stop reads the turn again. */
    turnClosed: (session: string) => { seen.delete(session); },
    /** Releases a held queue: it goes out now if the task is free, else when its turn closes. */
    resumeQueue: (scope: EngineScope) => rpc("queue_resume", { project: scope.project, session: scope.session }, scope.route),
  };
}
