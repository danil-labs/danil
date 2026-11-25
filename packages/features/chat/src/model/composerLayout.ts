export type ComposerLayoutInput = {
  /** Number of messages currently in the thread. */
  messageCount: number;
  /** Conversation id: "" for a blank new-task draft, provisional or real id once started. */
  conversation: string;
  /** Pre-created task with zero turns that has not started and is not loading. */
  unstarted: boolean;
  /** A turn, send, or shell command is starting or running in this conversation. */
  busy: boolean;
  /** Active turn is stopping. */
  stopping: boolean;
  /** Persisted transcript is currently loading. */
  loading: boolean;
  /** Any observed turn activity is present in this conversation. */
  hasActivity: boolean;
  /** A live shell command card is attached to this conversation. */
  hasTerminal: boolean;
  /** Waiting for the target machine to wake or connect for a send. */
  hasMachineWait: boolean;
  /** A queued handoff is pending on this conversation. */
  hasHandoff: boolean;
};

export type ComposerLayout = {
  /** Thread has no messages and no send, turn, command, or load in flight. */
  empty: boolean;
  /** Composer sits centered in the empty-task state (blank draft or unstarted task). */
  centered: boolean;
  /** Project/folder picker row is rendered under the composer. */
  showProjectPicker: boolean;
};

/**
 * Single owner for whether the composer is empty, centered, and showing the
 * folder picker. Any in-flight send/turn/load or started conversation hides
 * the folder picker and anchors the composer at the bottom in one step.
 */
export function computeComposerLayout(input: ComposerLayoutInput): ComposerLayout {
  const inFlight =
    input.busy
    || input.stopping
    || input.loading
    || input.hasActivity
    || input.hasTerminal
    || input.hasMachineWait
    || input.hasHandoff;
  const empty = input.messageCount === 0 && !inFlight;
  const centered = empty && (input.conversation === "" || input.unstarted);
  return { empty, centered, showProjectPicker: centered };
}
