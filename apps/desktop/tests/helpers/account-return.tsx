import "../../src/locales/catalogs";
import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { setCapabilities } from "../../src/lib/platform";
import { AccountReturnFeedback } from "../../src/features/shell/AccountReturnFeedback";
import { SessionAddEntries } from "../../src/features/shell/SessionAddMenu";
import { NewAccountTile } from "../../src/features/shell/NewAccountTile";
import { accountReturn, setNewAccountTiles } from "../../src/features/shell/account-return-state";
import { createSessionContexts } from "../../src/features/shell/session-contexts";
import { ToastStack } from "../../src/ui/Toast";

export function mountReturn(root: HTMLElement) {
  setCapabilities({ nativeWindow: true } as never);
  accountReturn.clear(); setNewAccountTiles([]);
  let finish: (value: unknown) => void = () => {};
  let reject: (cause: unknown) => void = () => {};
  let status = { state: "connected", sessions: [] as unknown[] };
  let starts = 0; let closes = 0;
  const opened: string[] = [];
  const [rev, update] = createSignal(0);
  const sessions = createSessionContexts(async (name: string) => {
    if (name === "danil_session_status") return structuredClone(status) as never;
    if (name === "danil_sign_in") { starts++; return await new Promise((resolve, fail) => { finish = resolve; reject = fail; }) as never; }
    throw new Error(name);
  }, () => update((n) => n + 1));
  const rail = { sessions, groups: () => (rev(), sessions.groups()?.map((g) => ({ ...g, available: [{ id: "first" }, { id: "second" }], added: new Set(["first", "second"]) }))) } as never;
  const dispose = render(() => <><ToastStack /><SessionAddEntries sessions={rail} signedIn onStep={() => {}} onClose={() => closes++} /><AccountReturnFeedback sessions={rail} onOpen={(id) => opened.push(id)} /><NewAccountTile id="first"><button data-workspace-tile="first"><span class="danil-mark" data-active="">First</span></button></NewAccountTile></>, root);
  return {
    opened, dispose, starts: () => starts, closes: () => closes,
    success: () => { status = { state: "connected", sessions: [{ family: "new", email: "new@example.com", contexts: [{ context_id: "ctx", org: "org", org_name: "Acme", plan: "paid" }] }] }; finish(status); },
    fail: (detail: string) => reject({ detail }),
  };
}
