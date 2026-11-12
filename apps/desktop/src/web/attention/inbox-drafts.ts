import { createSignal } from 'solid-js';
import type { InboxSession } from '../../../../../packages/attention/src/inbox.ts';

type DraftValue = { text: string; pending: boolean; notice: string; error: boolean; uncertain: boolean };
const empty = (): DraftValue => ({ text: '', pending: false, notice: '', error: false, uncertain: false });
export function createInboxDraft() {
  const [value, set] = createSignal(empty());
  const controller = new AbortController();
  return { value, set, signal: controller.signal, invalidate() { controller.abort(); set(empty()); } };
}
export type InboxDraft = ReturnType<typeof createInboxDraft>;
type DraftSession = InboxSession & { subscribe?: (clear: () => void) => () => void };
const sessions = new WeakMap<InboxSession, Map<string, InboxDraft>>();

/** Solo memoria de la sesión: navegar conserva borradores; salir los borra e invalida envíos. */
export function inboxDraft(session: DraftSession, account: number, conversation: number): InboxDraft {
  let drafts = sessions.get(session);
  if (!drafts) {
    drafts = new Map();
    sessions.set(session, drafts);
    const current = drafts;
    session.subscribe?.(() => { for (const draft of current.values()) draft.invalidate(); current.clear(); });
  }
  const key = `${account}:${conversation}`;
  let draft = drafts.get(key);
  if (!draft) { draft = createInboxDraft(); drafts.set(key, draft); }
  return draft;
}
