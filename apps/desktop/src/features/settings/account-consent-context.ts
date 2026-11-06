export type AccountConsentSession = { account_id: string; session_id: string };

/** Keeps asynchronous consent responses tied to the session and the latest request. */
export function createAccountConsentContext() {
  let session: AccountConsentSession | null = null;
  let generation = 0;

  function setSession(next: AccountConsentSession | null) {
    if (session?.account_id === next?.account_id && session?.session_id === next?.session_id) return;
    session = next ? { ...next } : null;
    generation += 1;
  }

  function invalidate() {
    generation += 1;
  }

  function begin() {
    const expected = session && { ...session };
    const request = ++generation;
    return (response: AccountConsentSession) =>
      expected !== null && request === generation &&
      session?.account_id === expected.account_id && session.session_id === expected.session_id &&
      response.account_id === expected.account_id && response.session_id === expected.session_id;
  }

  return { setSession, invalidate, begin };
}
